use crate::{states::bonding_curve::SwapResult, SwapParameters};
use anchor_lang::prelude::*;

/// Create config
#[event]
pub struct EvtCreateConfig {
    pub config: Pubkey,

    /* Token configurations */
    pub base_token_flag: u8,
    pub quote_token_flag: u8,
    pub base_decimal: u8,
    pub quote_decimal: u8,
    pub quote_mint: Pubkey,

    /* Fee configurations */
    pub fee_basis_points: u16,
    pub l1_referral_fee_basis_points: u16,
    pub l2_referral_fee_basis_points: u16,
    pub l3_referral_fee_basis_points: u16,
    pub creator_fee_basis_points: u16,
    pub migration_fee_basis_points: u16,
    pub fee_claimer: Pubkey,

    /* Price configurations */
    pub migration_base_threshold: u64,
    pub migration_quote_threshold: u64,
    pub initial_virtual_quote_reserve: u64,
    pub initial_virtual_base_reserve: u64,
}

#[event]
pub struct EvtInitializeCurve {
    pub curve: Pubkey,
    pub config: Pubkey,
    pub creator: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub curve_type: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub initial_virtual_quote_reserve: u64,
    pub initial_virtual_base_reserve: u64,
}

#[event]
pub struct EvtSwap {
    pub curve: Pubkey,
    pub base_mint: Pubkey,
    pub trade_direction: u8,
    pub has_referral: bool,
    pub params: SwapParameters,
    pub swap_result: SwapResult,
    pub virtual_base_reserve: u64,
    pub virtual_quote_reserve: u64,
    pub remaining_tokens: u64,
}

#[event]
pub struct EvtCurveComplete {
    pub curve: Pubkey,
    pub config: Pubkey,
    pub base_mint: Pubkey,
    pub base_reserve: u64,
    pub quote_reserve: u64,
}

#[event]
pub struct EvtMigrateDammV2 {
    pub curve: Pubkey,
    pub config: Pubkey,
    pub pool: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub deposited_base_amount: u64,
    pub deposited_quote_amount: u64,
    pub initial_liquidity: u128,
    pub sqrt_price: u128,
}

#[event]
pub struct EvtClaimTradingFee {
    pub curve: Pubkey,
    pub quote_token_claim_amount: u64,
}

#[event]
pub struct EvtClaimCreatorTradingFee {
    pub curve: Pubkey,
    pub creator: Pubkey,
    pub quote_token_claim_amount: u64,
}

#[event]
pub struct EvtCreateCashback {
    pub owner: Pubkey,
    pub tier: u8,
}

#[event]
pub struct EvtClaimCashback {
    pub owner: Pubkey,
    pub wsol_claim_amount: u64,
}

#[event]
pub struct EvtUpdateCashbackTier {
    pub owner: Pubkey,
    pub old_tier: u8,
    pub new_tier: u8,
}
