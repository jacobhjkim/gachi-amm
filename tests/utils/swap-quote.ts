import type { BondingCurve, Config } from '~/clients'
import { CASHBACK_BPS, FEE_DENOMINATOR, RESOLUTION } from './constants'
import { Rounding, mulDiv } from './math'

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

export interface SwapAmount {
  outputAmount: bigint
  nextSqrtPrice: bigint
}

export interface SwapResult {
  actualInputAmount: bigint
  outputAmount: bigint
  nextSqrtPrice: bigint
  tradingFee: bigint
  protocolFee: bigint
  cashbackFee: bigint
  creatorFee: bigint
  l1ReferralFee: bigint
  l2ReferralFee: bigint
  l3ReferralFee: bigint
}

// Math helper functions

// Implement FeeBreakdown sum method
function sumFeeBreakdown(feeBreakdown: FeeBreakdown): bigint {
  return (
    feeBreakdown.l1ReferralFee +
    feeBreakdown.l2ReferralFee +
    feeBreakdown.l3ReferralFee +
    feeBreakdown.creatorFee +
    feeBreakdown.cashbackFee +
    feeBreakdown.protocolFee
  )
}

export function getFeeOnAmount(
  configState: Config,
  amountIn: bigint,
  hasL1Referral: boolean,
  hasL2Referral: boolean,
  hasL3Referral: boolean,
  cashbackTier?: number,
): FeeBreakdown {
  const l1ReferralFee = hasL1Referral
    ? mulDiv(amountIn, BigInt(configState.l1ReferralFeeBasisPoints), FEE_DENOMINATOR, Rounding.Down)
    : 0n

  const l2ReferralFee = hasL2Referral
    ? mulDiv(amountIn, BigInt(configState.l2ReferralFeeBasisPoints), FEE_DENOMINATOR, Rounding.Down)
    : 0n

  const l3ReferralFee = hasL3Referral
    ? mulDiv(amountIn, BigInt(configState.l3ReferralFeeBasisPoints), FEE_DENOMINATOR, Rounding.Down)
    : 0n

  const cashbackBps = cashbackTier !== undefined ? CASHBACK_BPS[cashbackTier as keyof typeof CASHBACK_BPS] || 0n : 0n
  const cashbackFee = mulDiv(amountIn, cashbackBps, FEE_DENOMINATOR, Rounding.Down)

  const creatorFee = mulDiv(amountIn, BigInt(configState.creatorFeeBasisPoints), FEE_DENOMINATOR, Rounding.Down)

  const hasReferral = hasL1Referral || hasL2Referral || hasL3Referral
  const effectiveFeeBasisPoints = hasReferral
    ? configState.feeBasisPoints - configState.refereeDiscountBasisPoints
    : configState.feeBasisPoints

  const totalFee = mulDiv(amountIn, BigInt(effectiveFeeBasisPoints), FEE_DENOMINATOR, Rounding.Down)

  const protocolFee = totalFee - l1ReferralFee - l2ReferralFee - l3ReferralFee - creatorFee - cashbackFee
  const amount = amountIn - totalFee

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

// Curve math functions
export function getDeltaAmountQuoteUnsigned(
  lowerSqrtPrice: bigint,
  upperSqrtPrice: bigint,
  liquidity: bigint,
  rounding: Rounding,
): bigint {
  const deltaSqrtPrice = upperSqrtPrice - lowerSqrtPrice
  const prod = liquidity * deltaSqrtPrice

  if (rounding === Rounding.Up) {
    const denominator = 1n << BigInt(RESOLUTION * 2)
    return (prod + denominator - 1n) / denominator // ceiling division
  }
  return prod >> BigInt(RESOLUTION * 2)
}

export function getDeltaAmountBaseUnsigned(
  lowerSqrtPrice: bigint,
  upperSqrtPrice: bigint,
  liquidity: bigint,
  rounding: Rounding,
): bigint {
  const numerator1 = liquidity
  const numerator2 = upperSqrtPrice - lowerSqrtPrice
  const denominator = lowerSqrtPrice * upperSqrtPrice

  return mulDiv(numerator1, numerator2, denominator, rounding)
}

export function getNextSqrtPriceFromInput(
  sqrtPrice: bigint,
  liquidity: bigint,
  amountIn: bigint,
  baseForQuote: boolean,
): bigint {
  if (baseForQuote) {
    return getNextSqrtPriceFromAmountBaseRoundingUp(sqrtPrice, liquidity, amountIn)
  }
  return getNextSqrtPriceFromAmountQuoteRoundingDown(sqrtPrice, liquidity, amountIn)
}

function getNextSqrtPriceFromAmountBaseRoundingUp(sqrtPrice: bigint, liquidity: bigint, amount: bigint): bigint {
  if (amount === 0n) {
    return sqrtPrice
  }

  const product = amount * sqrtPrice
  const denominator = liquidity + product
  return mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up)
}

function getNextSqrtPriceFromAmountQuoteRoundingDown(sqrtPrice: bigint, liquidity: bigint, amount: bigint): bigint {
  const quotient = (amount << BigInt(RESOLUTION * 2)) / liquidity
  return sqrtPrice + quotient
}

