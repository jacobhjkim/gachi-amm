pub const MIN_SQRT_PRICE: u128 = 4295048016;
pub const MAX_SQRT_PRICE: u128 = 79226673521066979257578248091;

// Number of bits to scale. This will decide the position of the radix point.
pub const MAX_CURVE_POINT: usize = 3;

// Token supply configuration (values include decimals)
pub const TOKEN_TOTAL_SUPPLY: u64 = 1_000_000_000_000_000; // 1B tokens with 6 decimals

// Validation limits
pub const MAX_NAME_LENGTH: usize = 32;
pub const MAX_SYMBOL_LENGTH: usize = 10;
pub const MAX_URI_LENGTH: usize = 200;

pub mod cashback {
    // Cashback percentages (in basis points out of 10000, representing percentage of fee)
    pub const CASHBACK_WOOD_BPS: u64 = 50; // 0.05% of sol amount
    pub const CASHBACK_BRONZE_BPS: u64 = 100; // 0.10% of sol amount
    pub const CASHBACK_SILVER_BPS: u64 = 125; // 0.125% of sol amount
    pub const CASHBACK_GOLD_BPS: u64 = 150; // 0.15% of sol amount
    pub const CASHBACK_PLATINUM_BPS: u64 = 175; // 0.175% of sol amount
    pub const CASHBACK_DIAMOND_BPS: u64 = 200; // 0.20% of sol amount
    pub const CASHBACK_CHAMPION_BPS: u64 = 250; // 0.25% of sol amount

    // Claim restrictions
    pub const CASHBACK_CLAIM_COOLDOWN: i64 = 7 * 24 * 60 * 60; // 7 days in seconds
    pub const CASHBACK_INACTIVE_PERIOD: i64 = 365 * 24 * 60 * 60; // 365 days in seconds
}

pub mod fee {
    /// Default fee denominator. DO NOT simply update it as it will break logic that depends on it as default value.
    pub const FEE_DENOMINATOR: u64 = 100_000;
    pub const MAX_FEE_BASIS_POINTS: u16 = 10_000;
}

pub mod seeds {
    pub const CONFIG_PREFIX: &[u8] = b"config";
    pub const CURVE_PREFIX: &[u8] = b"curve";
    pub const TOKEN_VAULT_PREFIX: &[u8] = b"token_vault";
    pub const CASHBACK_PREFIX: &[u8] = b"cashback";
    pub const CASHBACK_VAULT_PREFIX: &[u8] = b"cashback_vault";
    pub const CURVE_AUTHORITY_PREFIX: &[u8] = b"curve_authority";
    pub const POSITION_PREFIX: &[u8] = b"position";
    pub const POSITION_NFT_ACCOUNT_PREFIX: &[u8] = b"position_nft_account";
    pub const TOKEN_BADGE_PREFIX: &[u8] = b"token_badge";
    pub const REWARD_VAULT_PREFIX: &[u8] = b"reward_vault";
    pub const METEORA_METADATA_PREFIX: &[u8] = b"meteora";
    pub const DAMM_V2_METADATA_PREFIX: &[u8] = b"damm_v2";
    pub const VIRTUAL_POOL_METADATA_PREFIX: &[u8] = b"virtual_pool_metadata";
    pub const BASE_LOCKER_PREFIX: &[u8] = b"base_locker";
}
