import Decimal from 'decimal.js'
import type { CreateConfigInstructionDataArgs } from '~/clients'
import { MIGRATION_FEE_BASIS_POINTS, TOKEN_DECIMALS } from './constants.ts'

export const RESOLUTION = 64

export enum TokenType {
  SPL = 0,
  Token2022 = 1,
}

interface LockedVestingParams {
  totalLockedVestingAmount: bigint
  numberOfVestingPeriod: bigint
  cliffUnlockAmount: bigint
  totalVestingDuration: bigint
  cliffDurationFromMigrationTime: bigint
}

export function convertToLamports(amount: bigint, tokenDecimal: number): bigint {
  const valueInLamports = new Decimal(amount).mul(Decimal.pow(10, tokenDecimal))
  return BigInt(valueInLamports.floor().toFixed())
}

/**
 * Calculate the locked vesting parameters
 * @param lockedVestingParams - The locked vesting parameters
 * @param tokenBaseDecimal - The decimal of the base token
 * @returns The locked vesting parameters
 * total_locked_vesting_amount = cliff_unlock_amount + (amount_per_period * number_of_period)
 */
export function getLockedVestingParams(lockedVestingParams: LockedVestingParams, tokenBaseDecimal: number) {
  const {
    totalLockedVestingAmount,
    numberOfVestingPeriod,
    cliffUnlockAmount,
    totalVestingDuration,
    cliffDurationFromMigrationTime,
  } = lockedVestingParams

  if (totalLockedVestingAmount === 0n) {
    return {
      amountPerPeriod: 0n,
      cliffDurationFromMigrationTime: 0n,
      frequency: 0n,
      numberOfPeriod: 0n,
      cliffUnlockAmount: 0n,
    }
  }

  if (totalLockedVestingAmount === cliffUnlockAmount) {
    return {
      amountPerPeriod: convertToLamports(1n, tokenBaseDecimal),
      cliffDurationFromMigrationTime,
      frequency: 1n,
      numberOfPeriod: 1n,
      cliffUnlockAmount: convertToLamports(totalLockedVestingAmount - 1n, tokenBaseDecimal),
    }
  }

  if (numberOfVestingPeriod <= 0n) {
    throw new Error('Total periods must be greater than zero')
  }

  if (numberOfVestingPeriod === 0n || totalVestingDuration === 0n) {
    throw new Error('numberOfPeriod and totalVestingDuration must both be greater than zero')
  }

  if (cliffUnlockAmount > totalLockedVestingAmount) {
    throw new Error('Cliff unlock amount cannot be greater than total locked vesting amount')
  }

  // amount_per_period = (total_locked_vesting_amount - cliff_unlock_amount) / number_of_period
  const amountPerPeriod = Number(totalLockedVestingAmount - cliffUnlockAmount) / Number(numberOfVestingPeriod)

  // round amountPerPeriod down to ensure we don't exceed total amount
  const roundedAmountPerPeriod = BigInt(Math.floor(amountPerPeriod))

  // calculate the remainder from rounding down
  const totalPeriodicAmount = roundedAmountPerPeriod * numberOfVestingPeriod
  const remainder = totalLockedVestingAmount - (cliffUnlockAmount + BigInt(totalPeriodicAmount))

  // add the remainder to cliffUnlockAmount to maintain total amount
  const adjustedCliffUnlockAmount = cliffUnlockAmount + remainder

  const periodFrequency = totalVestingDuration / numberOfVestingPeriod

  return {
    amountPerPeriod: convertToLamports(roundedAmountPerPeriod, tokenBaseDecimal),
    cliffDurationFromMigrationTime,
    frequency: periodFrequency,
    numberOfPeriod: numberOfVestingPeriod,
    cliffUnlockAmount: convertToLamports(adjustedCliffUnlockAmount, tokenBaseDecimal),
  }
}

/**
 * Get the total vesting amount
 * @param lockedVesting - The locked vesting
 * @returns The total vesting amount
 */
export const getTotalVestingAmount = (lockedVesting: ReturnType<typeof getLockedVestingParams>): bigint => {
  return lockedVesting.cliffUnlockAmount + lockedVesting.amountPerPeriod * lockedVesting.numberOfPeriod
}

