import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { type Address, type KeyPairSigner, LAMPORTS_PER_SOL } from 'gill'
import { TOKEN_PROGRAM_ADDRESS, getAssociatedTokenAccountAddress } from 'gill/programs/token'
import { fetchBondingCurve } from '~/clients'
import { DEFAULT_CONFIG_ARGS, TOKEN_TOTAL_SUPPLY, WSOL_MINT } from './utils/constants.ts'
import { TestContextClass } from './utils/context.ts'
import { TradeDirection, getSwapResult } from './utils/swap-quote.ts'

// Test Constants
const buyAmount = BigInt(LAMPORTS_PER_SOL)

describe('Swap Tests', () => {
  let ctx: TestContextClass
  let token: Address
  let curve: Address
  let trader: KeyPairSigner

  // Initialize context once before all tests
  beforeAll(async () => {
    ctx = await TestContextClass.create()
    await ctx.createConfigOnce(DEFAULT_CONFIG_ARGS)
  })

  beforeEach(async () => {
    const result = await ctx.createFreshBondingCurve()
    token = result.token
    curve = result.curvePda
    trader = await ctx.createTestTrader()
  })

  test('swap - overall no cashback no referral', async () => {
    // Get initial balances before any trading
    const [initialCurveState, configState, traderInitialSolBalance, curveInitialQuoteBalance, curveInitialBaseBalance] =
      await Promise.all([
        ctx.getBondingCurveData({ baseMint: token }),
        ctx.getConfigData({}),
        ctx.getBalance(trader.address),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
      ])

    const firstBuyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    // Execute first buy transaction
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: firstBuyExpected.outputAmount, // slippage of 0%
      tradeDirection: TradeDirection.QuoteToBase,
    })

    // Get balances after first buy
    const [
      curveStateAfterFirstBuy,
      traderSolAfterFirstBuy,
      traderTokensAfterFirstBuy,
      curveQuoteAfterFirstBuy,
      curveBaseAfterFirstBuy,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
      ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
    ])

    const secondBuyExpected = getSwapResult({
      curveState: curveStateAfterFirstBuy.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    // Verify first buy transaction results
    expect(traderInitialSolBalance - traderSolAfterFirstBuy).toBeGreaterThanOrEqual(buyAmount)
    // creator fee stays with the curve
    expect(curveQuoteAfterFirstBuy - curveInitialQuoteBalance).toBe(buyAmount)
    expect(traderTokensAfterFirstBuy).toBeGreaterThan(0n)
    expect(curveInitialBaseBalance - curveBaseAfterFirstBuy).toBe(traderTokensAfterFirstBuy)
    expect(curveStateAfterFirstBuy.data.protocolFee).toBe(firstBuyExpected.protocolFee)
    expect(curveStateAfterFirstBuy.data.creatorFee).toBe(firstBuyExpected.creatorFee)
    expect(curveStateAfterFirstBuy.data.quoteReserve).toBe(initialCurveState.data.quoteReserve + buyAmount)
    expect(curveStateAfterFirstBuy.data.baseReserve).toBe(
      initialCurveState.data.baseReserve - traderTokensAfterFirstBuy,
    )
    // Verify token price increased (less tokens for same SOL amount)
    expect(firstBuyExpected.outputAmount).toBeGreaterThan(secondBuyExpected.outputAmount)
    expect(firstBuyExpected.outputAmount).toBe(traderTokensAfterFirstBuy)

    // Execute second buy transaction using swap
    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: secondBuyExpected.outputAmount,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [traderTotalTokensAfterSecondBuy, bondingCurveStateAfterSecondBuy] = await Promise.all([
      ctx.getTokenBalance({
        address: trader.address,
        mint: token,
      }),
      ctx.getBondingCurveData({ baseMint: token }),
    ])
    const tokensFromSecondBuy = traderTotalTokensAfterSecondBuy - traderTokensAfterFirstBuy

    // Verify second buy got fewer tokens (price impact)
    expect(traderTokensAfterFirstBuy).toBeGreaterThan(tokensFromSecondBuy)
    expect(bondingCurveStateAfterSecondBuy.data.quoteReserve).toBe(
      curveStateAfterFirstBuy.data.quoteReserve + buyAmount,
    )
    expect(bondingCurveStateAfterSecondBuy.data.baseReserve).toBe(
      curveStateAfterFirstBuy.data.baseReserve - tokensFromSecondBuy,
    )

    // Get balances before first sell
    const [
      curveStateBeforeFirstSell,
      traderSolBeforeFirstSell,
      traderTokensBeforeFirstSell,
      curveQuoteBeforeFirstSell,
      curveBaseBeforeFirstSell,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
      ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
    ])

    const firstSellExpected = getSwapResult({
      curveState: curveStateBeforeFirstSell.data,
      configState: configState.data,
      amountIn: tokensFromSecondBuy,
      tradeDirection: TradeDirection.BaseToQuote,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    // Execute first sell transaction (sell tokens from second buy) using swap
    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: tokensFromSecondBuy,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.BaseToQuote,
    })

    // Get balances after first sell
    const [
      curveStateAfterFirstSell,
      traderSolAfterFirstSell,
      traderTokensAfterFirstSell,
      curveQuoteAfterFirstSell,
      curveBaseAfterFirstSell,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
      ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
    ])

    // Verify first sell transaction results
    expect(curveStateAfterFirstSell.data.protocolFee).toBe(
      firstBuyExpected.protocolFee + secondBuyExpected.protocolFee + firstSellExpected.protocolFee,
    )
    expect(curveStateAfterFirstSell.data.creatorFee).toBe(
      firstBuyExpected.creatorFee + secondBuyExpected.creatorFee + firstSellExpected.creatorFee,
    )
    expect(traderTokensBeforeFirstSell - traderTokensAfterFirstSell).toBe(tokensFromSecondBuy)
    expect(traderSolAfterFirstSell - traderSolBeforeFirstSell).toBeGreaterThan(0n)
    expect(curveQuoteBeforeFirstSell).toBeGreaterThan(curveQuoteAfterFirstSell)
    expect(curveBaseBeforeFirstSell).toBeLessThan(curveBaseAfterFirstSell)

    // Execute final sell transaction (sell remaining tokens) using swap
    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: traderTokensAfterFirstSell,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.BaseToQuote,
    })

    // Get final balances after all trading is complete
    const [traderFinalSolBalance, traderFinalTokenBalance, curveFinalQuoteBalance, curveFinalBaseBalance] =
      await Promise.all([
        ctx.getBalance(trader.address),
        ctx.getTokenBalance({ address: trader.address, mint: token }),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: WSOL_MINT }),
        ctx.getVaultTokenBalance({ curvePda: curve, mint: token }),
      ])

    // Verify final state after all trading
    expect(traderFinalSolBalance).toBeGreaterThan(traderSolAfterFirstSell)
    expect(traderFinalTokenBalance).toBe(0n)

    // The bonding curve quote balance should be greater than initial due to accumulated fees
    expect(curveFinalQuoteBalance).toBeGreaterThan(curveInitialQuoteBalance)

    // After selling all tokens back, the bonding curve should have all tokens back
    expect(curveFinalBaseBalance).toBe(curveInitialBaseBalance)
  })

  test('swap - overall with referrer no cashback', async () => {
    const [l1Referrer, l2Referrer, l3Referrer] = await Promise.all([
      ctx.createTestTrader(),
      ctx.createTestTrader(),
      ctx.createTestTrader(),
    ])

    // Create cashback accounts for referrers (they need these to receive referral rewards)
    await Promise.all([
      ctx.createCashbackAccount(l1Referrer),
      ctx.createCashbackAccount(l2Referrer),
      ctx.createCashbackAccount(l3Referrer),
    ])

    const [
      initialCurveState,
      configState,
      traderBalanceBefore,
      l1ReferrerTokenBalanceBefore,
      l2ReferrerTokenBalanceBefore,
      l3ReferrerTokenBalanceBefore,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getConfigData({}),
      ctx.getBalance(trader.address),
      ctx.getCashbackTokenBalance({ user: l1Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l2Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l3Referrer.address }),
    ])

    const buyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: true,
      hasL2Referral: true,
      hasL3Referral: true,
    })

    // Execute swap (buy) with referrers but no trader cashback
    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
      l1Referrer: l1Referrer.address,
      l2Referrer: l2Referrer.address,
      l3Referrer: l3Referrer.address,
    })

    const [
      curveStateBeforeSell,
      traderBalanceAfterBuy,
      traderTokenBalanceAfterBuy,
      l1ReferrerTokenBalanceAfterBuy,
      l2ReferrerTokenBalanceAfterBuy,
      l3ReferrerTokenBalanceAfterBuy,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getCashbackTokenBalance({ user: l1Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l2Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l3Referrer.address }),
    ])

    // Calculate fees collected from buy
    const feeClaimerFeeCollected = curveStateBeforeSell.data.protocolFee - initialCurveState.data.protocolFee
    const creatorFeeCollected = curveStateBeforeSell.data.creatorFee - initialCurveState.data.creatorFee
    const l1ReferrerFeeCollected = l1ReferrerTokenBalanceAfterBuy - l1ReferrerTokenBalanceBefore
    const l2ReferrerFeeCollected = l2ReferrerTokenBalanceAfterBuy - l2ReferrerTokenBalanceBefore
    const l3ReferrerFeeCollected = l3ReferrerTokenBalanceAfterBuy - l3ReferrerTokenBalanceBefore
    const traderSpent = traderBalanceBefore - traderBalanceAfterBuy

    // Verify referrers received correct fees
    expect(l1ReferrerFeeCollected).toBe(buyExpected.l1ReferralFee)
    expect(l2ReferrerFeeCollected).toBe(buyExpected.l2ReferralFee)
    expect(l3ReferrerFeeCollected).toBe(buyExpected.l3ReferralFee)
    expect(feeClaimerFeeCollected).toBe(buyExpected.protocolFee)
    expect(creatorFeeCollected).toBe(buyExpected.creatorFee)
    expect(traderSpent).toBeGreaterThanOrEqual(buyAmount)
    expect(traderTokenBalanceAfterBuy).toBe(buyExpected.outputAmount)

    const sellExpected = getSwapResult({
      curveState: curveStateBeforeSell.data,
      configState: configState.data,
      amountIn: traderTokenBalanceAfterBuy,
      tradeDirection: TradeDirection.BaseToQuote,
      hasL1Referral: true,
      hasL2Referral: true,
      hasL3Referral: true,
    })

    // Execute swap (sell) with referrers but no trader cashback
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: traderTokenBalanceAfterBuy,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.BaseToQuote,
      l1Referrer: l1Referrer.address,
      l2Referrer: l2Referrer.address,
      l3Referrer: l3Referrer.address,
    })

    const [
      curveStateAfterSell,
      traderBalanceAfterSell,
      traderTokenBalanceAfterSell,
      l1ReferrerTokenBalanceAfterSell,
      l2ReferrerTokenBalanceAfterSell,
      l3ReferrerTokenBalanceAfterSell,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getCashbackTokenBalance({ user: l1Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l2Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l3Referrer.address }),
    ])

    // Calculate fees collected from sell
    const feeClaimerFeeCollectedFromSell = curveStateAfterSell.data.protocolFee - curveStateBeforeSell.data.protocolFee
    const creatorFeeCollectedFromSell = curveStateAfterSell.data.creatorFee - curveStateBeforeSell.data.creatorFee
    const l1ReferrerFeeCollectedFromSell = l1ReferrerTokenBalanceAfterSell - l1ReferrerTokenBalanceAfterBuy
    const l2ReferrerFeeCollectedFromSell = l2ReferrerTokenBalanceAfterSell - l2ReferrerTokenBalanceAfterBuy
    const l3ReferrerFeeCollectedFromSell = l3ReferrerTokenBalanceAfterSell - l3ReferrerTokenBalanceAfterBuy

    // Verify sell fees
    expect(l1ReferrerFeeCollectedFromSell).toBe(sellExpected.l1ReferralFee)
    expect(l2ReferrerFeeCollectedFromSell).toBe(sellExpected.l2ReferralFee)
    expect(l3ReferrerFeeCollectedFromSell).toBe(sellExpected.l3ReferralFee)
    expect(feeClaimerFeeCollectedFromSell).toBe(sellExpected.protocolFee)
    expect(creatorFeeCollectedFromSell).toBe(sellExpected.creatorFee)
    expect(traderTokenBalanceAfterSell).toBe(0n)
    expect(traderBalanceAfterSell - (traderBalanceAfterBuy + sellExpected.outputAmount)).toBeLessThan(100_000n) // Allow small gas fee variance

    // Verify cumulative referrer balances
    expect(l1ReferrerTokenBalanceAfterSell).toBe(
      l1ReferrerTokenBalanceBefore + buyExpected.l1ReferralFee + sellExpected.l1ReferralFee,
    )
    expect(l2ReferrerTokenBalanceAfterSell).toBe(
      l2ReferrerTokenBalanceBefore + buyExpected.l2ReferralFee + sellExpected.l2ReferralFee,
    )
    expect(l3ReferrerTokenBalanceAfterSell).toBe(
      l3ReferrerTokenBalanceBefore + buyExpected.l3ReferralFee + sellExpected.l3ReferralFee,
    )
  })

  test('swap - overall with referrer with cashback', async () => {
    const [l1Referrer, l2Referrer, l3Referrer] = await Promise.all([
      ctx.createTestTrader(),
      ctx.createTestTrader(),
      ctx.createTestTrader(),
    ])

    // Create cashback accounts for both trader and all referrers
    await Promise.all([
      ctx.createCashbackAccount(trader),
      ctx.createCashbackAccount(l1Referrer),
      ctx.createCashbackAccount(l2Referrer),
      ctx.createCashbackAccount(l3Referrer),
    ])

    const [
      initialCurveState,
      configState,
      traderBalanceBefore,
      traderCashbackBalanceBefore,
      l1ReferrerTokenBalanceBefore,
      l2ReferrerTokenBalanceBefore,
      l3ReferrerTokenBalanceBefore,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getConfigData({}),
      ctx.getBalance(trader.address),
      ctx.getCashbackBalance({ user: trader.address }),
      ctx.getCashbackTokenBalance({ user: l1Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l2Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l3Referrer.address }),
    ])

    // check if trader cashback is initialized
    expect(traderCashbackBalanceBefore).toBeGreaterThan(0n)

    const buyExpected = getSwapResult({
      curveState: initialCurveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: true,
      hasL2Referral: true,
      hasL3Referral: true,
      cashbackTier: 0, // Wood tier
    })

    // Execute swap (buy) with referrers and trader cashback
    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
      cashbackAddress: trader.address,
      l1Referrer: l1Referrer.address,
      l2Referrer: l2Referrer.address,
      l3Referrer: l3Referrer.address,
    })

    const traderTokenAccount = await getAssociatedTokenAccountAddress(token, trader.address, TOKEN_PROGRAM_ADDRESS)

    const [
      curveStateAfterBuy,
      traderBalanceAfterBuy,
      traderTokenBalanceAfterBuy,
      traderCashbackTokenBalanceAfterBuy,
      traderTokenAccountRentExempt,
      l1ReferrerTokenBalanceAfterBuy,
      l2ReferrerTokenBalanceAfterBuy,
      l3ReferrerTokenBalanceAfterBuy,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getCashbackTokenBalance({ user: trader.address }),
      ctx.getBalance(traderTokenAccount),
      ctx.getCashbackTokenBalance({ user: l1Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l2Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l3Referrer.address }),
    ])

    // Calculate fees collected from buy
    const protocolFeeCollected = curveStateAfterBuy.data.protocolFee - initialCurveState.data.protocolFee
    const creatorFeeCollected = curveStateAfterBuy.data.creatorFee - initialCurveState.data.creatorFee
    const l1ReferrerFeeCollected = l1ReferrerTokenBalanceAfterBuy - l1ReferrerTokenBalanceBefore
    const l2ReferrerFeeCollected = l2ReferrerTokenBalanceAfterBuy - l2ReferrerTokenBalanceBefore
    const l3ReferrerFeeCollected = l3ReferrerTokenBalanceAfterBuy - l3ReferrerTokenBalanceBefore
    const traderSpent = traderBalanceBefore - traderBalanceAfterBuy

    // Verify all parties received correct fees
    expect(l1ReferrerFeeCollected).toBe(buyExpected.l1ReferralFee)
    expect(l2ReferrerFeeCollected).toBe(buyExpected.l2ReferralFee)
    expect(l3ReferrerFeeCollected).toBe(buyExpected.l3ReferralFee)
    expect(traderTokenBalanceAfterBuy).toBe(buyExpected.outputAmount)
    expect(protocolFeeCollected).toBe(buyExpected.protocolFee)
    expect(creatorFeeCollected).toBe(buyExpected.creatorFee)
    expect(traderSpent).toBeGreaterThanOrEqual(buyAmount)
    expect(traderCashbackTokenBalanceAfterBuy).toBe(buyExpected.cashbackFee)

    const sellExpected = getSwapResult({
      curveState: curveStateAfterBuy.data,
      configState: configState.data,
      amountIn: traderTokenBalanceAfterBuy,
      tradeDirection: TradeDirection.BaseToQuote,
      hasL1Referral: true,
      hasL2Referral: true,
      hasL3Referral: true,
      cashbackTier: 0, // Wood tier
    })

    // Execute swap (sell) with referrers and trader cashback
    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: traderTokenBalanceAfterBuy,
      minimumAmountOut: sellExpected.outputAmount,
      tradeDirection: TradeDirection.BaseToQuote,
      cashbackAddress: trader.address,
      l1Referrer: l1Referrer.address,
      l2Referrer: l2Referrer.address,
      l3Referrer: l3Referrer.address,
    })

    const [
      curveStateAfterSell,
      traderBalanceAfterSell,
      traderTokenBalanceAfterSell,
      traderCashbackTokenBalanceAfterSell,
      l1ReferrerTokenBalanceAfterSell,
      l2ReferrerTokenBalanceAfterSell,
      l3ReferrerTokenBalanceAfterSell,
      cashbackRentExempt,
    ] = await Promise.all([
      ctx.getBondingCurveData({ baseMint: token }),
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getCashbackTokenBalance({ user: trader.address }),
      ctx.getCashbackTokenBalance({ user: l1Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l2Referrer.address }),
      ctx.getCashbackTokenBalance({ user: l3Referrer.address }),
      ctx.getCashbackAccountRentExempt(),
    ])

    // Calculate fees collected from sell
    const feeClaimerFeeCollectedFromSell = curveStateAfterSell.data.protocolFee - curveStateAfterBuy.data.protocolFee
    const creatorFeeCollectedFromSell = curveStateAfterSell.data.creatorFee - curveStateAfterBuy.data.creatorFee
    const traderCashbackFeeCollectedFromSell = traderCashbackTokenBalanceAfterSell - traderCashbackTokenBalanceAfterBuy
    const l1ReferrerFeeCollectedFromSell = l1ReferrerTokenBalanceAfterSell - l1ReferrerTokenBalanceAfterBuy
    const l2ReferrerFeeCollectedFromSell = l2ReferrerTokenBalanceAfterSell - l2ReferrerTokenBalanceAfterBuy
    const l3ReferrerFeeCollectedFromSell = l3ReferrerTokenBalanceAfterSell - l3ReferrerTokenBalanceAfterBuy

    // Verify sell fees
    expect(l1ReferrerFeeCollectedFromSell).toBe(sellExpected.l1ReferralFee)
    expect(l2ReferrerFeeCollectedFromSell).toBe(sellExpected.l2ReferralFee)
    expect(l3ReferrerFeeCollectedFromSell).toBe(sellExpected.l3ReferralFee)
    expect(feeClaimerFeeCollectedFromSell).toBe(sellExpected.protocolFee)
    expect(creatorFeeCollectedFromSell).toBe(sellExpected.creatorFee)
    expect(traderCashbackFeeCollectedFromSell).toBe(sellExpected.cashbackFee)
    expect(
      traderBalanceBefore -
        (traderBalanceAfterSell +
          traderTokenAccountRentExempt +
          cashbackRentExempt +
          buyExpected.tradingFee +
          sellExpected.tradingFee),
    ).toBeLessThan(100_000n) // Allow small gas fee variance
    expect(traderTokenBalanceAfterSell).toBe(0n)

    // Verify cumulative balances include both buy and sell rewards
    expect(l1ReferrerTokenBalanceAfterSell).toBe(
      l1ReferrerTokenBalanceBefore + buyExpected.l1ReferralFee + sellExpected.l1ReferralFee,
    )
    expect(l2ReferrerTokenBalanceAfterSell).toBe(
      l2ReferrerTokenBalanceBefore + buyExpected.l2ReferralFee + sellExpected.l2ReferralFee,
    )
    expect(l3ReferrerTokenBalanceAfterSell).toBe(
      l3ReferrerTokenBalanceBefore + buyExpected.l3ReferralFee + sellExpected.l3ReferralFee,
    )
    expect(traderCashbackTokenBalanceAfterSell).toBe(buyExpected.cashbackFee + sellExpected.cashbackFee)
  })

  test('swap - small amounts', async () => {
    const smallBuyAmount = 10n // 10 lamports (0.00001 SOL)
    const initialTraderSolBalance = await ctx.getBalance(trader.address)

    await ctx.swap({
      trader,
      baseMint: token,
      amountIn: smallBuyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [solBalanceAfterBuy, traderTokenBalance, bondingCurveTokenBalance] = await Promise.all([
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({ address: trader.address, mint: token }),
      ctx.getBalance(curve),
      ctx.getVaultTokenBalance({ mint: token, curvePda: curve }),
    ])

    expect(initialTraderSolBalance).toBeGreaterThan(solBalanceAfterBuy)
    expect(traderTokenBalance).toBeGreaterThan(0n)
    expect(bondingCurveTokenBalance).toBeLessThan(TOKEN_TOTAL_SUPPLY)

    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: traderTokenBalance,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.BaseToQuote,
    })

    const tokenBalanceAfter = await ctx.getTokenBalance({ address: trader.address, mint: token })
    expect(tokenBalanceAfter).toBe(0n)
  })

  test('swap - slippage', async () => {
    await ctx.createCashbackAccount(trader)

    const curveState = await ctx.getBondingCurveData({ baseMint: token })
    const configState = await ctx.getConfigData({})
    const expectedTokensResult = getSwapResult({
      curveState: curveState.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })
    const expectedTokens = expectedTokensResult.outputAmount

    // Set minimum to more than possible (simulate slippage exceeded)
    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: buyAmount,
        minimumAmountOut: expectedTokens + 10n, // Impossible to achieve
        tradeDirection: TradeDirection.QuoteToBase,
        cashbackAddress: trader.address,
      }),
    ).rejects.toThrow()

    const initialTraderBalance = await ctx.getBalance(trader.address)
    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
      cashbackAddress: trader.address,
    })

    const [traderBalanceAfterBuy, traderTokenBalance] = await Promise.all([
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({
        address: trader.address,
        mint: token,
      }),
    ])

    const actualBuyCost = initialTraderBalance - traderBalanceAfterBuy
    // token account rent exemption is about 0.002 SOL
    expect(actualBuyCost).toBeGreaterThan(buyAmount)

    const sellCurveState = await ctx.getBondingCurveData({ baseMint: token })
    const sellConfigState = await ctx.getConfigData({})
    const sellResult = getSwapResult({
      curveState: sellCurveState.data,
      configState: sellConfigState.data,
      amountIn: traderTokenBalance,
      tradeDirection: TradeDirection.BaseToQuote,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: traderTokenBalance,
        minimumAmountOut: sellResult.outputAmount + 1n, // Impossible to achieve
        tradeDirection: TradeDirection.BaseToQuote,
        cashbackAddress: trader.address,
      }),
    ).rejects.toThrow()

    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: traderTokenBalance,
      minimumAmountOut: sellResult.outputAmount,
      tradeDirection: TradeDirection.BaseToQuote,
      cashbackAddress: trader.address,
    })

    const [finalTraderBalance, finalTraderTokenBalance] = await Promise.all([
      ctx.getBalance(trader.address),
      ctx.getTokenBalance({
        address: trader.address,
        mint: token,
      }),
    ])

    // Calculate gas cost for, sell transaction
    const gasCost = 5000n
    const actualSellProceeds = finalTraderBalance - traderBalanceAfterBuy

    // Verify sell proceeds minus gas
    expect(actualSellProceeds).toBe(sellResult.outputAmount - gasCost)
    expect(finalTraderTokenBalance).toBe(0n)
  })

  test('swap - fails with insufficient funds', async () => {
    const trader = await ctx.createTestTrader(BigInt(LAMPORTS_PER_SOL) / 2n) // Only 0.5 SOL

    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: BigInt(LAMPORTS_PER_SOL), // Try to buy with 1 SOL
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.QuoteToBase,
      }),
    ).rejects.toThrow()
  })

  test('swap - fails with insufficient tokens', async () => {
    // Try to sell tokens without owning any
    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: BigInt(1000),
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.BaseToQuote,
      }),
    ).rejects.toThrow()
  })

  test('swap - bonding curve reserves update correctly', async () => {
    const buyAmount = BigInt(LAMPORTS_PER_SOL)

    const [curveStateBefore, configState] = await Promise.all([
      fetchBondingCurve(ctx.rpc, curve),
      ctx.getConfigData({}),
    ])

    const swapResult = getSwapResult({
      curveState: curveStateBefore.data,
      configState: configState.data,
      amountIn: buyAmount,
      tradeDirection: TradeDirection.QuoteToBase,
      hasL1Referral: false,
      hasL2Referral: false,
      hasL3Referral: false,
    })

    await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })

    const [curveStateAfter, tokensReceived, curveQuoteVaultBalance, curveBaseVaultBalance] = await Promise.all([
      fetchBondingCurve(ctx.rpc, curve),
      ctx.getTokenBalance({
        address: trader.address,
        mint: token,
      }),
      ctx.getVaultTokenBalance({ mint: WSOL_MINT, curvePda: curve }),
      ctx.getVaultTokenBalance({ mint: token, curvePda: curve }),
    ])

    // The entire buyAmount is added to the bonding curve's quote reserves
    expect(curveStateAfter.data.quoteReserve).toBe(curveStateBefore.data.quoteReserve + buyAmount)
    expect(curveStateAfter.data.baseReserve).toBe(curveStateBefore.data.baseReserve - tokensReceived)
    expect(curveStateAfter.data.creatorFee).toBe(swapResult.creatorFee)
    expect(curveStateAfter.data.quoteReserve).toBe(curveQuoteVaultBalance)
    expect(curveStateAfter.data.baseReserve).toBe(curveBaseVaultBalance)
  })

  test('swap - multiple small buys vs single large buy price impact', async () => {
    const [trader1, trader2, { token: tokenA }, { token: tokenB }] = await Promise.all([
      ctx.createTestTrader(),
      ctx.createTestTrader(),
      ctx.createFreshBondingCurve(),
      ctx.createFreshBondingCurve(),
    ])

    const smallAmount = BigInt(LAMPORTS_PER_SOL) / 5n
    const largeAmount = BigInt(LAMPORTS_PER_SOL)

    // Execute 5 small buys for trader1 sequentially on the same curve
    let totalTokensFromSmallBuys = 0n
    await Promise.all([
      ...Array.from({ length: 5 }).map(
        async () =>
          await ctx.swap({
            trader: trader1,
            baseMint: tokenA,
            amountIn: smallAmount,
            minimumAmountOut: 0n,
            tradeDirection: TradeDirection.QuoteToBase,
          }),
      ),
    ])
    totalTokensFromSmallBuys = await ctx.getTokenBalance({
      address: trader1.address,
      mint: tokenA,
    })

    // Execute 1 large buy for trader2
    await ctx.swap({
      trader: trader2,
      baseMint: tokenB,
      amountIn: largeAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })
    const tokensFromLargeBuy = await ctx.getTokenBalance({
      address: trader2.address,
      mint: tokenB,
    })

    // Small buys and big buy should yield the same amount of tokens
    expect(totalTokensFromSmallBuys - tokensFromLargeBuy).toBeLessThan(10n)
  })

  test('swap - error handling for zero amounts', async () => {
    // Test zero buy amount
    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: 0n,
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.QuoteToBase,
      }),
    ).rejects.toThrow()

    // Test zero sell amount
    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: 0n,
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.BaseToQuote,
      }),
    ).rejects.toThrow()
  })

  test('swap - fails with invalid cashback account', async () => {
    const newTrader = await ctx.createTestTrader()
    await ctx.createCashbackAccount(newTrader)

    expect(
      ctx.swap({
        trader: trader,
        baseMint: token,
        amountIn: buyAmount,
        minimumAmountOut: 0n,
        tradeDirection: TradeDirection.QuoteToBase,
        cashbackAddress: newTrader.address,
      }),
    ).rejects.toThrow()
  })

  /**
   * Creating a fresh cashback account takes about extra 34000 compute units.
   */
  test.skip('simulate gas prices', async () => {
    const firstSwap = await ctx.swap({
      trader: trader,
      baseMint: token,
      amountIn: buyAmount,
      minimumAmountOut: 0n,
      tradeDirection: TradeDirection.QuoteToBase,
    })
    // TODO: Check the compute units used for the first swap
  })
})
