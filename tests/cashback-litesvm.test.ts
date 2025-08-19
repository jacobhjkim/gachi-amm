import { beforeAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BN, Program } from '@coral-xyz/anchor'
import { address } from '@solana/kit'
import {
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from '@solana/spl-token'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { LiteSVM } from 'litesvm'
import { AMM_PROGRAM_ADDRESS } from '~/clients'
import IDL from '../target/idl/amm.json'
import type { Amm } from '../target/types/amm.ts'
import { getCurvePda, getCurveVaultPda, getMetadataPda } from './utils/accounts.ts'
import { DAMM_V2_PROGRAM_ID, DEFAULT_CONFIG_ARGS, METAPLEX_PROGRAM_ID } from './utils/constants.ts'

function loadKeypairFromFile(filePath: string): Keypair {
  const parsedFilePath = filePath.startsWith('~/') ? path.join(os.homedir(), filePath.slice(2)) : filePath

  const keypairData = JSON.parse(fs.readFileSync(parsedFilePath, 'utf-8'))
  return Keypair.fromSecretKey(new Uint8Array(keypairData))
}

async function createQuoteMint(svm: LiteSVM, payer: Keypair): Promise<Keypair> {
  const quoteMint = new Keypair()
  const rentExemptBalance = svm.minimumBalanceForRentExemption(BigInt(getMintLen([])))

  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: quoteMint.publicKey,
    lamports: Number(rentExemptBalance),
    space: getMintLen([]),
    programId: TOKEN_PROGRAM_ID,
  })

  const initMintIx = createInitializeMint2Instruction(
    quoteMint.publicKey,
    9, // 9 decimals like SOL
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority
    TOKEN_PROGRAM_ID,
  )

  const tx = new Transaction()
  tx.recentBlockhash = svm.latestBlockhash()
  tx.add(createAccountIx, initMintIx)
  tx.sign(payer, quoteMint)

  svm.sendTransaction(tx)
  return quoteMint
}

