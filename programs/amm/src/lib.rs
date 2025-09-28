#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

#[macro_use]
pub mod macros;

pub mod const_pda;
pub mod constants;
pub mod errors;
pub use errors::*;
pub mod events;
pub mod instructions;
pub use instructions::*;
pub mod math;
pub use math::*;
pub mod states;
pub mod utils;

pub mod params;

// declare_id!("6eqkYbNVgXs3yWPXtBdnyGiNPaoMzTLJySuYjqPykZmv");
declare_id!("4RAA1rYL3U1dFmbTTMJnu8SA1bkyJjSpWvLkZAHcjoLm");

#[program]
pub mod amm {
    use super::*;

    /// The configuration of the AMM
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    /// * `config_params` - The parameters for the configuration creation.
    ///
    pub fn create_config(
        ctx: Context<CreateConfigCtx>,
        config_params: ConfigParameters,
    ) -> Result<()> {
        handle_create_config(ctx, config_params)
    }

    /// Create a new token and bonding curve
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    /// * `curve_params` - The parameters for the bonding curve creation.
    ///
    pub fn create_curve_with_spl_token(
        ctx: Context<CreateCurveCtx>,
        curve_params: CreateCurveParams,
    ) -> Result<()> {
        handle_create_curve_spl_token(ctx, curve_params)
    }

    /// Swap tokens
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    /// * `params` - The parameters for the swap operation.
    ///
    pub fn swap(ctx: Context<SwapCtx>, params: SwapParameters) -> Result<()> {
        handle_swap(ctx, params)
    }

    /// migrate the bonding curve to Meteora DAMM v2
    pub fn migrate_damm_v2<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, MigrateDammV2Ctx<'info>>,
    ) -> Result<()> {
        handle_migrate_damm_v2(ctx)
    }

    /// Create a cashback account for a user
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    ///
    pub fn create_cashback(ctx: Context<CreateCashback>) -> Result<()> {
        handle_create_cashback(ctx)
    }

    /// Claim accumulated cashback rewards
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    ///
    pub fn claim_cashback(ctx: Context<ClaimCashback>) -> Result<()> {
        handle_claim_cashback(ctx)
    }

    /// Reclaim inactive cashback (admin only)
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    ///
    pub fn reclaim_inactive_cashback(ctx: Context<ReclaimInactiveCashback>) -> Result<()> {
        handle_reclaim_cashback(ctx)
    }

    /// Update cashback tier (admin only)
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    /// * `new_tier` - The new tier to assign to the user.
    ///
    pub fn update_cashback_tier(ctx: Context<UpdateCashbackTier>, new_tier: u8) -> Result<()> {
        handle_update_cashback_tier(ctx, new_tier)
    }

    /// Claim protocol fee from the bonding curve
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    ///
    pub fn claim_protocol_fee(ctx: Context<ClaimProtocolFeeCtx>) -> Result<()> {
        handle_claim_protocol_fee(ctx)
    }

    /// Claim creator fee from the bonding curve
    ///
    /// # Arguments
    ///
    /// * `ctx` - The accounts needed by the instruction.
    ///
    pub fn claim_creator_fee(ctx: Context<ClaimCreatorFeeCtx>) -> Result<()> {
        handle_claim_creator_fee(ctx)
    }
}
