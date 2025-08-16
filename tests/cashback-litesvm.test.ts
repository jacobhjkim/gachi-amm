import { beforeAll, describe, expect, test } from 'bun:test'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { LiteSVM } from 'litesvm'
import { AMM_PROGRAM_ADDRESS } from '~/clients'

describe('cashback litesvm tests', () => {
  let svm: LiteSVM
  let payer: Keypair

  beforeAll(() => {
    svm = new LiteSVM()
    const programId = new PublicKey(AMM_PROGRAM_ADDRESS)
    svm.addProgramFromFile(programId, './target/deploy/amm.so')
    payer = new Keypair()
    svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL))
  })

  // TODO: implement
  test('time travel to get the cashback', () => {
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
})