export function getSwapAmountFromBaseToQuote(
  configState: Config,
  currentSqrtPrice: bigint,
  amountIn: bigint,
): SwapAmount {
  let totalOutputAmount = 0n
  let sqrtPrice = currentSqrtPrice
  let amountLeft = amountIn

  // Iterate through curve points in reverse order (selling tokens)
  for (let i = configState.curve.length - 2; i >= 0; i--) {
    if (configState.curve[i].sqrtPrice === 0n || configState.curve[i].liquidity === 0n) {
      continue
    }

    if (BigInt(configState.curve[i].sqrtPrice) < sqrtPrice) {
      const maxAmountIn = getDeltaAmountBaseUnsigned(
        BigInt(configState.curve[i].sqrtPrice),
        sqrtPrice,
        BigInt(configState.curve[i + 1].liquidity),
        Rounding.Up,
      )

      if (amountLeft < maxAmountIn) {
        const nextSqrtPrice = getNextSqrtPriceFromInput(
          sqrtPrice,
          BigInt(configState.curve[i + 1].liquidity),
          amountLeft,
          true,
        )

        const outputAmount = getDeltaAmountQuoteUnsigned(
          nextSqrtPrice,
          sqrtPrice,
          BigInt(configState.curve[i + 1].liquidity),
          Rounding.Down,
        )

        totalOutputAmount += outputAmount
        sqrtPrice = nextSqrtPrice
        amountLeft = 0n
        break
      }
      const nextSqrtPrice = BigInt(configState.curve[i].sqrtPrice)
      const outputAmount = getDeltaAmountQuoteUnsigned(
        nextSqrtPrice,
        sqrtPrice,
        BigInt(configState.curve[i + 1].liquidity),
        Rounding.Down,
      )

      totalOutputAmount += outputAmount
      sqrtPrice = nextSqrtPrice
      amountLeft -= maxAmountIn
    }
  }

  if (amountLeft !== 0n) {
    const nextSqrtPrice = getNextSqrtPriceFromInput(sqrtPrice, BigInt(configState.curve[0].liquidity), amountLeft, true)

    const outputAmount = getDeltaAmountQuoteUnsigned(
      nextSqrtPrice,
      sqrtPrice,
      BigInt(configState.curve[0].liquidity),
      Rounding.Down,
    )

    totalOutputAmount += outputAmount
    sqrtPrice = nextSqrtPrice
  }

  return {
    outputAmount: totalOutputAmount,
    nextSqrtPrice: sqrtPrice,
  }
}

export function getSwapAmountFromQuoteToBase(
  configState: Config,
  currentSqrtPrice: bigint,
  amountIn: bigint,
): SwapAmount {
  let totalOutputAmount = 0n
  let sqrtPrice = currentSqrtPrice
  let amountLeft = amountIn

  // Iterate through curve points (buying tokens)
  for (let i = 0; i < configState.curve.length; i++) {
    if (configState.curve[i].sqrtPrice === 0n || configState.curve[i].liquidity === 0n) {
      break
    }

    if (BigInt(configState.curve[i].sqrtPrice) > sqrtPrice) {
      const maxAmountIn = getDeltaAmountQuoteUnsigned(
        sqrtPrice,
        BigInt(configState.curve[i].sqrtPrice),
        BigInt(configState.curve[i].liquidity),
        Rounding.Up,
      )

      if (amountLeft < maxAmountIn) {
        const nextSqrtPrice = getNextSqrtPriceFromInput(
          sqrtPrice,
          BigInt(configState.curve[i].liquidity),
          amountLeft,
          false,
        )

        const outputAmount = getDeltaAmountBaseUnsigned(
          sqrtPrice,
          nextSqrtPrice,
          BigInt(configState.curve[i].liquidity),
          Rounding.Down,
        )

        totalOutputAmount += outputAmount
        sqrtPrice = nextSqrtPrice
        amountLeft = 0n
        break
      }
      const nextSqrtPrice = BigInt(configState.curve[i].sqrtPrice)
      const outputAmount = getDeltaAmountBaseUnsigned(
        sqrtPrice,
        nextSqrtPrice,
        BigInt(configState.curve[i].liquidity),
        Rounding.Down,
      )

      totalOutputAmount += outputAmount
      sqrtPrice = nextSqrtPrice
      amountLeft -= maxAmountIn
    }
  }

  // Check max swallow amount (allow pool to consume extra amount)
  const maxSwallowAmount = mulDiv(
    BigInt(configState.migrationQuoteThreshold),
    20n, // TODO: make this configurable
    100n,
    Rounding.Down,
  )

  if (amountLeft > maxSwallowAmount) {
    throw new Error('SwapAmountIsOverAThreshold')
  }

  return {
    outputAmount: totalOutputAmount,
    nextSqrtPrice: sqrtPrice,
  }
}

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

  // Apply fees on input if needed
  let actualAmountIn: bigint
  if (tradeDirection === TradeDirection.QuoteToBase) {
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
  } else {
    actualAmountIn = amountIn
  }

  // Calculate swap amount
  const swapAmount: SwapAmount =
    tradeDirection === TradeDirection.QuoteToBase
      ? getSwapAmountFromQuoteToBase(configState, BigInt(curveState.sqrtPrice), actualAmountIn)
      : getSwapAmountFromBaseToQuote(configState, BigInt(curveState.sqrtPrice), actualAmountIn)

  // Apply fees on output if needed
  let actualAmountOut: bigint
  if (tradeDirection === TradeDirection.QuoteToBase) {
    actualAmountOut = swapAmount.outputAmount
  } else {
    const feeBreakdown = getFeeOnAmount(
      configState,
      swapAmount.outputAmount,
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
    nextSqrtPrice: swapAmount.nextSqrtPrice,
    tradingFee,
    protocolFee,
    cashbackFee,
    creatorFee,
    l1ReferralFee,
    l2ReferralFee,
    l3ReferralFee,
  }
}
