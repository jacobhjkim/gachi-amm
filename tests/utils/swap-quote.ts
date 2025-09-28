import type { BondingCurve, Config } from '~/clients'
import { FEE_DENOMINATOR } from './constants'

export enum TradeDirection {
  BaseToQuote = 0,
  QuoteToBase = 1,
}

export interface FeeBreakdown {
  amount: bigint
  l1ReferralFee: bigint
  l2ReferralFee: bigint
  l3ReferralFee: bigint
  creatorFee: bigint
  cashbackFee: bigint
  protocolFee: bigint
}

export interface SwapResult {
  actualInputAmount: bigint
  outputAmount: bigint
  tradingFee: bigint
  protocolFee: bigint
  cashbackFee: bigint
  creatorFee: bigint
  l1ReferralFee: bigint
  l2ReferralFee: bigint
  l3ReferralFee: bigint
}

// Helper functions for safe math operations
function safeSub(a: bigint, b: bigint): bigint {
  if (a < b) {
    throw new Error('Math underflow')
  }
  return a - b
}

function safeAdd(a: bigint, b: bigint): bigint {
  const result = a + b
  if (result < a || result < b) {
    throw new Error('Math overflow')
  }
  return result
}

function safeMul(a: bigint, b: bigint): bigint {
  const result = a * b
  if (a !== 0n && result / a !== b) {
    throw new Error('Math overflow')
  }
  return result
}

function safeDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    throw new Error('Division by zero')
  }
  return a / b
}

// Implements safe_mul_div_cast_u64 with rounding
function safeMulDiv(x: bigint, y: bigint, denominator: bigint, roundUp: boolean): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero')
  }
  const prod = safeMul(x, y)
  if (roundUp) {
    return safeDiv(safeAdd(safeAdd(prod, denominator), -1n), denominator)
  }
  return safeDiv(prod, denominator)
}

// Get cashback BPS based on tier
function getCashbackBps(cashbackTier?: number): bigint {
  const CASHBACK_BPS_MAP: Record<number, bigint> = {
    0: 50n, // Wood
    1: 100n, // Bronze
    2: 125n, // Silver
    3: 150n, // Gold
    4: 175n, // Platinum
    5: 200n, // Diamond
    6: 250n, // Champion
  }
  return cashbackTier !== undefined ? CASHBACK_BPS_MAP[cashbackTier] || 0n : 0n
}

// Implements Config::get_fee_on_amount
export function getFeeOnAmount(
  config: Config,
  amountIn: bigint,
  hasL1Referral: boolean,
  hasL2Referral: boolean,
  hasL3Referral: boolean,
  cashbackTier?: number,
): FeeBreakdown {
  const l1ReferralFee = hasL1Referral
    ? safeMulDiv(amountIn, BigInt(config.l1ReferralFeeBasisPoints), FEE_DENOMINATOR, false)
    : 0n

  const l2ReferralFee = hasL2Referral
    ? safeMulDiv(amountIn, BigInt(config.l2ReferralFeeBasisPoints), FEE_DENOMINATOR, false)
    : 0n

  const l3ReferralFee = hasL3Referral
    ? safeMulDiv(amountIn, BigInt(config.l3ReferralFeeBasisPoints), FEE_DENOMINATOR, false)
    : 0n

  const cashbackBps = getCashbackBps(cashbackTier)
  const cashbackFee = safeMulDiv(amountIn, cashbackBps, FEE_DENOMINATOR, false)
  const creatorFee = safeMulDiv(amountIn, BigInt(config.creatorFeeBasisPoints), FEE_DENOMINATOR, false)

  const hasReferral = hasL1Referral || hasL2Referral || hasL3Referral
  const effectiveFeeBasisPoints = hasReferral
    ? BigInt(config.feeBasisPoints - config.refereeDiscountBasisPoints)
    : BigInt(config.feeBasisPoints)

  const totalFee = safeMulDiv(amountIn, effectiveFeeBasisPoints, FEE_DENOMINATOR, false)

  const protocolFee = safeSub(
    safeSub(safeSub(safeSub(safeSub(totalFee, l1ReferralFee), l2ReferralFee), l3ReferralFee), creatorFee),
    cashbackFee,
  )

  const amount = safeSub(amountIn, totalFee)

  return {
    amount,
    protocolFee,
    cashbackFee,
    creatorFee,
    l1ReferralFee,
    l2ReferralFee,
    l3ReferralFee,
  }
}

// Sum all fees in FeeBreakdown
function sumFeeBreakdown(feeBreakdown: FeeBreakdown): bigint {
  return safeAdd(
    safeAdd(
      safeAdd(
        safeAdd(safeAdd(feeBreakdown.l1ReferralFee, feeBreakdown.l2ReferralFee), feeBreakdown.l3ReferralFee),
        feeBreakdown.creatorFee,
      ),
      feeBreakdown.cashbackFee,
    ),
    feeBreakdown.protocolFee,
  )
}

// Implements get_swap_amount_from_quote_to_base (aka buy)
export function getSwapAmountFromQuoteToBase(virtualQuote: bigint, virtualBase: bigint, amountIn: bigint): bigint {
  // Scale tokens for precision
  // Assuming quote token has 9 decimals and base token has 6 decimals
  const virtualBaseScaled = safeMul(virtualBase, 1000n)
  const k = safeMul(virtualQuote, virtualBaseScaled)
  const newVirtualQuote = safeAdd(virtualQuote, amountIn)
  const newVirtualBaseScaled = safeDiv(k, newVirtualQuote)
  const baseOutAmount = safeDiv(safeSub(virtualBaseScaled, newVirtualBaseScaled), 1000n)

  return baseOutAmount
}