/**
 * Get the percentage of supply that should be allocated to initial liquidity
 * @param initialMarketCap - The initial market cap
 * @param migrationMarketCap - The migration market cap
 * @param lockedVesting - The locked vesting
 * @param totalTokenSupply - The total token supply
 * @returns The percentage of supply for initial liquidity
 */
export const getPercentageSupplyOnMigration = (
  initialMarketCap: Decimal,
  migrationMarketCap: Decimal,
  lockedVesting: ReturnType<typeof getLockedVestingParams>,
  totalTokenSupply: bigint,
): number => {
  // formula: x = sqrt(initialMC / migrationMC) * (100 - lockedVesting - leftover) / (1 + sqrt(initialMC / migrationMC))

  // sqrtRatio = sqrt(initial_MC / migration_MC)
  const marketCapRatio = initialMarketCap.div(migrationMarketCap)
  const sqrtRatio = Decimal.sqrt(marketCapRatio)

  // locked vesting percentage
  const totalVestingAmount = getTotalVestingAmount(lockedVesting)
  const vestingPercentage = new Decimal(totalVestingAmount.toString())
    .mul(new Decimal(100))
    .div(new Decimal(totalTokenSupply.toString()))

  // (100 * sqrtRatio - (vestingPercentage + leftoverPercentage) * sqrtRatio) / (1 + sqrtRatio)
  const numerator = new Decimal(100)
    .mul(sqrtRatio)
    .sub(vestingPercentage.add(MIGRATION_FEE_BASIS_POINTS).mul(sqrtRatio))
  const denominator = new Decimal(1).add(sqrtRatio)
  return numerator.div(denominator).toNumber()
}

/**
 * Get the migration quote amount
 * @param migrationMarketCap - The migration market cap
 * @param percentageSupplyOnMigration - The percentage of supply on migration
 * @returns The migration quote amount
 */
export const getMigrationQuoteAmount = (migrationMarketCap: Decimal, percentageSupplyOnMigration: Decimal): Decimal => {
  // migrationMC * x / 100
  return migrationMarketCap.mul(percentageSupplyOnMigration).div(new Decimal(100))
}

/**
 * Get migrationQuoteThreshold from migrationQuoteAmount and migrationFeePercent
 * @param migrationQuoteAmount - The migration quote amount
 * @param migrationFeePercent - The migration fee percent
 * @returns migration quote threshold on bonding curve
 */
export const getMigrationQuoteThresholdFromMigrationQuoteAmount = (
  migrationQuoteAmount: Decimal,
  migrationFeePercent: number,
): Decimal => {
  return migrationQuoteAmount.mul(new Decimal(100)).div(new Decimal(100).sub(new Decimal(migrationFeePercent)))
}

/**
 * Gets the initial liquidity from delta base
 * Formula: L = Δa / (1/√P_lower - 1/√P_upper)
 * @param baseAmount Base amount
 * @param sqrtMaxPrice Maximum sqrt price
 * @param sqrtPrice Current sqrt price
 * @returns Initial liquidity
 */
export function getInitialLiquidityFromDeltaBase(baseAmount: bigint, sqrtMaxPrice: bigint, sqrtPrice: bigint): bigint {
  if (sqrtMaxPrice < sqrtPrice) {
    throw new Error('Max price must be greater than current price')
  }
  const priceDelta = sqrtMaxPrice - sqrtPrice
  const prod = baseAmount * sqrtPrice * sqrtMaxPrice

  return prod / priceDelta
}

/**
 * Gets the initial liquidity from delta quote
 * Formula: L = Δb / (√P_upper - √P_lower)
 * @param quoteAmount Quote amount
 * @param sqrtMinPrice Minimum sqrt price
 * @param sqrtPrice Current sqrt price
 * @returns Initial liquidity
 */
export function getInitialLiquidityFromDeltaQuote(
  quoteAmount: bigint,
  sqrtMinPrice: bigint,
  sqrtPrice: bigint,
): bigint {
  if (sqrtMinPrice > sqrtPrice) {
    throw new Error('Min price must be less than current price')
  }
  const priceDelta = sqrtPrice - sqrtMinPrice
  const quoteAmountShifted = quoteAmount << BigInt(RESOLUTION * 2)

  return quoteAmountShifted / priceDelta
}

