import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { Address, KeyPairSigner } from 'gill'
import { fetchBondingCurve } from '~/clients'
import { DEFAULT_CONFIG_ARGS, SINGLE_BUY_AMOUNT, WSOL_MINT } from './utils/constants.ts'
import { TestContextClass } from './utils/context.ts'
import { TradeDirection, getSwapResult } from './utils/swap-quote.ts'

describe('Cashback Tests', () => {
  let ctx: TestContextClass
  let token: Address
  let curve: Address
  let trader: KeyPairSigner

  // Initialize context once before all tests
  beforeAll(async () => {
    ctx = await TestContextClass.create()
    await ctx.createConfigOnce(DEFAULT_CONFIG_ARGS, WSOL_MINT)
  })

  beforeEach(async () => {
    const result = await ctx.createFreshBondingCurve()
    token = result.token
    curve = result.curvePda
    trader = await ctx.createTestTrader()
  })

  test('cashback - account initialization', async () => {
    await ctx.createCashbackAccount(trader)
    const accountData = await ctx.getCashbackAccountData(trader.address)
    expect(accountData.data.owner).toBe(trader.address)
    expect(accountData.data.currentTier).toBe(0)
    expect(accountData.data.lastClaimTimestamp).toBeGreaterThanOrEqual(0n)
  })

  test('cashback - account reinitialization should fail', async () => {
    await ctx.createCashbackAccount(trader)
    expect(ctx.createCashbackAccount(trader)).rejects.toThrow()
  })

  test(
    'cashback - only buy from wood to champion',
    async () => {
      const [configState, _] = await Promise.all([ctx.getConfigData({}), ctx.createCashbackAccount(trader)])

      for (let tier = 0; tier <= 6; tier++) {
        const [curveState, initialCashbackTokenBalance, userCashbackData] = await Promise.all([
          fetchBondingCurve(ctx.rpc, curve),
          ctx.getCashbackTokenAccountBalance({ user: trader.address }),
          ctx.getCashbackAccountData(trader.address),
        ])

        expect(userCashbackData.data.currentTier).toBe(tier)

        const swapResult = getSwapResult({
          curveState: curveState.data,
          configState: configState.data,
          amountIn: SINGLE_BUY_AMOUNT,
          tradeDirection: TradeDirection.QuoteToBase,
          hasL1Referral: false,
          hasL2Referral: false,
          hasL3Referral: false,
          cashbackTier: tier, // Wood tier
        })

        await ctx.swap({
          trader,
          baseMint: token,
          amountIn: SINGLE_BUY_AMOUNT,
          minimumAmountOut: swapResult.outputAmount,
          tradeDirection: TradeDirection.QuoteToBase,
          cashbackAddress: trader.address,
        })

        const finalCashbackTokenBalance = await ctx.getCashbackTokenAccountBalance({ user: trader.address })
        const actualTraderCashback = finalCashbackTokenBalance - initialCashbackTokenBalance
        expect(actualTraderCashback).toEqual(swapResult.cashbackFee)

        if (tier < 6) {
          // Update tier for next iteration
          await ctx.updateCashbackTier({
            user: trader.address,
            newTier: tier + 1,
          })
        }
      }
    },
    {
      timeout: 30_000,
    },
  )

  test(
    'cashback - buy and sell from wood to champion',
    async () => {
      const [configState, _] = await Promise.all([ctx.getConfigData({}), ctx.createCashbackAccount(trader)])

      for (let tier = 0; tier <= 6; tier++) {
        const [curveState, initialCashbackTokenBalance, userCashbackData] = await Promise.all([
          fetchBondingCurve(ctx.rpc, curve),
          ctx.getCashbackTokenAccountBalance({ user: trader.address }),
          ctx.getCashbackAccountData(trader.address),
        ])

        expect(userCashbackData.data.currentTier).toBe(tier)

        const buySwapResult = getSwapResult({
          curveState: curveState.data,
          configState: configState.data,
          amountIn: SINGLE_BUY_AMOUNT,
          tradeDirection: TradeDirection.QuoteToBase,
          hasL1Referral: false,
          hasL2Referral: false,
          hasL3Referral: false,
          cashbackTier: tier, // Wood tier
        })

        await ctx.swap({
          trader,
          baseMint: token,
          amountIn: SINGLE_BUY_AMOUNT,
          minimumAmountOut: buySwapResult.outputAmount,
          tradeDirection: TradeDirection.QuoteToBase,
          cashbackAddress: trader.address,
        })

        const [curveStateAfterBuy, traderTokenBalanceAfterBuy] = await Promise.all([
          fetchBondingCurve(ctx.rpc, curve),
          ctx.getTokenBalance({ address: trader.address, mint: token }),
        ])
        const sellSwapResult = getSwapResult({
          curveState: curveStateAfterBuy.data,
          configState: configState.data,
          amountIn: traderTokenBalanceAfterBuy,
          tradeDirection: TradeDirection.BaseToQuote,
          hasL1Referral: false,
          hasL2Referral: false,
          hasL3Referral: false,
          cashbackTier: tier, // Wood tier
        })

        await ctx.swap({
          trader,
          baseMint: token,
          amountIn: traderTokenBalanceAfterBuy,
          minimumAmountOut: sellSwapResult.outputAmount,
          tradeDirection: TradeDirection.BaseToQuote,
          cashbackAddress: trader.address,
        })

        const finalCashbackTokenBalance = await ctx.getCashbackTokenAccountBalance({ user: trader.address })
        const actualTraderCashback = finalCashbackTokenBalance - initialCashbackTokenBalance
        expect(actualTraderCashback).toEqual(buySwapResult.cashbackFee + sellSwapResult.cashbackFee)

        if (tier < 6) {
          // Update tier for next iteration
          await ctx.updateCashbackTier({
            user: trader.address,
            newTier: tier + 1,
          })
        }
      }
    },
    {
      timeout: 30_000,
    },
  )

  test.skip('cashback - claim', async () => {
    // TODO: time travel to claim cashback, maybe with liteSVM?
  })

  test.skip('cashback - reclaim', async () => {
    // TODO: time travel to reclaim cashback, maybe with liteSVM?
  })
})
