import { expect } from 'bun:test'
import { AccountRole, pipe, prependTransactionMessageInstructions } from '@solana/kit'
import {
  type Address,
  type KeyPairSigner,
  address,
  airdropFactory,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  lamports,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit'
import { LAMPORTS_PER_SOL, type SolanaClient, createSolanaClient, createTransaction, getExplorerLink } from 'gill'
import { loadKeypairSignerFromFile } from 'gill/node'
import { TOKEN_2022_PROGRAM_ADDRESS, getSetComputeUnitLimitInstruction, getTransferSolInstruction } from 'gill/programs'
import {
  TOKEN_PROGRAM_ADDRESS,
  getAssociatedTokenAccountAddress,
  getCloseAccountInstruction,
  getSyncNativeInstruction,
} from 'gill/programs/token'
import {
  AMM_PROGRAM_ADDRESS,
  type CreateConfigInstructionDataArgs,
  fetchBondingCurve,
  fetchCashbackAccount,
  fetchConfig,
  getBondingCurveSize,
  getCashbackAccountSize,
  getClaimCashbackInstructionAsync,
  getClaimCreatorFeeInstructionAsync,
  getClaimProtocolFeeInstructionAsync,
  getCreateCashbackInstructionAsync,
  getCreateConfigInstructionAsync,
  getCreateCurveWithSplTokenInstructionAsync,
  getMigrateDammV2InstructionAsync,
  getSwapInstructionAsync,
  getUpdateCashbackTierInstructionAsync,
} from '~/clients'
import { fetchPool, getSwapInstructionAsync as getDammSwapInstructionAsync } from '../../clients/damm/src/generated'
import {
  deriveDammV2EventAuthority,
  deriveDammV2MigrationMetadataAddress,
  deriveDammV2PoolAddress,
  deriveDammV2PoolAuthority,
  deriveDammV2TokenVaultAddress,
  derivePositionAddress,
  derivePositionNftAccount,
  getCashbackAccounts,
  getCurveAuthority,
  getCurvePda,
  getCurveVaultPda,
  getMetadataPda,
  getUserCashbackAccountPda,
  prepareSwapParams,
  prepareTokenAccounts,
} from './accounts.ts'
import {
  DAMM_CONFIG_ACCOUNT,
  DAMM_V2_PROGRAM_ID,
  DEFAULT_CONFIG_ARGS,
  DEFAULT_TOKEN,
  TRADER_INITIAL_SOL_AMOUNT,
  WSOL_MINT,
} from './constants.ts'
import type { TradeDirection } from './swap-quote.ts'

const network = 'localnet' as const

// Error code mapping for better debugging
const _ERROR_CODES: Record<number, string> = {
  6000: 'Unauthorized',
  6001: 'InvalidFeeRecipient',
  6002: 'InvalidAmmConfig',
  6003: 'InvalidInputForAmmConfigUpdate',
  6004: 'CreateBondingCurveDisabled',
  6005: 'InvalidBodingCurve',
  6006: 'InvalidGraduationState',
  6007: 'InsufficientFunds',
  6008: 'SlippageExceeded',
  6009: 'AlreadyComplete',
  6010: 'MathOverflow',
  6011: 'TradeAmountTooSmall',
  6012: 'NotEnoughToken',
  6013: 'InvalidTokenName',
  6014: 'InvalidTokenSymbol',
  6015: 'InvalidTokenUri',
  6016: 'DivisionByZero',
  6017: 'ClaimCooldownNotMet',
  6018: 'NoCashbackToClaim',
  6019: 'AccountNotInactive',
  6020: 'InvalidReferrerHierarchy',
}

export class TestContextClass {
  private constructor(
    public readonly programId: Address,
    public readonly owner: KeyPairSigner,
    public readonly rpc: SolanaClient<typeof network>['rpc'],
    public readonly rpcSubscriptions: SolanaClient<typeof network>['rpcSubscriptions'],
    public readonly sendAndConfirmTransaction: SolanaClient<typeof network>['sendAndConfirmTransaction'],
    public network: string,
    public currentConfig: Address | null = null,
    public currentFeeClaimer: KeyPairSigner | null = null,
  ) {}

  // Static factory method for async initialization
  static async create(): Promise<TestContextClass> {
    // Get test keypairs
    const owner = await loadKeypairSignerFromFile()
    // const owner = await generateKeyPairSigner()

    const { rpc, rpcSubscriptions, sendAndConfirmTransaction } = createSolanaClient({ urlOrMoniker: network })

    const programId = AMM_PROGRAM_ADDRESS

    // @ts-expect-error
    await airdropFactory({ rpc, rpcSubscriptions })({
      commitment: 'confirmed',
      lamports: lamports(100n * BigInt(LAMPORTS_PER_SOL)),
      recipientAddress: owner.address,
    })

    const { value: ownerBalance } = await rpc.getBalance(owner.address).send()

    console.log(`new test context:
  network: ${network}
  owner: ${owner.address.toString()}
  owner balance: ${ownerBalance}
  deployed program ID: ${programId.toString()}
  ======================================
`)

    return new TestContextClass(programId, owner, rpc, rpcSubscriptions, sendAndConfirmTransaction, network)
  }

  /******************************* Basic Solana Helper functions *******************************/
  async airdrop(recipient: Address, amount: bigint = BigInt(LAMPORTS_PER_SOL)): Promise<void> {
    await airdropFactory({
      rpc: this.rpc,
      rpcSubscriptions: this.rpcSubscriptions,
    })({
      commitment: 'confirmed',
      lamports: lamports(amount),
      recipientAddress: recipient,
    })
  }

  async createTestTrader(initialSolAmount: bigint = TRADER_INITIAL_SOL_AMOUNT): Promise<KeyPairSigner> {
    const trader = await generateKeyPairSigner()
    try {
      await this.airdrop(trader.address, initialSolAmount)
    } catch (error) {
      console.log(`Failed to airdrop ${initialSolAmount} SOL to trader ${trader.address.toString()}:`)
      console.error(error)
      throw error
    }
    return trader
  }

  async getBalance(address: Address) {
    const { value: balance } = await this.rpc.getBalance(address).send()
    return balance
  }

  async getTokenBalance({ address, mint }: { address: Address; mint: Address }) {
    const tokenAccount = await getAssociatedTokenAccountAddress(mint, address, TOKEN_PROGRAM_ADDRESS)
    try {
      const { value: tokenAccountBalance } = await this.rpc.getTokenAccountBalance(tokenAccount).send()
      return BigInt(tokenAccountBalance.amount)
    } catch (error) {
      console.log(`Token account ${tokenAccount.toString()} does not exist for address ${address.toString()}:`, error)
      // If the account doesn't exist, return 0
      return 0n
    }
  }

  async getTokenAccountBalance(tokenAccount: Address) {
    try {
      const { value: tokenAccountBalance } = await this.rpc.getTokenAccountBalance(tokenAccount).send()
      return BigInt(tokenAccountBalance.amount)
    } catch (error) {
      // If the account doesn't exist, return 0
      return 0n
    }
  }

  /******************************* Admin functions *******************************/
  async getConfigData({ configAddress }: { configAddress?: Address }) {
    const config = configAddress ? address(configAddress) : this.currentConfig
    return await fetchConfig(this.rpc, config)
  }

  async createConfigOnce(
    args: CreateConfigInstructionDataArgs,
    quoteMint: Address = WSOL_MINT,
    signer?: KeyPairSigner,
  ) {
    if (this.currentConfig) {
      console.log('AMM config already initialized:', this.currentConfig)
      return { configAddress: this.currentConfig, feeClaimer: this.currentFeeClaimer }
    }

    const { configAddress, feeClaimer } = await this.createConfig(args, quoteMint, signer)
    this.currentConfig = configAddress
    this.currentFeeClaimer = feeClaimer
    return { configAddress, feeClaimer }
  }

  async createConfig(args: CreateConfigInstructionDataArgs, quoteMint: Address = WSOL_MINT, signer?: KeyPairSigner) {
    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash().send()
    const feePayer = signer || this.owner
    const configKeyPair = await generateKeyPairSigner()
    const feeClaimer = await this.createTestTrader()
    const feeClaimerTokenAccount = await getAssociatedTokenAccountAddress(
      quoteMint,
      feeClaimer.address,
      TOKEN_PROGRAM_ADDRESS,
    )

    const ix = await getCreateConfigInstructionAsync({
      /* Protocol configurations */
      config: configKeyPair,
      feeClaimer: feeClaimer.address,
      feeClaimerTokenAccount,
      quoteMint,
      payer: feePayer,
      program: this.programId,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      ...args,
    })

    // Estimate compute units before sending
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([ix], tx),
      (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )
    const signedTx = await signTransactionMessageWithSigners(transactionMessage)
    const signature = await this.sendAndConfirmTransaction(signedTx)

    if (this.network === 'devnet') {
      console.log(
        'Explorer (initialize amm config):',
        getExplorerLink({
          cluster: 'devnet',
          transaction: signature,
        }),
      )
    }

    return { configAddress: configKeyPair.address, feeClaimer: feeClaimer }
  }

  /******************************* Curve functions *******************************/
  async createFreshBondingCurve(configAddress?: Address, creator?: KeyPairSigner, feeType?: number) {
    const config = configAddress
      ? configAddress
      : this.currentConfig || (await this.createConfig(DEFAULT_CONFIG_ARGS)).configAddress
    const mintKeypair = await generateKeyPairSigner()
    const creatorSigner = creator ?? (await this.createTestTrader(BigInt(0.1 * LAMPORTS_PER_SOL)))
    const bondingCurve = await this.createBondingCurveAndMintToken({
      configAddress: config,
      creator: creatorSigner,
      mintKeypair,
      feeType: feeType ?? 0,
    })

    return {
      token: mintKeypair.address,
      curvePda: bondingCurve.curvePda,
    }
  }

  async createBondingCurveAndMintToken({
    configAddress,
    creator,
    mintKeypair,
    feeType = 0,
    quoteMintAddress = WSOL_MINT,
    tokenMetadata,
  }: {
    configAddress: Address
    creator: KeyPairSigner
    mintKeypair: KeyPairSigner
    feeType?: number
    quoteMintAddress?: Address
    tokenMetadata?: {
      name: string
      symbol: string
      uri: string
    }
  }) {
    const [curvePda] = await getCurvePda({
      configAddress,
      baseMint: mintKeypair.address,
      quoteMint: quoteMintAddress,
      programId: this.programId,
    })
    const [metadataPda] = await getMetadataPda({ mint: mintKeypair.address })

    const createIx = await getCreateCurveWithSplTokenInstructionAsync({
      creator,
      config: configAddress,
      baseMint: mintKeypair,
      quoteMint: quoteMintAddress,
      curve: curvePda,
      metadata: metadataPda,
      tokenQuoteProgram: TOKEN_PROGRAM_ADDRESS,
      program: this.programId,
      name: tokenMetadata?.name ?? DEFAULT_TOKEN.name,
      symbol: tokenMetadata?.symbol ?? DEFAULT_TOKEN.symbol,
      uri: tokenMetadata?.uri ?? DEFAULT_TOKEN.uri,
      feeType,
    })

    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash().send()

    const tx = createTransaction({
      version: 'legacy',
      feePayer: creator,
      instructions: [createIx],
      latestBlockhash,
    })

    const signedTx = await signTransactionMessageWithSigners(tx)

    const signature = await this.sendAndConfirmTransaction(signedTx)

    if (this.network === 'devnet') {
      console.log(
        'Explorer (create-bonding-curve):',
        getExplorerLink({
          cluster: 'devnet',
          transaction: signature,
        }),
      )
    }

    return {
      mint: mintKeypair.address,
      curvePda,
    }
  }

  async getBondingCurveRentExempt() {
    const rentExempt = await this.rpc.getMinimumBalanceForRentExemption(BigInt(getBondingCurveSize())).send()
    return BigInt(rentExempt)
  }

  async getBondingCurveData({
    baseMint,
    quoteMint = WSOL_MINT,
    configAddress,
  }: {
    baseMint: Address
    quoteMint?: Address
    configAddress?: Address
  }) {
    const config = configAddress ?? this.currentConfig!
    if (!config) {
      throw new Error('AMM config not initialized')
    }

    const [bondingCurvePda] = await getCurvePda({
      configAddress: config,
      baseMint,
      quoteMint,
      programId: this.programId,
    })

    return await fetchBondingCurve(this.rpc, bondingCurvePda)
  }

  async getVaultTokenBalance({
    mint,
    curvePda,
  }: {
    mint: Address
    curvePda: Address
  }) {
    const [vaultAddress] = await getCurveVaultPda({
      curvePda,
      mint,
      programId: this.programId,
    })

    const { value: vaultBalance } = await this.rpc.getTokenAccountBalance(vaultAddress).send()
    return BigInt(vaultBalance.amount)
  }

  /******************************* Cashback Functions *******************************/
  async getCashbackBalance({ user }: { user: Address }) {
    const [cashbackAccount] = await getUserCashbackAccountPda({
      userAddress: user,
      programId: this.programId,
    })
    const { value: cashbackBalance } = await this.rpc.getBalance(cashbackAccount).send()
    return BigInt(cashbackBalance)
  }

  async getCashbackTokenBalance({
    user,
    quoteMint = WSOL_MINT,
  }: {
    user: Address
    quoteMint?: Address
  }) {
    const [cashbackPda] = await getUserCashbackAccountPda({
      userAddress: user,
      programId: this.programId,
    })
    const cashbackAta = await getAssociatedTokenAccountAddress(quoteMint, cashbackPda, TOKEN_PROGRAM_ADDRESS)
    return await this.getTokenAccountBalance(cashbackAta)
  }

  async createCashbackAccount(user: KeyPairSigner) {
    if (!this.currentConfig) {
      throw new Error('AMM config not initialized')
    }

    const [userCashbackPda] = await getUserCashbackAccountPda({
      userAddress: user.address,
      programId: this.programId,
    })

    const ix = await getCreateCashbackInstructionAsync({
      payer: user,
      cashbackAccount: userCashbackPda,
      wsolMint: WSOL_MINT,
      program: this.programId,
    })

    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash().send()

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([ix], tx),
      (tx) => setTransactionMessageFeePayerSigner(user, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )
    const signedTx = await signTransactionMessageWithSigners(tx)
    await this.sendAndConfirmTransaction(signedTx)

    return userCashbackPda
  }

  async updateCashbackTier({ user, newTier }: { user: Address; newTier: number }) {
    if (!this.currentConfig) {
      throw new Error('AMM config not initialized')
    }

    const [cashbackPda] = await getUserCashbackAccountPda({
      userAddress: user,
      programId: this.programId,
    })

    const ix = await getUpdateCashbackTierInstructionAsync({
      admin: this.owner,
      cashbackAccount: cashbackPda,
      user,
      newTier,
      program: this.programId,
    })

    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash().send()

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([ix], tx),
      (tx) => setTransactionMessageFeePayerSigner(this.owner, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )

    const signedTx = await signTransactionMessageWithSigners(tx)
    await this.sendAndConfirmTransaction(signedTx)
  }

  async claimCashback(user: KeyPairSigner): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('AMM config not initialized')
    }

    const [cashbackPda] = await getUserCashbackAccountPda({
      userAddress: user.address,
      programId: this.programId,
    })

    const userWsolAccount = await getAssociatedTokenAccountAddress(WSOL_MINT, user.address, TOKEN_PROGRAM_ADDRESS)

    const ix = await getClaimCashbackInstructionAsync({
      user,
      cashbackAccount: cashbackPda,
      wsolMint: WSOL_MINT,
      userWsolAccount: userWsolAccount,
      program: this.programId,
    })

    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash().send()

    const tx = createTransaction({
      version: 'legacy',
      feePayer: user,
      instructions: [ix],
      latestBlockhash,
    })

    const signedTx = await signTransactionMessageWithSigners(tx)
    await this.sendAndConfirmTransaction(signedTx)
  }

  async getCashbackAccountData(user: Address) {
    const [cashbackPda] = await getUserCashbackAccountPda({
      userAddress: user,
      programId: this.programId,
    })
    return await fetchCashbackAccount(this.rpc, cashbackPda)
  }

  async getCashbackTokenAccountBalance({
    user,
    quoteMint = WSOL_MINT,
  }: {
    user: Address
    quoteMint?: Address
  }) {
    const [cashbackPda] = await getUserCashbackAccountPda({
      userAddress: user,
      programId: this.programId,
    })
    const cashbackAta = await getAssociatedTokenAccountAddress(quoteMint, cashbackPda, TOKEN_PROGRAM_ADDRESS)
    return await this.getTokenAccountBalance(cashbackAta)
  }

  async getCashbackAccountRentExempt() {
    const rentExempt = await this.rpc.getMinimumBalanceForRentExemption(BigInt(getCashbackAccountSize())).send()
    return BigInt(rentExempt)
  }

  async verifyReferrerRewards(referrer: Address, expectedRewards: bigint) {
    const [referrerCashbackBalance, rentExempt] = await Promise.all([
      this.getCashbackTokenAccountBalance({ user: referrer }),
      this.getCashbackAccountRentExempt(),
    ])

    const actualRewards = referrerCashbackBalance - rentExempt
    expect(Math.abs(Number(actualRewards - expectedRewards))).toBeLessThan(100n)

    return { referrerCashbackBalance, rentExempt }
  }

  /******************************* Helper Functions *******************************/
  /**
   * Creates instructions to wrap native SOL into WSOL tokens
   * Equivalent to the legacy Solana web3.js wrapSOLInstruction
   */
  private createWrapSOLInstructions(from: KeyPairSigner, to: Address, amount: bigint) {
    // Create transfer SOL instruction - source should be the KeyPairSigner
    const transferIx = getTransferSolInstruction({
      source: from,
      destination: to,
      amount,
    })

    // Create sync native instruction - only needs the account parameter
    const syncNativeIx = getSyncNativeInstruction({ account: to }, { programAddress: TOKEN_PROGRAM_ADDRESS })

    return [transferIx, syncNativeIx]
  }

  /**
   * Creates instruction to unwrap WSOL back to native SOL
   * Equivalent to the legacy createCloseAccountInstruction
   */
  private async createUnwrapSOLInstruction(owner: KeyPairSigner, receiver: Address) {
    const wSolATAAccount = await getAssociatedTokenAccountAddress(WSOL_MINT, owner.address, TOKEN_PROGRAM_ADDRESS)
    if (wSolATAAccount) {
      return getCloseAccountInstruction(
        {
          account: wSolATAAccount,
          destination: receiver,
          owner,
        },
        {
          programAddress: TOKEN_PROGRAM_ADDRESS,
        },
      )
    }
    return null
  }

  /******************************* Trade Functions *******************************/
  async swap({
    trader,
    baseMint,
    amountIn,
    minimumAmountOut,
    tradeDirection,
    cashbackAddress,
    quoteMint = WSOL_MINT,
    configAddress,
    l1Referrer,
    l2Referrer,
    l3Referrer,
  }: {
    trader: KeyPairSigner
    baseMint: Address
    amountIn: bigint
    minimumAmountOut: bigint
    tradeDirection: TradeDirection
    cashbackAddress?: Address
    quoteMint?: Address
    configAddress?: Address
    l1Referrer?: Address
    l2Referrer?: Address
    l3Referrer?: Address
  }) {
    const config = configAddress ?? this.currentConfig!
    const [[curve], curveState, configState] = await Promise.all([
      getCurvePda({
        configAddress: config,
        baseMint,
        quoteMint,
        programId: this.programId,
      }),
      this.getBondingCurveData({ baseMint, quoteMint, configAddress: config }),
      this.getConfigData({ configAddress: config }),
    ])

    const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } = prepareSwapParams(
      tradeDirection,
      curveState.data,
      configState.data,
    )

    // Calculate accounts and instructions
    const [
      { ataTokenA: inputTokenAccount, ataTokenB: outputTokenAccount, instructions: preInstructions },
      [baseVaultAddress],
      [quoteVaultAddress],
      { cashbackPda, cashbackTokenAccount },
      { cashbackTokenAccount: l1ReferrerCashbackTokenAccount },
      { cashbackTokenAccount: l2ReferrerCashbackTokenAccount },
      { cashbackTokenAccount: l3ReferrerCashbackTokenAccount },
      [curveAuthority],
      { value: latestBlockhash },
      unwrapIx,
    ] = await Promise.all([
      prepareTokenAccounts({
        rpc: this.rpc,
        owner: trader.address,
        payer: trader,
        tokenAMint: inputMint,
        tokenBMint: outputMint,
        tokenAProgram: inputTokenProgram,
        tokenBProgram: inputTokenProgram,
      }),
      getCurveVaultPda({
        curvePda: curve,
        mint: baseMint,
        programId: this.programId,
      }),
      getCurveVaultPda({
        curvePda: curve,
        mint: quoteMint,
        programId: this.programId,
      }),
      getCashbackAccounts({
        cashbackAddress,
        quoteMint,
        programId: this.programId,
      }),
      getCashbackAccounts({
        cashbackAddress: l1Referrer,
        quoteMint,
        programId: this.programId,
      }),
      getCashbackAccounts({
        cashbackAddress: l2Referrer,
        quoteMint,
        programId: this.programId,
      }),
      getCashbackAccounts({
        cashbackAddress: l3Referrer,
        quoteMint,
        programId: this.programId,
      }),
      getCurveAuthority({ programId: this.programId }),
      this.rpc.getLatestBlockhash().send(),
      // If we're dealing with WSOL, add unwrap instruction to close the account and get native SOL back
      inputMint === WSOL_MINT || outputMint === WSOL_MINT
        ? this.createUnwrapSOLInstruction(trader, trader.address)
        : null,
    ])

    if (inputMint === WSOL_MINT && amountIn > 0n) {
      preInstructions.push(...this.createWrapSOLInstructions(trader, inputTokenAccount, amountIn))
    }
    const postInstructions = unwrapIx ? [unwrapIx] : []

    const params = {
      amountIn,
      minimumAmountOut,
    }

    const ix = await getSwapInstructionAsync({
      curveAuthority,
      config,
      curve,
      inputTokenAccount,
      outputTokenAccount,
      baseVault: baseVaultAddress,
      quoteVault: quoteVaultAddress,
      baseMint,
      quoteMint,
      payer: trader,
      tokenBaseProgram: TOKEN_PROGRAM_ADDRESS,
      tokenQuoteProgram: TOKEN_PROGRAM_ADDRESS,

      /* cashback PDAs */
      cashback: cashbackPda ?? null,
      cashbackTokenAccount: cashbackTokenAccount ?? null,
      l1ReferralCashbackTokenAccount: l1ReferrerCashbackTokenAccount ?? null,
      l2ReferralCashbackTokenAccount: l2ReferrerCashbackTokenAccount ?? null,
      l3ReferralCashbackTokenAccount: l3ReferrerCashbackTokenAccount ?? null,

      /* params */
      program: this.programId,
      params,
    })

    // Estimate compute units before sending
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([...preInstructions, ix, ...postInstructions], tx),
      (tx) => setTransactionMessageFeePayerSigner(trader, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )
    const signedTx = await signTransactionMessageWithSigners(transactionMessage)
    const signature = await this.sendAndConfirmTransaction(signedTx)

    if (this.network === 'devnet') {
      console.log(
        'Explorer (buy):',
        getExplorerLink({
          cluster: 'devnet',
          transaction: signature,
        }),
      )
    }

    // Get transaction details to extract compute units used
    const txDetails = await this.rpc
      .getTransaction(signature, {
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
      })
      .send()
    return txDetails?.meta?.computeUnitsConsumed ? Number(txDetails.meta.computeUnitsConsumed) : 0
  }

  /******************************* Fee Claimer Functions *******************************/
  async claimProtocolFees({
    feeClaimer,
    baseMint,
    quoteMint = WSOL_MINT,
    configAddress,
  }: {
    feeClaimer: KeyPairSigner
    baseMint: Address
    quoteMint?: Address
    configAddress?: Address
  }) {
    const config = configAddress ?? this.currentConfig!
    if (!config) {
      throw new Error('AMM config not initialized')
    }

    const [[curvePda], feeClaimerTokenAccount, { value: latestBlockhash }] = await Promise.all([
      getCurvePda({
        configAddress: config,
        baseMint,
        quoteMint,
        programId: this.programId,
      }),
      getAssociatedTokenAccountAddress(quoteMint, feeClaimer.address, TOKEN_PROGRAM_ADDRESS),
      this.rpc.getLatestBlockhash().send(),
    ])
    const curveData = await this.getBondingCurveData({ baseMint, quoteMint, configAddress: config })

    const ix = await getClaimProtocolFeeInstructionAsync({
      config,
      curve: curvePda,
      feeClaimerTokenAccount,
      quoteVault: curveData.data.quoteVault,
      quoteMint: quoteMint,
      feeClaimer,
      tokenQuoteProgram: TOKEN_PROGRAM_ADDRESS,
      program: this.programId,
    })

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([ix], tx),
      (tx) => setTransactionMessageFeePayerSigner(feeClaimer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )

    const signedTx = await signTransactionMessageWithSigners(tx)
    await this.sendAndConfirmTransaction(signedTx)
  }

  async claimCreatorFee({
    creator,
    baseMint,
    quoteMint = WSOL_MINT,
    configAddress,
  }: {
    creator: KeyPairSigner
    baseMint: Address
    quoteMint?: Address
    configAddress?: Address
  }) {
    const config = configAddress ?? this.currentConfig!
    if (!config) {
      throw new Error('AMM config not initialized')
    }

    const [[curvePda], creatorTokenAccount, { value: latestBlockhash }] = await Promise.all([
      getCurvePda({
        configAddress: config,
        baseMint,
        quoteMint,
        programId: this.programId,
      }),
      getAssociatedTokenAccountAddress(quoteMint, creator.address, TOKEN_PROGRAM_ADDRESS),
      this.rpc.getLatestBlockhash().send(),
    ])

    const curveData = await this.getBondingCurveData({ baseMint, quoteMint, configAddress: config })

    const ix = await getClaimCreatorFeeInstructionAsync({
      curve: curvePda,
      creatorTokenAccount,
      quoteVault: curveData.data.quoteVault,
      quoteMint: quoteMint,
      creator,
      tokenQuoteProgram: TOKEN_PROGRAM_ADDRESS,
      program: this.programId,
    })

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([ix], tx),
      (tx) => setTransactionMessageFeePayerSigner(creator, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )

    const signedTx = await signTransactionMessageWithSigners(tx)
    await this.sendAndConfirmTransaction(signedTx)
  }

  /******************************* Migration *******************************/
  async migrate({
    curve,
    baseMint,
    quoteMint = WSOL_MINT,
    config = this.currentConfig,
  }: {
    curve: Address
    baseMint: Address
    quoteMint?: Address
    config?: Address
  }) {
    const [
      [curveAuthority],
      [dammPoolAuthority],
      [dammEventAuthority],
      [migrationMetadataPda],
      [dammPool],
      { firstPositionNftKP, firstPositionNftAccount, firstPosition },
      { secondPositionNftKP, secondPositionNftAccount, secondPosition },
      curveData,
      configData,
      { value: latestBlockhash },
    ] = await Promise.all([
      getCurveAuthority({ programId: this.programId }),
      deriveDammV2PoolAuthority(),
      deriveDammV2EventAuthority(),
      deriveDammV2MigrationMetadataAddress(curve),
      deriveDammV2PoolAddress({
        config: DAMM_CONFIG_ACCOUNT,
        tokenAMint: baseMint,
        tokenBMint: quoteMint,
      }),
      (async () => {
        const firstPositionNftKP = await generateKeyPairSigner()
        const [firstPosition] = await derivePositionAddress(firstPositionNftKP.address)
        const [firstPositionNftAccount] = await derivePositionNftAccount(firstPositionNftKP.address)

        return {
          firstPositionNftKP,
          firstPositionNftAccount,
          firstPosition,
        }
      })(),
      (async () => {
        const secondPositionNftKP = await generateKeyPairSigner()
        const [secondPosition] = await derivePositionAddress(secondPositionNftKP.address)
        const [secondPositionNftAccount] = await derivePositionNftAccount(secondPositionNftKP.address)

        return {
          secondPositionNftKP,
          secondPositionNftAccount,
          secondPosition,
        }
      })(),
      this.getBondingCurveData({ baseMint, configAddress: config }),
      this.getConfigData({ configAddress: config }),
      this.rpc.getLatestBlockhash().send(),
    ])

    const [tokenAVault] = await deriveDammV2TokenVaultAddress({
      pool: dammPool,
      mint: baseMint,
    })
    const [tokenBVault] = await deriveDammV2TokenVaultAddress({
      pool: dammPool,
      mint: quoteMint,
    })

    const tokenBaseProgram = curveData.data.curveType === 0 ? TOKEN_PROGRAM_ADDRESS : TOKEN_2022_PROGRAM_ADDRESS
    const tokenQuoteProgram = TOKEN_PROGRAM_ADDRESS

    const ix = await getMigrateDammV2InstructionAsync({
      curve,
      curveAuthority,
      config,
      migrationAuthority: this.owner,
      pool: dammPool,
      firstPositionNftMint: firstPositionNftKP,
      firstPositionNftAccount,
      firstPosition,
      secondPositionNftMint: secondPositionNftKP,
      secondPositionNftAccount,
      secondPosition,
      dammPoolAuthority,
      baseMint,
      quoteMint,
      tokenAVault,
      tokenBVault,
      baseVault: curveData.data.baseVault,
      quoteVault: curveData.data.quoteVault,
      tokenBaseProgram,
      tokenQuoteProgram,
      token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
      dammEventAuthority,
      program: this.programId,
    })

    // Add remaining accounts to the instruction
    ix.accounts.push({
      address: DAMM_CONFIG_ACCOUNT,
      role: AccountRole.READONLY,
    })

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([ix], tx),
      (tx) => setTransactionMessageFeePayerSigner(this.owner, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )

    const budgetedTransactionMessage = prependTransactionMessageInstructions(
      [getSetComputeUnitLimitInstruction({ units: 500_000 })],
      tx,
    )

    const signedTx = await signTransactionMessageWithSigners(budgetedTransactionMessage)
    const signature = await this.sendAndConfirmTransaction(signedTx)
    if (this.network === 'devnet') {
      console.log(
        'Explorer (migrate-damm-v2):',
        getExplorerLink({
          cluster: 'devnet',
          transaction: signature,
        }),
      )
    }

    return {
      pool: dammPool,
      firstPositionNftKP,
      secondPositionNftKP,
    }
  }

  async swapWithDammV2({
    trader,
    dammPool,
    amountIn,
    minimumAmountOut,
    inputTokenMint,
    outputTokenMint,
  }: {
    trader: KeyPairSigner
    dammPool: Address
    amountIn: bigint
    minimumAmountOut: bigint
    inputTokenMint: Address
    outputTokenMint: Address
  }) {
    const [dammPoolState, unwrapIx, { value: latestBlockhash }] = await Promise.all([
      fetchPool(this.rpc, dammPool),
      // If we're dealing with WSOL, add unwrap instruction to close the account and get native SOL back
      inputTokenMint === WSOL_MINT || outputTokenMint === WSOL_MINT
        ? this.createUnwrapSOLInstruction(trader, trader.address)
        : null,
      this.rpc.getLatestBlockhash().send(),
    ])

    // Get or create token accounts
    // Note: prepareTokenAccounts returns ataTokenA for the first mint and ataTokenB for the second mint
    const {
      ataTokenA: inputTokenAccount,
      ataTokenB: outputTokenAccount,
      instructions: accountInstructions,
    } = await prepareTokenAccounts({
      rpc: this.rpc,
      owner: trader.address,
      payer: trader,
      tokenAMint: inputTokenMint,
      tokenBMint: outputTokenMint,
      tokenAProgram: TOKEN_PROGRAM_ADDRESS,
      tokenBProgram: TOKEN_PROGRAM_ADDRESS,
    })

    console.log('\n=== Token Account Setup ===')
    console.log(`Input token mint (WSOL): ${inputTokenMint.toString()}`)
    console.log(`Output token mint (custom): ${outputTokenMint.toString()}`)
    console.log(`Input token account: ${inputTokenAccount.toString()}`)
    console.log(`Output token account: ${outputTokenAccount.toString()}`)
    console.log(`Pool tokenA mint: ${dammPoolState.data.tokenAMint.toString()}`)
    console.log(`Pool tokenB mint: ${dammPoolState.data.tokenBMint.toString()}`)
    console.log(`Pool tokenA vault: ${dammPoolState.data.tokenAVault.toString()}`)
    console.log(`Pool tokenB vault: ${dammPoolState.data.tokenBVault.toString()}`)

    // Pre-instructions: create accounts if needed and wrap SOL to WSOL if needed
    const preInstructions = [...accountInstructions]
    if (inputTokenMint === WSOL_MINT && amountIn > 0n) {
      preInstructions.push(...this.createWrapSOLInstructions(trader, inputTokenAccount, amountIn))
    }

    // Post-instructions: unwrap WSOL back to SOL if needed
    const postInstructions = unwrapIx ? [unwrapIx] : []

    // CRITICAL: The swap instruction expects the accounts to match the pool's token order
    // If input is WSOL and output is custom token, we need to figure out which is tokenA and which is tokenB
    let swapInputAccount: Address
    let swapOutputAccount: Address

    if (dammPoolState.data.tokenAMint.toString() === inputTokenMint.toString()) {
      // Input token (WSOL) is tokenA
      swapInputAccount = inputTokenAccount
      swapOutputAccount = outputTokenAccount
      console.log('Swap direction: tokenA (WSOL) -> tokenB (custom token)')
    } else if (dammPoolState.data.tokenBMint.toString() === inputTokenMint.toString()) {
      // Input token (WSOL) is tokenB
      swapInputAccount = inputTokenAccount
      swapOutputAccount = outputTokenAccount
      console.log('Swap direction: tokenB (WSOL) -> tokenA (custom token)')
    } else {
      throw new Error(`Input token ${inputTokenMint.toString()} doesn't match pool tokens`)
    }

    const ix = await getDammSwapInstructionAsync({
      pool: dammPool,
      inputTokenAccount: swapInputAccount,
      outputTokenAccount: swapOutputAccount,
      tokenAVault: dammPoolState.data.tokenAVault,
      tokenBVault: dammPoolState.data.tokenBVault,
      tokenAMint: dammPoolState.data.tokenAMint,
      tokenBMint: dammPoolState.data.tokenBMint,
      payer: trader,
      tokenAProgram: TOKEN_PROGRAM_ADDRESS,
      tokenBProgram: TOKEN_PROGRAM_ADDRESS,
      program: DAMM_V2_PROGRAM_ID,
      params: {
        amountIn,
        minimumAmountOut,
      },
    })

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => appendTransactionMessageInstructions([...preInstructions, ix, ...postInstructions], tx),
      (tx) => setTransactionMessageFeePayerSigner(trader, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    )
    const signedTx = await signTransactionMessageWithSigners(tx)
    const signature = await this.sendAndConfirmTransaction(signedTx)
    if (this.network === 'devnet') {
      console.log(
        'Explorer (damm-swap):',
        getExplorerLink({
          cluster: 'devnet',
          transaction: signature,
        }),
      )
    }
    return signature
  }

  async getCurveData({ curveAddress }: { curveAddress: Address }) {
    return await fetchBondingCurve(this.rpc, curveAddress)
  }
}
