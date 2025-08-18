import { beforeEach, describe, expect, test } from 'bun:test'
import { type Address, type KeyPairSigner, LAMPORTS_PER_SOL } from 'gill'
import { fetchBondingCurve } from '~/clients'
import { fetchPool, fetchPosition } from '../clients/damm/src/generated'
import { BASIS_POINTS_DIVISOR, DEFAULT_CONFIG_ARGS, SINGLE_BUY_AMOUNT, WSOL_MINT } from './utils/constants.ts'
import { TestContextClass } from './utils/context.ts'
import { TradeDirection, getSwapResult } from './utils/swap-quote.ts'

const largeBuyAmount = BigInt(150 * LAMPORTS_PER_SOL) // Large enough to trigger graduation

describe('Migration Test', () => {
  let ctx: TestContextClass
  let token: Address
  let curve: Address
  let feeClaimer: KeyPairSigner
  let trader: KeyPairSigner

  beforeEach(async () => {
    ctx = await TestContextClass.create()
    const configResult = await ctx.createConfigOnce(DEFAULT_CONFIG_ARGS)
    feeClaimer = configResult.feeClaimer
    const result = await ctx.createFreshBondingCurve()
    token = result.token
    curve = result.curvePda
    trader = await ctx.createTestTrader(BigInt(200 * LAMPORTS_PER_SOL))
  })

  test('migration - basic', async () => {
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: largeBuyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [finalCurveState, traderTokenBalance] = await Promise.all([
      fetchBondingCurve(ctx.rpc, curve),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
    ])
    891_902_953_586_497n
    console.log(traderTokenBalance)

    expect(finalCurveState.data.migrationStatus).toBe(1)
    expect(finalCurveState.data.curveFinishTimestamp).toBeGreaterThan(0n)

    const migrationResult = await ctx.migrate({ curve, baseMint: token })

    const [postMigrationCurveState] = await Promise.all([
      fetchBondingCurve(ctx.rpc, curve)
    ])

    expect(postMigrationCurveState.data.migrationStatus).toBe(3)

    const [poolData, firstPosition] = await Promise.all([
      fetchPool(ctx.rpc, migrationResult.pool),
      fetchPosition(ctx.rpc, migrationResult.firstPositionNftKP.address),
    ])
    expect(poolData.data.tokenAMint).toEqual(token)
    // TODO: why does firstPosition.data.pool not match migrationResult.pool?
    // expect(firstPosition.data.pool).toEqual(migrationResult.pool)

    await ctx.swapWithDammV2({
      trader,
      dammPool: migrationResult.pool,
      amountIn: SINGLE_BUY_AMOUNT,
      minimumAmountOut: 0n,
      inputTokenMint: WSOL_MINT,
      outputTokenMint: token,
    })

    const [finalTraderTokenBalance, finalPoolData] = await Promise.all([
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      fetchPool(ctx.rpc, migrationResult.pool),
    ])

    expect(finalTraderTokenBalance).toBeGreaterThan(traderTokenBalance)
    expect(finalPoolData.data.metrics.totalLpBFee).toBeGreaterThan(0n)
    expect(finalPoolData.data.metrics.totalProtocolBFee).toBeGreaterThan(0)
  })

  test('migration - trading disabled', async () => {
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: largeBuyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [curveState] = await Promise.all([fetchBondingCurve(ctx.rpc, curve)])
    expect(curveState.data.migrationStatus).toBe(2)

    expect(
      ctx.swap({
        trader,
        baseMint: token,
        amountIn: SINGLE_BUY_AMOUNT,
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.QuoteToBase,
      }),
    ).rejects.toThrow()
  })

  test('migration - validates migration fee retention and claim', async () => {
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: largeBuyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [preMigrationCurveState, configState] = await Promise.all([
      fetchBondingCurve(ctx.rpc, curve),
      ctx.getConfigData({}),
    ])

    expect(preMigrationCurveState.data.migrationStatus).toBe(2)

    // Get the quote vault balance before migration
    const preMigrationQuoteVaultBalance = await ctx.getTokenAccountBalance(preMigrationCurveState.data.quoteVault)

    // Migrate to DAMM v2
    await ctx.migrate({ curve, baseMint: token })

    const [postMigrationCurveState, postMigrationQuoteVaultBalance] = await Promise.all([
      fetchBondingCurve(ctx.rpc, curve),
      ctx.getTokenAccountBalance(preMigrationCurveState.data.quoteVault),
    ])
    expect(postMigrationCurveState.data.migrationStatus).toBe(3)

    // Calculate the expected migration fee (5% of the quote amount)
    const migrationQuoteThreshold = configState.data.migrationQuoteThreshold
    const migrationFeeBasisPoints = configState.data.migrationFeeBasisPoints
    const feeBasisPoints = configState.data.feeBasisPoints
    const feeAmount =
      (migrationQuoteThreshold * (BigInt(migrationFeeBasisPoints) + BigInt(feeBasisPoints))) / BASIS_POINTS_DIVISOR

    // The bonding curve should retain the migration fee (5%)
    expect(postMigrationQuoteVaultBalance).toBeGreaterThan(feeAmount)
    expect(postMigrationQuoteVaultBalance).toBeLessThan(feeAmount + feeAmount / 2n) // Allow some tolerance

    // Claim protocol fee (which should include migration fee after migration)
    await ctx.claimProtocolFees({
      feeClaimer,
      baseMint: token,
    })

    const [finalFeeClaimerBalance, finalQuoteVaultBalance] = await Promise.all([
      ctx.getTokenBalance({
        address: feeClaimer.address,
        mint: WSOL_MINT,
      }),
      ctx.getTokenAccountBalance(postMigrationCurveState.data.quoteVault),
    ])

    // Verify the fee claimer received the migration fee
    expect(finalFeeClaimerBalance).toBe(postMigrationQuoteVaultBalance)
    expect(finalQuoteVaultBalance).toBe(0n)
  })

  test('migration - can claim fees after graduation', async () => {
    const creator = await ctx.createTestTrader()
    const result = await ctx.createFreshBondingCurve(undefined, creator)
    token = result.token
    curve = result.curvePda

    const [initialCurveState, configState] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getConfigData({}),
    ])

    // Perform multiple trades to accumulate fees before graduation
    const firstBuyAmount = BigInt(50 * LAMPORTS_PER_SOL)
    const firstBuyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: firstBuyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: firstBuyAmount,
      minimumAmountOut: firstBuyExpected.outputAmount,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    // Claim fees before graduation
    await Promise.all([
      ctx.claimProtocolFees({
        feeClaimer,
        baseMint: token,
      }),
      ctx.claimCreatorFee({
        creator,
        baseMint: token,
      }),
    ])

    const [curveAfterFirstBuy, initialFeeClaimerBalance, initialCreatorBalance] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getTokenBalance({ address: feeClaimer.address, mint: WSOL_MINT }),
      ctx.getTokenBalance({ address: creator.address, mint: WSOL_MINT }),
    ])

    // Verify fees accumulated
    expect(curveAfterFirstBuy.data.protocolFee).toBe(0n)
    expect(curveAfterFirstBuy.data.creatorFee).toBe(0n)
    expect(initialFeeClaimerBalance).toBe(firstBuyExpected.protocolFee)
    expect(initialCreatorBalance).toBe(firstBuyExpected.creatorFee)

    // Now trigger graduation with a large buy
    const graduationBuyAmount = BigInt(100 * LAMPORTS_PER_SOL)

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: graduationBuyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [curveAfterGraduation] = await Promise.all([fetchBondingCurve(ctx.rpc, curve)])

    // Verify graduation occurred and fees are still there
    expect(curveAfterGraduation.data.migrationStatus).toBe(2)

    // Claim fees after graduation
    await Promise.all([
      ctx.claimProtocolFees({
        feeClaimer,
        baseMint: token,
      }),
      ctx.claimCreatorFee({
        creator,
        baseMint: token,
      }),
    ])

    // Verify fees were claimed successfully
    const [finalFeeClaimerBalance, finalCreatorBalance, finalCurveState] = await Promise.all([
      ctx.getTokenBalance({ address: feeClaimer.address, mint: WSOL_MINT }),
      ctx.getTokenBalance({ address: creator.address, mint: WSOL_MINT }),
      fetchBondingCurve(ctx.rpc, curve),
    ])

    // Check that fees were transferred correctly
    expect(finalFeeClaimerBalance).toBeGreaterThan(initialFeeClaimerBalance)
    expect(finalCreatorBalance).toBeGreaterThan(initialCreatorBalance)

    // Check that fees were cleared from the curve
    expect(finalCurveState.data.protocolFee).toBe(0n)
    expect(finalCurveState.data.creatorFee).toBe(0n)

    // Verify migration status is still in graduated state
    expect(finalCurveState.data.migrationStatus).toBe(2)
  })
})