/**
 * Get the liquidity
 * @param baseAmount - The base amount
 * @param quoteAmount - The quote amount
 * @param minSqrtPrice - The min sqrt price
 * @param maxSqrtPrice - The max sqrt price
 * @returns The liquidity
 */
export const getLiquidity = ({
  baseAmount,
  quoteAmount,
  minSqrtPrice,
  maxSqrtPrice,
}: {
  baseAmount: bigint
  quoteAmount: bigint
  minSqrtPrice: bigint
  maxSqrtPrice: bigint
}): bigint => {
  const liquidityFromBase = getInitialLiquidityFromDeltaBase(baseAmount, maxSqrtPrice, minSqrtPrice)
  const liquidityFromQuote = getInitialLiquidityFromDeltaQuote(quoteAmount, minSqrtPrice, maxSqrtPrice)
  return liquidityFromBase < liquidityFromQuote ? liquidityFromBase : liquidityFromQuote
}

/**
 * Get the first curve
 * @param migrationSqrPrice - The migration sqrt price
 * @param migrationBaseAmount - The migration amount
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @returns The first curve
 */
export const getFirstCurve = ({
  migrationSqrtPrice,
  migrationBaseAmount,
  swapAmount,
  migrationQuoteThreshold,
}: {
  migrationSqrtPrice: bigint
  migrationBaseAmount: Decimal
  swapAmount: bigint
  migrationQuoteThreshold: bigint
}) => {
  // Swap_amount = L *(1/Pmin - 1/Pmax) = L * (Pmax - Pmin) / (Pmax * Pmin)       (1)
  // Quote_amount = L * (Pmax - Pmin)                                             (2)
  // (Quote_amount * (1-migrationFeePercent/100) / Migration_amount = Pmax ^ 2    (3)
  const migrationSqrPriceDecimal = new Decimal(migrationSqrtPrice)
  const migrationBaseAmountDecimal = new Decimal(migrationBaseAmount)
  const swapAmountDecimal = new Decimal(swapAmount)
  const migrationFeePercentDecimal = new Decimal(MIGRATION_FEE_BASIS_POINTS)
  // From (1) and (2) => Quote_amount / Swap_amount = (Pmax * Pmin)               (4)
  // From (3) and (4) => Swap_amount * (1-migrationFeePercent/100) / Migration_amount = Pmax / Pmin
  // => Pmin = Pmax * Migration_amount / (Swap_amount * (1-migrationFeePercent/100))
  const denominator = swapAmountDecimal
    .mul(new Decimal(100).sub(migrationFeePercentDecimal))
    .div(new Decimal(100))

  const initialSqrtPriceDecimal = migrationSqrPriceDecimal.mul(migrationBaseAmountDecimal).div(denominator)

  const initialSqrtPrice = BigInt(initialSqrtPriceDecimal.floor().toFixed())

  const liquidity = getLiquidity({
    baseAmount: swapAmount,
    quoteAmount: migrationQuoteThreshold,
    minSqrtPrice: initialSqrtPrice,
    maxSqrtPrice: migrationSqrtPrice,
  })
  return {
    initialSqrtPrice,
    curve: [
      {
        sqrtPrice: migrationSqrtPrice,
        liquidity,
      },
    ],
  }
}

import BN from 'bn.js'
/**
 * Get the first curve
 * @param migrationSqrPrice - The migration sqrt price
 * @param migrationAmount - The migration amount
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @param migrationFeePercent - The migration fee percent
 * @returns The first curve
 */