// Implements get_swap_amount_from_base_to_quote (aka sell)
export function getSwapAmountFromBaseToQuote(virtualQuote: bigint, virtualBase: bigint, amountIn: bigint): bigint {
  // Scale tokens for precision
  // Assuming quote token has 9 decimals and base token has 6 decimals
  const virtualBaseScaled = safeMul(virtualBase, 1000n)
  const amountInScaled = safeMul(amountIn, 1000n)
  const newVirtualBaseScaled = safeAdd(virtualBaseScaled, amountInScaled)

  // Calculate using x*y=k
  const k = safeMul(virtualBaseScaled, virtualQuote)
  const newQuote = safeDiv(k, newVirtualBaseScaled)
  const quoteOutAmount = safeSub(virtualQuote, newQuote)

  return quoteOutAmount
}

// Implements BondingCurve::get_swap_result
export function getSwapResult({
  curveState,
  configState,
  amountIn,
  tradeDirection,
  hasL1Referral,
  hasL2Referral,
  hasL3Referral,
  cashbackTier,
}: {
  curveState: BondingCurve
  configState: Config
  amountIn: bigint
  tradeDirection: TradeDirection
  hasL1Referral: boolean
  hasL2Referral: boolean
  hasL3Referral: boolean
  cashbackTier?: number
}): SwapResult {
  let protocolFee = 0n
  let tradingFee = 0n
  let l1ReferralFee = 0n
  let l2ReferralFee = 0n
  let l3ReferralFee = 0n
  let creatorFee = 0n
  let cashbackFee = 0n

  let actualAmountIn = amountIn

  if (tradeDirection === TradeDirection.QuoteToBase) {
    // Apply fees on input for buying
    const feeBreakdown = getFeeOnAmount(
      configState,
      amountIn,
      hasL1Referral,
      hasL2Referral,
      hasL3Referral,
      cashbackTier,
    )

    protocolFee = feeBreakdown.protocolFee
    tradingFee = sumFeeBreakdown(feeBreakdown)
    l1ReferralFee = feeBreakdown.l1ReferralFee
    l2ReferralFee = feeBreakdown.l2ReferralFee
    l3ReferralFee = feeBreakdown.l3ReferralFee
    creatorFee = feeBreakdown.creatorFee
    cashbackFee = feeBreakdown.cashbackFee

    actualAmountIn = feeBreakdown.amount
  }

  // Calculate swap output amount
  const outputAmount =
    tradeDirection === TradeDirection.QuoteToBase
      ? getSwapAmountFromQuoteToBase(curveState.virtualQuoteReserve, curveState.virtualBaseReserve, actualAmountIn)
      : getSwapAmountFromBaseToQuote(curveState.virtualQuoteReserve, curveState.virtualBaseReserve, actualAmountIn)

  let actualAmountOut = outputAmount

  if (tradeDirection === TradeDirection.QuoteToBase) {
    // Check graduation threshold for buying
    if (
      outputAmount >= curveState.baseReserve ||
      safeSub(curveState.baseReserve, outputAmount) < configState.migrationBaseThreshold
    ) {
      // Cap the output to leave migration threshold tokens
      const newBaseOutputAmount = safeSub(curveState.baseReserve, configState.migrationBaseThreshold)
      const newVirtualBase = safeSub(curveState.virtualBaseReserve, newBaseOutputAmount)

      // Recalculate the capped input amount
      const cappedAmountIn = getSwapAmountFromBaseToQuote(
        configState.migrationQuoteThreshold,
        newVirtualBase,
        newBaseOutputAmount,
      )

      // Recalculate fees with capped amount
      const feeBreakdown = getFeeOnAmount(
        configState,
        cappedAmountIn,
        hasL1Referral,
        hasL2Referral,
        hasL3Referral,
        cashbackTier,
      )

      protocolFee = feeBreakdown.protocolFee
      tradingFee = sumFeeBreakdown(feeBreakdown)
      l1ReferralFee = feeBreakdown.l1ReferralFee
      l2ReferralFee = feeBreakdown.l2ReferralFee
      l3ReferralFee = feeBreakdown.l3ReferralFee
      creatorFee = feeBreakdown.creatorFee
      cashbackFee = feeBreakdown.cashbackFee
      actualAmountIn = cappedAmountIn

      actualAmountOut = newBaseOutputAmount
    }
  } else {
    // Apply fees on output for selling
    const feeBreakdown = getFeeOnAmount(
      configState,
      outputAmount,
      hasL1Referral,
      hasL2Referral,
      hasL3Referral,
      cashbackTier,
    )

    protocolFee = feeBreakdown.protocolFee
    tradingFee = sumFeeBreakdown(feeBreakdown)
    l1ReferralFee = feeBreakdown.l1ReferralFee
    l2ReferralFee = feeBreakdown.l2ReferralFee
    l3ReferralFee = feeBreakdown.l3ReferralFee
    creatorFee = feeBreakdown.creatorFee
    cashbackFee = feeBreakdown.cashbackFee

    actualAmountOut = feeBreakdown.amount
  }

  return {
    actualInputAmount: actualAmountIn,
    outputAmount: actualAmountOut,
    tradingFee,
    protocolFee,
    cashbackFee,
    creatorFee,
    l1ReferralFee,
    l2ReferralFee,
    l3ReferralFee,
  }
}
