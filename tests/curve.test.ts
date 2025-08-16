import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { type Address, type KeyPairSigner, LAMPORTS_PER_SOL } from 'gill'
import { TokenType, buildCurveWithMarketCap } from './utils/build-curve.ts'
import { WSOL_MINT } from './utils/constants.ts'
import { TestContextClass } from './utils/context.ts'
import { TradeDirection, getSwapResult } from './utils/swap-quote.ts'

describe('Curve Tests', () => {
  let ctx: TestContextClass
  let token: Address
  let curve: Address
  let trader: KeyPairSigner
  let testConfig: Address

  // Define our custom curve configuration without vesting
  const customCurveConfig = buildCurveWithMarketCap({
    totalTokenSupply: 1_000_000_000n,
    tokenType: TokenType.SPL,
    tokenBaseDecimal: 6,
    feeConfig: {
      feeBasisPoints: 1_500,
      l1ReferralFeeBasisPoints: 300,
      l2ReferralFeeBasisPoints: 30,
      l3ReferralFeeBasisPoints: 20,
      refereeDiscountBasisPoints: 100,
      creatorFeeBasisPoints: 300,
      migrationFeeBasisPoints: 5_000,
    },
    lockedVestingConfig: {
      totalLockedVestingAmount: 0n,
      numberOfVestingPeriod: 0n,
      cliffUnlockAmount: 0n,
      totalVestingDuration: 0n,
      cliffDurationFromMigrationTime: 0n,
    },
    initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL), // 30 SOL
    migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL), // 400 SOL
  })

  // Initialize context once before all tests
  beforeAll(async () => {
    ctx = await TestContextClass.create()
    // Create config with our custom curve parameters
    const { configAddress } = await ctx.createConfig(customCurveConfig)
    testConfig = configAddress
  })

  beforeEach(async () => {
    const result = await ctx.createFreshBondingCurve(testConfig)
    token = result.token
    curve = result.curvePda
    trader = await ctx.createTestTrader(BigInt(200 * LAMPORTS_PER_SOL))
  })

  test('curve - basic build', () => {
    const curveConfig = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5_000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 0n,
        numberOfVestingPeriod: 0n,
        cliffUnlockAmount: 0n,
        totalVestingDuration: 0n,
        cliffDurationFromMigrationTime: 0n,
      },
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL), // 30 SOL
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL), // 400 SOL
    })

    console.log(curveConfig)
    console.log(testConfig)

    // Verify the curve config is built correctly
    expect(curveConfig).toBeDefined()
    expect(curveConfig.initialSqrtPrice).toBeGreaterThan(0n)
    expect(curveConfig.migrationQuoteThreshold).toBeGreaterThan(0n)
    expect(curveConfig.curve.length).toBeGreaterThan(0)
  })

  test('curve - create and buy 1 SOL', async () => {
    const buyAmount = BigInt(LAMPORTS_PER_SOL)

    // Get initial state
    const [initialCurveState, configState, traderInitialBalance, curveInitialQuoteBalance, curveInitialBaseBalance] =
      await Promise.all([
        ctx.getBondingCurveData({ baseMint: token, configAddress: testConfig }),
        ctx.getConfigData({ configAddress: testConfig }),
        ctx.getBalance(trader.address),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
      ])

    // Verify initial state
    expect(initialCurveState).toBeDefined()
    expect(configState).toBeDefined()
    expect(traderInitialBalance).toBeGreaterThan(buyAmount)
    expect(curveInitialQuoteBalance).toBe(0n) // Initially empty
    expect(curveInitialBaseBalance).toBeGreaterThan(0n) // Has initial tokens

    // Calculate expected output
    const buyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    // Execute buy transaction
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: buyExpected.outputAmount, // 0% slippage
      tradeDirection: TradeDirection.QuoteToBase,
      configAddress: testConfig,
    })

    // Get state after buy
    const [curveStateAfterBuy, traderBalanceAfterBuy, traderTokensAfterBuy, curveQuoteAfterBuy, curveBaseAfterBuy] =
      await Promise.all([
        ctx.getBondingCurveData({ baseMint: token, configAddress: testConfig }),
        ctx.getBalance(trader.address),
        ctx.getTokenBalance({ address: trader.address, mint: token }),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
      ])

    // Verify the buy was successful
    expect(traderInitialBalance - traderBalanceAfterBuy).toBeGreaterThanOrEqual(buyAmount)
    expect(traderTokensAfterBuy).toBe(buyExpected.outputAmount)
    expect(traderTokensAfterBuy).toBeGreaterThan(0n)

    // Verify curve state updates
    expect(BigInt(curveQuoteAfterBuy - curveInitialQuoteBalance)).toBe(buyAmount)
    expect(curveInitialBaseBalance - curveBaseAfterBuy).toBe(traderTokensAfterBuy)
    expect(curveStateAfterBuy.data.protocolFee).toBe(buyExpected.protocolFee)
    expect(curveStateAfterBuy.data.creatorFee).toBe(buyExpected.creatorFee)
    expect(curveStateAfterBuy.data.quoteReserve).toBe(initialCurveState.data.quoteReserve + buyAmount)
    expect(curveStateAfterBuy.data.baseReserve).toBe(initialCurveState.data.baseReserve - traderTokensAfterBuy)
  })

  test('curve - buy until migration threshold', async () => {
    // Get initial state and config
    const [initialCurveState, configState] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token, configAddress: testConfig }),
      ctx.getConfigData({ configAddress: testConfig }),
    ])

    // Verify initial migration status (should be 0: PreBondingCurve)
    expect(initialCurveState.data.migrationStatus).toBe(0)
    expect(initialCurveState.data.curveFinishTimestamp).toBe(0n)

    // Calculate amount needed to reach migration threshold
    // Add a bit extra to ensure we cross the threshold
    const amountToMigration = configState.data.migrationQuoteThreshold - initialCurveState.data.quoteReserve
    const largeBuyAmount = amountToMigration + BigInt(5 * LAMPORTS_PER_SOL)

    // Execute large buy to trigger migration
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: largeBuyAmount,
      minimumAmountOut: 0n, // Accept any amount due to slippage
      tradeDirection: TradeDirection.QuoteToBase,
      configAddress: testConfig,
    })

    // Get state after large buy
    const [curveStateAfterBuy] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token, configAddress: testConfig }),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
    ])

    // Verify migration status changed
    // Note: The contract logic sets status to 2 (LockedVesting) when has_vesting() returns false
    // This appears to be inverted naming, but we test the actual behavior
    expect(curveStateAfterBuy.data.migrationStatus).toBe(2)
    expect(curveStateAfterBuy.data.curveFinishTimestamp).toBeGreaterThan(0n)
    // The sqrt price should reach exactly the migration sqrt price
    expect(curveStateAfterBuy.data.sqrtPrice).toBe(configState.data.curve[0].sqrtPrice)

    // Verify we can't trade anymore after migration
    expect(
      ctx.swap({
        trader,
        baseMint: token,
        amountIn: BigInt(LAMPORTS_PER_SOL),
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.QuoteToBase,
        configAddress: testConfig,
      }),
    ).rejects.toThrow()
  })
})

