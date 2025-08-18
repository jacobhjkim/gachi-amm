import {
  BASIS_POINTS_DIVISOR,
  CASHBACK_BRONZE_BPS,
  CASHBACK_CHAMPION_BPS,
  CASHBACK_DIAMOND_BPS,
  CASHBACK_GOLD_BPS,
  CASHBACK_PLATINUM_BPS,
  CASHBACK_SILVER_BPS,
  CASHBACK_WOOD_BPS,
  CREATOR_FEE_BASIS_POINTS,
  FEE_BASIS_POINTS,
  L1_REFERRAL_FEE_BASIS_POINTS,
  L2_REFERRAL_FEE_BASIS_POINTS,
  L3_REFERRAL_FEE_BASIS_POINTS,
  REFEREE_DISCOUNT_BASIS_POINTS,
} from './constants'

export enum CashbackTier {
  Wood = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
  Diamond = 5,
  Champion = 6,
}

export interface FeeBreakdown {
  l1ReferralFee: bigint
  l2ReferralFee: bigint
  l3ReferralFee: bigint
  creatorFee: bigint
  cashbackFee: bigint
  protocolFee: bigint
}

function getCashbackBps(tier: CashbackTier): bigint {
  switch (tier) {
    case CashbackTier.Wood:
      return CASHBACK_WOOD_BPS
    case CashbackTier.Bronze:
      return CASHBACK_BRONZE_BPS
    case CashbackTier.Silver:
      return CASHBACK_SILVER_BPS
    case CashbackTier.Gold:
      return CASHBACK_GOLD_BPS
    case CashbackTier.Platinum:
      return CASHBACK_PLATINUM_BPS
    case CashbackTier.Diamond:
      return CASHBACK_DIAMOND_BPS
    case CashbackTier.Champion:
      return CASHBACK_CHAMPION_BPS
    default:
      return CASHBACK_WOOD_BPS
  }
}

export function calculateFees(
  solAmount: bigint,
  hasL1Referrer: boolean,
  hasL2Referrer: boolean,
  hasL3Referrer: boolean,
  cashbackTier: CashbackTier,
): FeeBreakdown {
  const hasReferrer = hasL1Referrer || hasL2Referrer || hasL3Referrer

  const adjustedFeeBasisPoints = BigInt(
    hasReferrer ? FEE_BASIS_POINTS - REFEREE_DISCOUNT_BASIS_POINTS : FEE_BASIS_POINTS,
  )

  const protocolFeeSum = (solAmount * adjustedFeeBasisPoints) / BASIS_POINTS_DIVISOR

  const l1ReferralFee = hasL1Referrer ? (solAmount * BigInt(L1_REFERRAL_FEE_BASIS_POINTS)) / BASIS_POINTS_DIVISOR : 0n

  const l2ReferralFee = hasL2Referrer ? (solAmount * BigInt(L2_REFERRAL_FEE_BASIS_POINTS)) / BASIS_POINTS_DIVISOR : 0n

  const l3ReferralFee = hasL3Referrer ? (solAmount * BigInt(L3_REFERRAL_FEE_BASIS_POINTS)) / BASIS_POINTS_DIVISOR : 0n

  const cashbackBps = getCashbackBps(cashbackTier)
  const cashbackFee = (solAmount * cashbackBps) / BASIS_POINTS_DIVISOR

  const creatorFee = (solAmount * BigInt(CREATOR_FEE_BASIS_POINTS)) / BASIS_POINTS_DIVISOR

  const protocolFee = protocolFeeSum - l1ReferralFee - l2ReferralFee - l3ReferralFee - creatorFee - cashbackFee

  return {
    l1ReferralFee,
    l2ReferralFee,
    l3ReferralFee,
    creatorFee,
    cashbackFee,
    protocolFee,
  }
}

export function sumFees(fees: FeeBreakdown): bigint {
  return (
    fees.l1ReferralFee + fees.l2ReferralFee + fees.l3ReferralFee + fees.creatorFee + fees.cashbackFee + fees.protocolFee
  )
}