export const getFirstCurveOld = (
  migrationSqrtPrice: BN,
  migrationBaseAmount: BN,
  swapAmount: BN,
  migrationQuoteThreshold: BN,
  migrationFeePercent: number
) => {
  // Swap_amount = L *(1/Pmin - 1/Pmax) = L * (Pmax - Pmin) / (Pmax * Pmin)       (1)
  // Quote_amount = L * (Pmax - Pmin)                                             (2)
  // (Quote_amount * (1-migrationFeePercent/100) / Migration_amount = Pmax ^ 2    (3)
  const migrationSqrPriceDecimal = new Decimal(migrationSqrtPrice.toString())
  const migrationBaseAmountDecimal = new Decimal(
    migrationBaseAmount.toString()
  )
  const swapAmountDecimal = new Decimal(swapAmount.toString())
  const migrationFeePercentDecimal = new Decimal(
    migrationFeePercent.toString()
  )
  // From (1) and (2) => Quote_amount / Swap_amount = (Pmax * Pmin)               (4)
  // From (3) and (4) => Swap_amount * (1-migrationFeePercent/100) / Migration_amount = Pmax / Pmin
  // => Pmin = Pmax * Migration_amount / (Swap_amount * (1-migrationFeePercent/100))
  const denominator = swapAmountDecimal
    .mul(new Decimal(100).sub(migrationFeePercentDecimal))
    .div(new Decimal(100))

  const sqrtStartPriceDecimal = migrationSqrPriceDecimal
    .mul(migrationBaseAmountDecimal)
    .div(denominator)

  const sqrtStartPrice = new BN(sqrtStartPriceDecimal.floor().toFixed())
  return {
    sqrtStartPrice,
  }
}


/**
 * Get the sqrt price from the price
 * @param price - The price
 * @param tokenADecimal - The decimal of token A
 * @param tokenBDecimal - The decimal of token B
 * @returns The sqrt price
 * price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
 */
export const getSqrtPriceFromPrice = (price: string, tokenADecimal: number, tokenBDecimal: number): bigint => {
  const decimalPrice = new Decimal(price)
  const adjustedByDecimals = decimalPrice.div(new Decimal(10 ** (tokenADecimal - tokenBDecimal)))
  const sqrtValue = Decimal.sqrt(adjustedByDecimals)
  const sqrtValueQ64 = sqrtValue.mul(Decimal.pow(2, 64))

  return BigInt(sqrtValueQ64.floor().toFixed())
}

/**
 * Get the sqrt price from the price
 * @param price - The price
 * @param tokenADecimal - The decimal of token A
 * @param tokenBDecimal - The decimal of token B
 * @returns The sqrt price
 * price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
 */
export const getSqrtPriceFromPriceOld = (
  price: string,
  tokenADecimal: number,
  tokenBDecimal: number
): BN => {
  const decimalPrice = new Decimal(price)
  const adjustedByDecimals = decimalPrice.div(
    new Decimal(10 ** (tokenADecimal - tokenBDecimal))
  )
  const sqrtValue = Decimal.sqrt(adjustedByDecimals)
  const sqrtValueQ64 = sqrtValue.mul(Decimal.pow(2, 64))

  return new BN(sqrtValueQ64.floor().toFixed())
}


/**
 * Build a custom constant product curve by market cap
 */