describe('Vesting Configuration Tests', () => {
  let ctx: TestContextClass

  beforeAll(async () => {
    ctx = await TestContextClass.create()
  })

  test('vesting - full cliff unlock', async () => {
    // Configuration where all tokens unlock at cliff
    const curveConfig = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5_000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 100_000_000n, // 100M tokens for vesting
        numberOfVestingPeriod: 1n,
        cliffUnlockAmount: 100_000_000n, // All unlocked at cliff
        totalVestingDuration: 86400n, // 1 day
        cliffDurationFromMigrationTime: 86400n, // 1 day cliff
      },
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL),
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL),
    })

    // Verify locked vesting params
    expect(curveConfig.lockedVesting).toBeDefined()
    expect(curveConfig.lockedVesting.cliffUnlockAmount).toBe(99_999_999_000_000n) // 100M - 1 in lamports
    expect(curveConfig.lockedVesting.amountPerPeriod).toBe(1_000_000n) // 1 token in lamports
    expect(curveConfig.lockedVesting.numberOfPeriod).toBe(1n)
    expect(curveConfig.lockedVesting.cliffDurationFromMigrationTime).toBe(86400n)
    expect(curveConfig.lockedVesting.frequency).toBe(1n)

    // Create config with vesting
    const { configAddress } = await ctx.createConfig(curveConfig)

    // Verify config was created successfully
    const configData = await ctx.getConfigData({ configAddress })
    expect(configData.data.lockedVestingConfig.cliffUnlockAmount).toBe(99_999_999_000_000n)
    expect(configData.data.lockedVestingConfig.amountPerPeriod).toBe(1_000_000n)
    expect(configData.data.lockedVestingConfig.numberOfPeriod).toBe(1n)
  })

  test('vesting - periodic unlock with cliff', async () => {
    // Configuration with cliff unlock and periodic vesting
    const curveConfig = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5_000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 100_000_000n, // 100M tokens
        numberOfVestingPeriod: 10n, // 10 periods
        cliffUnlockAmount: 20_000_000n, // 20M at cliff
        totalVestingDuration: 864000n, // 10 days total
        cliffDurationFromMigrationTime: 86400n, // 1 day cliff
      },
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL),
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL),
    })

    // Verify vesting params calculation
    expect(curveConfig.lockedVesting).toBeDefined()
    expect(curveConfig.lockedVesting.cliffUnlockAmount).toBe(20_000_000_000_000n) // 20M in lamports
    expect(curveConfig.lockedVesting.amountPerPeriod).toBe(8_000_000_000_000n) // 8M per period in lamports
    expect(curveConfig.lockedVesting.numberOfPeriod).toBe(10n)
    expect(curveConfig.lockedVesting.frequency).toBe(86400n) // 1 day per period

    // Create config with vesting
    const { configAddress } = await ctx.createConfig(curveConfig)

    // Verify config data
    const configData = await ctx.getConfigData({ configAddress })
    expect(configData.data.lockedVestingConfig.cliffUnlockAmount).toBe(20_000_000_000_000n)
    expect(configData.data.lockedVestingConfig.amountPerPeriod).toBe(8_000_000_000_000n)
    expect(configData.data.lockedVestingConfig.frequency).toBe(86400n)
  })

  test('vesting - linear vesting no cliff', async () => {
    // Configuration with linear vesting, no cliff unlock
    const curveConfig = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5_000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 50_000_000n, // 50M tokens
        numberOfVestingPeriod: 50n, // 50 periods
        cliffUnlockAmount: 0n, // No cliff unlock
        totalVestingDuration: 4320000n, // 50 days
        cliffDurationFromMigrationTime: 0n, // No cliff
      },
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL),
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL),
    })

    // Verify linear vesting params
    expect(curveConfig.lockedVesting).toBeDefined()
    expect(curveConfig.lockedVesting.cliffUnlockAmount).toBe(0n)
    expect(curveConfig.lockedVesting.amountPerPeriod).toBe(1_000_000_000_000n) // 1M per period in lamports
    expect(curveConfig.lockedVesting.numberOfPeriod).toBe(50n)
    expect(curveConfig.lockedVesting.frequency).toBe(86400n) // Daily vesting

    // Create config with vesting
    const { configAddress } = await ctx.createConfig(curveConfig)

    // Verify config data
    const configData = await ctx.getConfigData({ configAddress })
    expect(configData.data.lockedVestingConfig.cliffUnlockAmount).toBe(0n)
    expect(configData.data.lockedVestingConfig.amountPerPeriod).toBe(1_000_000_000_000n)
    expect(configData.data.lockedVestingConfig.numberOfPeriod).toBe(50n)
  })

  test('vesting - migration status with vesting', async () => {
    // Create config with vesting
    const curveConfig = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5_000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 25_000_000n, // 25M tokens
        numberOfVestingPeriod: 5n,
        cliffUnlockAmount: 5_000_000n, // 5M at cliff
        totalVestingDuration: 432000n, // 5 days
        cliffDurationFromMigrationTime: 86400n, // 1 day cliff
      },
      initialMarketCap: BigInt(23.5 * LAMPORTS_PER_SOL),
      migrationMarketCap: BigInt(405 * LAMPORTS_PER_SOL),
    })

    const { configAddress } = await ctx.createConfig(curveConfig)
    const { token, curvePda } = await ctx.createFreshBondingCurve(configAddress)

    // Get initial state
    const [initialCurveState, configState] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token, configAddress }),
      ctx.getConfigData({ configAddress }),
    ])

    // Verify config has vesting
    expect(configState.data.lockedVestingConfig.amountPerPeriod).toBeGreaterThan(0n)

    // Buy until migration threshold
    const amountToMigration = configState.data.migrationQuoteThreshold - initialCurveState.data.quoteReserve
    const largeBuyAmount = amountToMigration + BigInt(5 * LAMPORTS_PER_SOL)

    const trader = await ctx.createTestTrader(largeBuyAmount + BigInt(10 * LAMPORTS_PER_SOL))

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: largeBuyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
      configAddress,
    })

    // Get state after reaching threshold
    const curveStateAfterBuy = await ctx.getBondingCurveData({ baseMint: token, configAddress })

    // With vesting, migration status should be 1 (PostBondingCurve)
    // This is because has_vesting() returns true when vesting params are set
    expect(curveStateAfterBuy.data.migrationStatus).toBe(1)
    expect(curveStateAfterBuy.data.curveFinishTimestamp).toBeGreaterThan(0n)
  })

  test('vesting - verify swap amount calculation', async () => {
    // Test that swap amount is correctly reduced when vesting is configured
    const configWithVesting = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 200_000_000n, // 200M tokens (20% of supply)
        numberOfVestingPeriod: 10n,
        cliffUnlockAmount: 50_000_000n,
        totalVestingDuration: 864000n,
        cliffDurationFromMigrationTime: 86400n,
      },
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL),
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL),
    })

    const configWithoutVesting = buildCurveWithMarketCap({
      totalTokenSupply: 1_000_000_000n,
      tokenType: TokenType.SPL,
      tokenBaseDecimal: 6,
      feeConfig: {
        feeBasisPoints: 1_500,
        l1ReferralFeeBasisPoints: 300,
        l2ReferralFeeBasisPoints: 30,
        l3ReferralFeeBasisPoints: 20,
        refereeDiscountBasisPoints: 100,
        creatorFeeBasisPoints: 300,
        migrationFeeBasisPoints: 5000,
      },
      lockedVestingConfig: {
        totalLockedVestingAmount: 0n,
        numberOfVestingPeriod: 0n,
        cliffUnlockAmount: 0n,
        totalVestingDuration: 0n,
        cliffDurationFromMigrationTime: 0n,
      },
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL),
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL),
    })

    // The curve with vesting should have different parameters
    expect(configWithVesting.migrationQuoteThreshold).toBeGreaterThan(configWithoutVesting.migrationQuoteThreshold)

    // Both configs should be valid
    const { configAddress: configAddressWithVesting } = await ctx.createConfig(configWithVesting)
    const { configAddress: configAddressWithoutVesting } = await ctx.createConfig(configWithoutVesting)

    expect(configAddressWithVesting).toBeDefined()
    expect(configAddressWithoutVesting).toBeDefined()
  })
})