describe('cashback litesvm tests', () => {
  let svm: LiteSVM
  let payer: Keypair
  let program: Program<Amm>
  let quoteMint: Keypair

  beforeAll(async () => {
    svm = new LiteSVM()

    const programId = new PublicKey(AMM_PROGRAM_ADDRESS)
    svm.addProgramFromFile(programId, './target/deploy/amm.so')
    const dammV2ProgramId = new PublicKey(DAMM_V2_PROGRAM_ID)
    svm.addProgramFromFile(dammV2ProgramId, './tests/fixtures/damm_v2.so')
    const metaplexProgramId = new PublicKey(METAPLEX_PROGRAM_ID)
    svm.addProgramFromFile(metaplexProgramId, './tests/fixtures/metaplex.so')

    const provider = new LiteSVMProvider(svm)
    program = new Program(IDL as Amm, provider)

    payer = loadKeypairFromFile('~/.config/solana/id.json')
    svm.airdrop(new PublicKey(payer.publicKey), BigInt(100 * LAMPORTS_PER_SOL))

    quoteMint = await createQuoteMint(svm, payer)
  })

  test('basic test', () => {
    const receiver = PublicKey.unique()
    const blockhash = svm.latestBlockhash()
    const transferLamports = 1_000_000n
    const ixs = [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: receiver,
        lamports: transferLamports,
      }),
    ]
    const tx = new Transaction()
    tx.recentBlockhash = blockhash
    tx.add(...ixs)
    tx.sign(payer)
    svm.sendTransaction(tx)
    const balanceAfter = svm.getBalance(receiver)
    expect(balanceAfter).toBe(transferLamports)
  })

  // TODO: implement, maybe we can just set liteSVM's internal state. instead of doing this manually
  test.skip('time travel to get the cashback', async () => {
    /**************** create config ****************/
    const configKeyPair = new Keypair()
    const feeClaimer = new Keypair()
    svm.airdrop(feeClaimer.publicKey, BigInt(LAMPORTS_PER_SOL))

    await program.methods
      .createConfig({
        ...DEFAULT_CONFIG_ARGS,
        migrationBaseThreshold: new BN(DEFAULT_CONFIG_ARGS.migrationBaseThreshold),
        migrationQuoteThreshold: new BN(DEFAULT_CONFIG_ARGS.migrationQuoteThreshold),
        initialVirtualQuoteReserve: new BN(DEFAULT_CONFIG_ARGS.initialVirtualQuoteReserve),
        initialVirtualBaseReserve: new BN(DEFAULT_CONFIG_ARGS.initialVirtualBaseReserve),
      })
      .accounts({
        config: configKeyPair.publicKey,
        feeClaimer: feeClaimer.publicKey,
        quoteMint: quoteMint.publicKey,
        payer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        program: program.programId,
      })
      .signers([payer, configKeyPair])
      .rpc()

    const configData = await program.account.config.fetch(configKeyPair.publicKey)
    expect(configData.quoteMint.toString()).toBe(quoteMint.publicKey.toString())

    /**************** deploy bonding curve ****************/
    const baseMintKeyPair = new Keypair()
    const [curvePda] = await getCurvePda({
      configAddress: address(configKeyPair.publicKey.toString()),
      baseMint: address(baseMintKeyPair.publicKey.toString()),
      quoteMint: address(quoteMint.publicKey.toString()),
      programId: AMM_PROGRAM_ADDRESS,
    })
    const [[baseVaultPda], [quoteVaultPda], [metadataPda]] = await Promise.all([
      getCurveVaultPda({
        curvePda,
        mint: address(baseMintKeyPair.publicKey.toString()),
        programId: AMM_PROGRAM_ADDRESS,
      }),
      getCurveVaultPda({
        curvePda,
        mint: address(quoteMint.publicKey.toString()),
        programId: AMM_PROGRAM_ADDRESS,
      }),
      getMetadataPda({
        mint: address(baseMintKeyPair.publicKey.toString()),
      }),
    ])

    const curveParams = {
      name: 'Test Token',
      symbol: 'TEST',
      uri: 'https://test.uri',
      feeType: 0, // 0: project/creator
    }

    await program.methods
      .createCurveWithSplToken(curveParams)
      .accounts({
        creator: payer.publicKey,
        config: configKeyPair.publicKey,
        baseMint: baseMintKeyPair.publicKey,
        quoteMint: quoteMint.publicKey,
        curve: curvePda,
        metadata: metadataPda,
        tokenQuoteProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer, baseMintKeyPair])
      .rpc()

    const bondingCurveData = await program.account.bondingCurve.fetch(curvePda)
    expect(bondingCurveData.baseMint.toString()).toBe(baseMintKeyPair.publicKey.toString())
    console.log('bonding curve created')

    /**************** Create cashback account for trader ****************/
    // Create trader and fund them
    const trader = new Keypair()
    svm.airdrop(trader.publicKey, BigInt(10 * LAMPORTS_PER_SOL))

    const [cashbackPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('cashback'), trader.publicKey.toBuffer()],
      program.programId,
    )

    await program.methods
      .createCashback()
      .accounts({
        payer: trader.publicKey,
        wsolMint: quoteMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc()

    console.log('cashback creation done')

    /**************** swap ****************/
    const traderBaseMintAta = getAssociatedTokenAddressSync(
      baseMintKeyPair.publicKey,
      trader.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    )
    const traderQuoteAta = getAssociatedTokenAddressSync(quoteMint.publicKey, trader.publicKey)
    const cashbackQuoteVault = getAssociatedTokenAddressSync(quoteMint.publicKey, cashbackPda)

    // Create ATAs
    // const createTraderBaseAtaIx = createAssociatedTokenAccountInstruction(
    //   trader.publicKey,
    //   traderBaseMintAta,
    //   trader.publicKey,
    //   baseMintKeyPair.publicKey,
    //   TOKEN_PROGRAM_ID,
    // )
    //
    // const createTraderWsolAtaIx = createAssociatedTokenAccountInstruction(
    //   trader.publicKey,
    //   traderQuoteAta,
    //   trader.publicKey,
    //   quoteMint.publicKey,
    //   TOKEN_PROGRAM_ID,
    // )
    //
    // const createCashbackWsolVaultIx = createAssociatedTokenAccountInstruction(
    //   trader.publicKey,
    //   cashbackQuoteVault,
    //   cashbackPda,
    //   quoteMint.publicKey,
    //   TOKEN_PROGRAM_ID,
    // )

    // const createAtasTx = new Transaction()
    // createAtasTx.recentBlockhash = svm.latestBlockhash()
    // createAtasTx.add(createTraderBaseAtaIx, createTraderWsolAtaIx, createCashbackWsolVaultIx)
    // createAtasTx.sign(trader)
    // svm.sendTransaction(createAtasTx)

    // Fund trader's quote token account for swapping
    console.log('prepare mint to trader quote ATA done')
    const mintToTx = new Transaction().add(
      createMintToInstruction(
        quoteMint.publicKey,
        traderQuoteAta,
        trader.publicKey,
        BigInt(10 * LAMPORTS_PER_SOL), // Mint 10 WSOL
        [],
      ),
    )
    mintToTx.recentBlockhash = svm.latestBlockhash()
    mintToTx.sign(trader)
    svm.sendTransaction(mintToTx)
    console.log('mint to trader quote ATA done')

    const traderQuoteBalance = svm.getAccount(traderQuoteAta)
    console.log('Trader quote balance:', traderQuoteBalance)

    /**************** swap - buy tokens to generate cashback ****************/
    const swapParams = {
      amountIn: new BN(LAMPORTS_PER_SOL),
      minimumAmountOut: new BN(0),
      tradeDirection: { quoteToBase: {} },
    }

    await program.methods
      .swap(swapParams)
      .accounts({
        curve: curvePda,
        inputTokenAccount: traderQuoteAta,
        outputTokenAccount: traderBaseMintAta,
        baseMint: baseMintKeyPair.publicKey,
        quoteMint: quoteMint.publicKey,
        payer: trader.publicKey,
        tokenBaseProgram: TOKEN_PROGRAM_ID,
        tokenQuoteProgram: TOKEN_PROGRAM_ID,
        cashback: cashbackPda,
        cashbackTokenAccount: cashbackQuoteVault,
        l1ReferralCashbackTokenAccount: null,
        l2ReferralCashbackTokenAccount: null,
        l3ReferralCashbackTokenAccount: null,
      })
      .signers([trader])
      .rpc()

    // Check cashback vault balance after swap
    const cashbackData = await program.account.cashbackAccount.fetch(cashbackPda)
    console.log(cashbackData)
  })
})
