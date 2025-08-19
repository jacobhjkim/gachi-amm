import BN from 'bn.js'
import Decimal from 'decimal.js'
import { DEFAULT_CONFIG_ARGS, FEE_DENOMINATOR, MIGRATION_FEE_BASIS_POINTS } from './constants.ts'
import { Rounding, mulDiv } from './math.ts'

/**
 * Get the sqrt price from the price
 * @returns The sqrt price
 * price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
 */
export const getSqrtPriceFromPrice = ({
  migrationQuoteAmount,
  migrationBaseAmount,
}: {
  migrationQuoteAmount: Decimal
  migrationBaseAmount: Decimal
}): BN => {
  const migrationPrice = migrationQuoteAmount.div(migrationBaseAmount)
  const sqrtValue = Decimal.sqrt(migrationPrice)
  const sqrtValueQ64 = sqrtValue.mul(Decimal.pow(2, 64))

  return new BN(sqrtValueQ64.floor().toFixed())
}

const migrationQuoteAmountBeforeFee = 87_031_082_529n
const migrationQuoteAmount = mulDiv(
  migrationQuoteAmountBeforeFee,
  FEE_DENOMINATOR - BigInt(MIGRATION_FEE_BASIS_POINTS),
  FEE_DENOMINATOR,
  Rounding.Down,
)
console.log('migrationQuoteAmount:', migrationQuoteAmount.toString())
const initialPrice = new Decimal(DEFAULT_CONFIG_ARGS.initialVirtualQuoteReserve).div(
  new Decimal(DEFAULT_CONFIG_ARGS.initialVirtualBaseReserve),
)
const virtualPrice = new Decimal(DEFAULT_CONFIG_ARGS.migrationQuoteThreshold).div(new Decimal('273_000_000_000_000'))
const realPrice = new Decimal(migrationQuoteAmount).div(new Decimal('200_000_000_000_000'))
console.log('real price: ', realPrice.toString())
console.log('virtual price: ', virtualPrice)
console.log('initial price: ', initialPrice)
console.log('price increase: ', virtualPrice.div(initialPrice).toString())

const realSqrtPrice = getSqrtPriceFromPrice({
  migrationQuoteAmount: new Decimal('87031082529'),
  migrationBaseAmount: new Decimal('200000000000000'),
})
console.log('Sqrt Price:', realSqrtPrice.toString())
const virtualSqrtPrice = getSqrtPriceFromPrice({
  migrationQuoteAmount: new Decimal(DEFAULT_CONFIG_ARGS.migrationQuoteThreshold),
  migrationBaseAmount: new Decimal('273_000_000_000_000'),
})
console.log('Virtual Sqrt Price:', virtualSqrtPrice.toString())
