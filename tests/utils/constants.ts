import { LAMPORTS_PER_SOL, address } from 'gill'

// Bonding curve constants
export const TOKEN_TOTAL_SUPPLY = BigInt(1_000_000_000_000_000)
export const TOKEN_DECIMALS = 6

// Fee constants
export const FEE_BASIS_POINTS = 1_500 // 1.3% fee
export const BASIS_POINTS_DIVISOR = 100_000n
export const REFEREE_DISCOUNT_BASIS_POINTS = 100 // discount fee for referee, 0.1% of sol amount
export const L1_REFERRAL_FEE_BASIS_POINTS = 300
export const L2_REFERRAL_FEE_BASIS_POINTS = 30
export const L3_REFERRAL_FEE_BASIS_POINTS = 20
export const CREATOR_FEE_BASIS_POINTS = 300 // 0.3% of sol amount
export const MIGRATION_FEE_BASIS_POINTS = 5_000 // 5% of quote amount

// Default config
export const NO_VESTING = {
  amountPerPeriod: 0n,
  cliffDurationFromMigrationTime: 0n,
  frequency: 0n,
  numberOfPeriod: 0n,
  cliffUnlockAmount: 0n,
  padding: 0n,
}
export const LOCKED_VESTING = {
  // TODO
  amountPerPeriod: 1000000n,
  cliffDurationFromMigrationTime: 100n,
  frequency: 1n,
  numberOfPeriod: 1n,
  cliffUnlockAmount: 799999999000000n,
  padding: 0n,
}

const DEFAULT_CURVE = [
  // { sqrtPrice: 412481737123559475n, liquidity: 107486147702611962217571351414659n },
  { sqrtPrice: 371637737252560528n, liquidity: 126468855042921406515868865861078n },
  { sqrtPrice: 79226673521066979257578248091n, liquidity: 3374878340866846586010188n },
]

export const DEFAULT_CONFIG_ARGS = {
  tokenType: 0, // Token 2022
  tokenDecimal: 6,
  feeBasisPoints: FEE_BASIS_POINTS,
  l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
  l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
  l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
  refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
  creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
  migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
  lockedVesting: NO_VESTING,
  initialSqrtPrice: 112263311001264267n,
  migrationQuoteThreshold: 96_000_000_000n,
  curve: DEFAULT_CURVE,
}
export const WSOL_MINT = address('So11111111111111111111111111111111111111112')

// Validation constants
export const VALIDATION = {
  MIN_SUPPLY: 1_000_000, // 1M minimum
  MAX_SUPPLY: 10_000_000_000_000_000n, // 10B maximum
  MIN_DECIMALS: 0,
  MAX_DECIMALS: 9,
  MAX_NAME_LENGTH: 32,
  MAX_SYMBOL_LENGTH: 10,
  MAX_URI_LENGTH: 200,
}

export const DEFAULT_TOKEN = {
  name: 'Solana Gold',
  symbol: 'GOLDSOL',
  uri: 'https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/spl-token.json',
}

export const SINGLE_BUY_AMOUNT = BigInt(LAMPORTS_PER_SOL) // 1 SOL per buy

// Test Constants
export const TRADER_INITIAL_SOL_AMOUNT = BigInt(15) * BigInt(LAMPORTS_PER_SOL)

// Cashback percentages (basis points out of 10000)
export const CASHBACK_WOOD_BPS = 50n // 0.05% of sol amount
export const CASHBACK_BRONZE_BPS = 100n // 0.10% of sol amount
export const CASHBACK_SILVER_BPS = 125n // 0.125% of sol amount
export const CASHBACK_GOLD_BPS = 150n // 0.15% of sol amount
export const CASHBACK_PLATINUM_BPS = 175n // 0.175% of sol amount
export const CASHBACK_DIAMOND_BPS = 200n // 0.20% of sol amount
export const CASHBACK_CHAMPION_BPS = 250n // 0.25% of sol amount

// Math constants for curve calculations
export const FEE_DENOMINATOR = 100_000n
export const RESOLUTION = 64

// Cashback tier mapping
export const CASHBACK_BPS = {
  0: CASHBACK_WOOD_BPS, // Wood
  1: CASHBACK_BRONZE_BPS, // Bronze
  2: CASHBACK_SILVER_BPS, // Silver
  3: CASHBACK_GOLD_BPS, // Gold
  4: CASHBACK_PLATINUM_BPS, // Platinum
  5: CASHBACK_DIAMOND_BPS, // Diamond
  6: CASHBACK_CHAMPION_BPS, // Champion
}

export const SEEDS = {
  CONFIG_PREFIX: 'config',
  CURVE_PREFIX: 'curve',
  CURVE_AUTHORITY_PREFIX: 'curve_authority',
  TOKEN_VAULT: 'token_vault',
  CASHBACK_PREFIX: 'cashback',
  CASHBACK_VAULT_PREFIX: 'cashback_vault',
  POOL_AUTHORITY: 'pool_authority',
  EVENT_AUTHORITY: '__event_authority',
  DAMM_V2_MIGRATION_METADATA: 'damm_v2',
  POOL: 'pool',
  POSITION: 'position',
  POSITION_NFT_ACCOUNT: 'position_nft_account',
}
export const DAMM_V2_PROGRAM_ID = address('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG')
export const LOCKER_PROGRAM_ID = address('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn')
export const DYNAMIC_BONDING_CURVE_PROGRAM_ID = address('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
export const DAMM_CONFIG_ACCOUNT = address('AeLtDKgw3XnXbr3Kgfbcb7KiZULVCQ5mXaFDiG9n7EgW')
/*
    {
        "index": 11,
        "baseFeeValue": 10000000,
        "baseFee": {
        "cliffFeeNumerator": 10000000,
        "numberOfPeriod": 0,
        "reductionFactor": 0,
        "periodFrequency": 0,
        "feeSchedulerMode": 0
        },
        "collectFeeMode": 1,
        "dynamicFee": false,
        "configAccount": "AeLtDKgw3XnXbr3Kgfbcb7KiZULVCQ5mXaFDiG9n7EgW"
    },
 */
