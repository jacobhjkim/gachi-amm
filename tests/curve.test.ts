import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { type Address, type KeyPairSigner, LAMPORTS_PER_SOL } from 'gill'
import { TokenType, buildCurveWithMarketCap } from './utils/build-curve.ts'
import { WSOL_MINT } from './utils/constants.ts'
import { TestContextClass } from './utils/context.ts'
import { TradeDirection, getSwapResult } from './utils/swap-quote.ts'

describe('curve - without deploying', () => {
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
      initialMarketCap: BigInt(30 * LAMPORTS_PER_SOL), // 30 SOL
      migrationMarketCap: BigInt(400 * LAMPORTS_PER_SOL), // 400 SOL
    })

    console.log(curveConfig)

    // Verify the curve config is built correctly
    expect(curveConfig).toBeDefined()
    expect(curveConfig.initialSqrtPrice).toBeGreaterThan(0n)
    expect(curveConfig.migrationQuoteThreshold).toBeGreaterThan(0n)
    expect(curveConfig.curve.length).toBeGreaterThan(0)
  })
})

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
