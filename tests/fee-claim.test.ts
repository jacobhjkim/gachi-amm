import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { type Address, type KeyPairSigner, LAMPORTS_PER_SOL } from 'gill'
import { DEFAULT_CONFIG_ARGS, WSOL_MINT } from './utils/constants.ts'
import { TestContextClass } from './utils/context.ts'
import { TradeDirection, getSwapResult } from './utils/swap-quote.ts'

const buyAmount = BigInt(LAMPORTS_PER_SOL)

describe('Fee Claim Tests', () => {
  let ctx: TestContextClass
  let token: Address
  let feeClaimer: KeyPairSigner
  let trader: KeyPairSigner

  // Initialize context once before all tests
  beforeAll(async () => {
    ctx = await TestContextClass.create()
    const result = await ctx.createConfigOnce(DEFAULT_CONFIG_ARGS)
    feeClaimer = result.feeClaimer
  })

  beforeEach(async () => {
    const result = await ctx.createFreshBondingCurve()
    token = result.token
    trader = await ctx.createTestTrader()
  })

  test('claim fees - protocol fees', async () => {
    const [initialCurveState, configState] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getConfigData({}),
    ])

    const buyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: buyExpected.outputAmount,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [postBuyCurveState, feeClaimerTokenBalance] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getTokenBalance({ address: feeClaimer.address, mint: WSOL_MINT }),
    ])

    expect(postBuyCurveState.data.protocolFee).toBe(buyExpected.protocolFee)

    await ctx.claimProtocolFees({
      feeClaimer,
      baseMint: token,
    })

    const [postClaimFeeBalance, curveStateAfterFirstClaim] = await Promise.all([
      ctx.getTokenBalance({
        address: feeClaimer.address,
        mint: WSOL_MINT,
      }),
      ctx.getBondingCurveData({ baseMint: token }),
    ])

    expect(postClaimFeeBalance).toBe(feeClaimerTokenBalance + buyExpected.protocolFee)
    expect(curveStateAfterFirstClaim.data.protocolFee).toBe(0n)

    const sellExpected = getSwapResult({
      curveState: curveStateAfterFirstClaim.data,
      configState: configState.data,
      amountIn: buyExpected.outputAmount,
      tradeDirection: TradeDirection.BaseToQuote,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyExpected.outputAmount,
      minimumAmountOut: sellExpected.outputAmount,
      tradeDirection: TradeDirection.BaseToQuote,
    })

    const postSellCurveState = await ctx.getBondingCurveData({ baseMint: token })

    expect(postSellCurveState.data.protocolFee).toBe(sellExpected.protocolFee)

    await ctx.claimProtocolFees({
      feeClaimer,
      baseMint: token,
    })

    const [finalCurveState, finalFeeClaimerTokenBalance] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getTokenBalance({ address: feeClaimer.address, mint: WSOL_MINT }),
    ])

    expect(finalCurveState.data.protocolFee).toBe(0n)
    expect(finalFeeClaimerTokenBalance).toBe(postClaimFeeBalance + sellExpected.protocolFee)
  })

  test('claim fees - creator fees', async () => {
    const creator = await ctx.createTestTrader()
    const result = await ctx.createFreshBondingCurve(undefined, creator)
    token = result.token

    const [initialCurveState, configState] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getConfigData({}),
    ])

    const buyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: buyExpected.outputAmount,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const postBuyCurveState = await ctx.getBondingCurveData({ baseMint: token })
    expect(postBuyCurveState.data.creatorFee).toBe(buyExpected.creatorFee)

    await ctx.claimCreatorFee({
      creator,
      baseMint: token,
    })

    const [postClaimCreatorBalance, curveStateAfterFirstClaim] = await Promise.all([
      ctx.getTokenBalance({
        address: creator.address,
        mint: WSOL_MINT,
      }),
      ctx.getBondingCurveData({ baseMint: token }),
    ])

    expect(postClaimCreatorBalance).toBe(buyExpected.creatorFee)
    expect(curveStateAfterFirstClaim.data.creatorFee).toBe(0n)

    const sellExpected = getSwapResult({
      curveState: curveStateAfterFirstClaim.data,
      configState: configState.data,
      amountIn: buyExpected.outputAmount,
      tradeDirection: TradeDirection.BaseToQuote,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyExpected.outputAmount,
      minimumAmountOut: sellExpected.outputAmount,
      tradeDirection: TradeDirection.BaseToQuote,
    })

    const postSellCurveState = await ctx.getBondingCurveData({ baseMint: token })

    expect(postSellCurveState.data.creatorFee).toBe(sellExpected.creatorFee)

    await ctx.claimCreatorFee({
      creator,
      baseMint: token,
    })

    const [finalCurveState, finalCreatorTokenBalance] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getTokenBalance({ address: creator.address, mint: WSOL_MINT }),
    ])

    expect(finalCurveState.data.creatorFee).toBe(0n)
    expect(finalCreatorTokenBalance).toBe(postClaimCreatorBalance + sellExpected.creatorFee)
  })

  test('claim fees - non-feeclaimer cannot claim protocol fees', async () => {
    const unauthorizedUser = await ctx.createTestTrader()
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    // Attempt to claim protocol fees with unauthorized user should fail
    expect(
      ctx.claimProtocolFees({
        feeClaimer: unauthorizedUser,
        baseMint: token,
      }),
    ).rejects.toThrow()

    // Verify fees are still in the curve
    const curveStateAfterFailedClaim = await ctx.getBondingCurveData({ baseMint: token })
    expect(curveStateAfterFailedClaim.data.protocolFee).toBeGreaterThan(0n)
  })

  test('claim fees - non-creator cannot claim creator fees', async () => {
    const creator = await ctx.createTestTrader()
    const unauthorizedUser = await ctx.createTestTrader()
    const result = await ctx.createFreshBondingCurve(undefined, creator)
    token = result.token

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    // Attempt to claim creator fees with unauthorized user should fail
    expect(
      ctx.claimCreatorFee({
        creator: unauthorizedUser,
        baseMint: token,
      }),
    ).rejects.toThrow()

    // Verify fees are still in the curve
    const curveStateAfterFailedClaim = await ctx.getBondingCurveData({ baseMint: token })
    expect(curveStateAfterFailedClaim.data.creatorFee).toBeGreaterThan(0n)
  })
})