export function buildCurveWithMarketCap(config: {
  totalTokenSupply: bigint
  tokenType: TokenType
  tokenBaseDecimal?: number

  feeConfig: {
    feeBasisPoints: number
    l1ReferralFeeBasisPoints: number
    l2ReferralFeeBasisPoints: number
    l3ReferralFeeBasisPoints: number
    refereeDiscountBasisPoints: number
    creatorFeeBasisPoints: number
    migrationFeeBasisPoints: number
  }

  lockedVestingConfig: LockedVestingParams
  initialMarketCap: bigint
  migrationMarketCap: bigint
}): CreateConfigInstructionDataArgs {
  const tokenDecimal = config.tokenBaseDecimal ?? 6
  const lockedVesting = getLockedVestingParams(config.lockedVestingConfig, tokenDecimal)

  const totalSupplyLamports = convertToLamports(config.totalTokenSupply, tokenDecimal)

  const percentageSupplyOnMigration = getPercentageSupplyOnMigration(
    new Decimal(config.initialMarketCap.toString()),
    new Decimal(config.migrationMarketCap.toString()),
    lockedVesting,
    totalSupplyLamports,
  )

  // Migration quote amount (in quote currency units)
  const migrationQuoteAmount = getMigrationQuoteAmount(
    new Decimal(config.migrationMarketCap.toString()),
    new Decimal(percentageSupplyOnMigration),
  )

  console.log('Migration Quote Amount:', migrationQuoteAmount.toString())

  // Migration base amount in token lamports
  const migrationBaseAmountLamports = new Decimal(totalSupplyLamports.toString())
    .mul(new Decimal(percentageSupplyOnMigration))
    .div(new Decimal(100))

  // Migration base amount in tokens (not lamports)
  const migrationBaseAmountTokens = migrationBaseAmountLamports.div(new Decimal(10).pow(tokenDecimal))

  // Price: quote per token
  const migrationPrice = migrationQuoteAmount.div(migrationBaseAmountTokens)

  const migrationQuoteThreshold = BigInt(
    getMigrationQuoteThresholdFromMigrationQuoteAmount(migrationQuoteAmount, MIGRATION_FEE_BASIS_POINTS)
      .floor()
      .toString(),
  )

  const migrationSqrtPrice = getSqrtPriceFromPrice(migrationPrice.toString(), tokenDecimal, TOKEN_DECIMALS)
  const migrationSqrtPriceOld = getSqrtPriceFromPriceOld(
    migrationPrice.toString(),
    tokenDecimal,
    TOKEN_DECIMALS,
  )
  console.log('Migration Sqrt Price:', migrationSqrtPrice.toString())
  console.log('Migration Sqrt   Old:', migrationSqrtPriceOld.toString())
  const totalVestingAmount = getTotalVestingAmount(lockedVesting)

  // swapAmount is in token lamports (the amount available for swapping)
  const swapAmount = totalSupplyLamports - BigInt(migrationBaseAmountLamports.floor().toString()) - totalVestingAmount

  const { initialSqrtPrice, curve } = getFirstCurve({
    migrationSqrtPrice,
    migrationBaseAmount: migrationBaseAmountLamports,
    swapAmount,
    migrationQuoteThreshold,
  })
  console.log('Initial Sqrt Price:', initialSqrtPrice.toString())
  const { sqrtStartPrice: legacySqrtStartPrice } = getFirstCurveOld(
    new BN(migrationSqrtPrice.toString()),
    new BN(migrationBaseAmountLamports.toString()),
    new BN(swapAmount.toString()),
    new BN(migrationQuoteThreshold.toString()),
    MIGRATION_FEE_BASIS_POINTS,
  )
  console.log('Legacy Sqrt Start Price:', legacySqrtStartPrice.toString())

  // console.table({
  //   totalSupply: totalSupplyLamports.toString(),
  //   percentageSupplyOnMigration,
  //   migrationQuoteAmount: migrationQuoteAmount.toString(),
  //   migrationBaseAmountTokens: migrationBaseAmountTokens.toString(),
  //   migrationPrice: migrationPrice.toString(),
  //   migrationQuoteThreshold: migrationQuoteThreshold.toString(),
  //   migrationSqrtPrice: migrationSqrtPrice.toString(),
  //   initialSqrtPrice: initialSqrtPrice.toString(),
  //   sqrtPriceRatio: (Number(migrationSqrtPrice) / Number(initialSqrtPrice)).toFixed(2),
  //   expectedSqrtRatio: Math.sqrt(Number(config.migrationMarketCap) / Number(config.initialMarketCap)).toFixed(2),
  //   swapAmount: swapAmount.toString(),
  // })
  // console.log(lockedVesting)
  // console.log(curve)

  return {
    tokenType: config.tokenType,
    tokenDecimal,
    feeBasisPoints: config.feeConfig.feeBasisPoints,
    l1ReferralFeeBasisPoints: config.feeConfig.l1ReferralFeeBasisPoints,
    l2ReferralFeeBasisPoints: config.feeConfig.l2ReferralFeeBasisPoints,
    l3ReferralFeeBasisPoints: config.feeConfig.l3ReferralFeeBasisPoints,
    refereeDiscountBasisPoints: config.feeConfig.refereeDiscountBasisPoints,
    creatorFeeBasisPoints: config.feeConfig.creatorFeeBasisPoints,
    migrationFeeBasisPoints: config.feeConfig.migrationFeeBasisPoints,
    lockedVesting: lockedVesting,
    initialSqrtPrice,
    migrationQuoteThreshold,
    curve,
  }
}
