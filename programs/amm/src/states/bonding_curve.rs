use crate::constants::fee::FEE_DENOMINATOR;
use crate::events::EvtInitializeCurve;
use crate::safe_math::safe_mul_div_cast_u64;
use crate::u128x128_math::Rounding;
use crate::{
    params::swap::TradeDirection,
    safe_math::SafeMath,
    states::{CashbackTier, Config},
    AmmError,
};
use anchor_lang::prelude::*;
use num_enum::{IntoPrimitive, TryFromPrimitive};

/// Represents the result of checking graduation status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GraduationCheck {
    pub will_graduate: bool,
    pub capped_amount: u64,
}

#[repr(u8)]
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    IntoPrimitive,
    TryFromPrimitive,
    AnchorDeserialize,
    AnchorSerialize,
)]
pub enum CurveType {
    SplToken,
    Token2022,
}

// Curve state transition flows:
// PreBonding -> PostBonding -> CreatedPool
#[repr(u8)]
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    IntoPrimitive,
    TryFromPrimitive,
    AnchorDeserialize,
    AnchorSerialize,
)]
pub enum MigrationStatus {
    PreBondingCurve,
    PostBondingCurve,
    CreatedPool,
}

#[account(zero_copy)]
#[derive(InitSpace, Debug, Default)]
pub struct BondingCurve {
    /// which config this bonding curve belongs
    pub config: Pubkey,
    /// token creator
    pub creator: Pubkey,
    /// base mint
    pub base_mint: Pubkey,
    /// base vault
    pub base_vault: Pubkey,
    /// quote vault
    pub quote_vault: Pubkey,
    /// base reserve
    pub base_reserve: u64,
    /// virtual base reserve, used for price calculation
    pub virtual_base_reserve: u64,
    /// quote reserve
    pub quote_reserve: u64,
    /// virtual quote reserve, used for price calculation
    pub virtual_quote_reserve: u64,
    /// curve type, spl token or token2022
    pub curve_type: u8,
    /// is migrated
    pub is_migrated: u8,
    /// migration status enum (0: PreBondingCurve, 1: PostBondingCurve, 2: CreatedPool)
    pub migration_status: u8,
    /// padding 1
    pub _padding_1: [u8; 5],
    /// The time curve is finished
    pub curve_finish_timestamp: u64,
    /// The protocol fee
    pub protocol_fee: u64,
    /// The creator/meme fee reserve
    pub creator_fee: u64,
}

impl BondingCurve {
    pub fn init(
        &mut self,
        config: Pubkey,
        creator: Pubkey,
        base_mint: Pubkey,
        base_vault: Pubkey,
        quote_vault: Pubkey,
        curve_type: u8,
        base_reserve: u64,
        virtual_quote_reserve: u64,
        virtual_base_reserve: u64,
    ) {
        self.config = config;
        self.creator = creator;
        self.base_mint = base_mint;
        self.base_vault = base_vault;
        self.quote_vault = quote_vault;
        self.curve_type = curve_type;
        self.base_reserve = base_reserve;
        self.virtual_quote_reserve = virtual_quote_reserve;
        self.virtual_base_reserve = virtual_base_reserve;
    }

    pub fn get_swap_result(
        &self,
        config: &Config,
        amount_in: u64,
        trade_direction: TradeDirection,
        has_l1_referral: bool,
        has_l2_referral: bool,
        has_l3_referral: bool,
        cashback_tier: Option<CashbackTier>,
    ) -> Result<SwapResult> {
        let mut protocol_fee = 0u64;
        let mut trading_fee = 0u64;
        let mut l1_referral_fee = 0u64;
        let mut l2_referral_fee = 0u64;
        let mut l3_referral_fee = 0u64;
        let mut creator_fee = 0u64;
        let mut cashback_fee = 0u64;

        let mut actual_amount_in = if trade_direction == TradeDirection::QuoteToBase {
            let fee_breakdown = config.get_fee_on_amount(
                amount_in,
                has_l1_referral,
                has_l2_referral,
                has_l3_referral,
                cashback_tier,
            )?;

            protocol_fee = fee_breakdown.protocol_fee;
            trading_fee = fee_breakdown.sum();
            l1_referral_fee = fee_breakdown.l1_referral_fee;
            l2_referral_fee = fee_breakdown.l2_referral_fee;
            l3_referral_fee = fee_breakdown.l3_referral_fee;
            creator_fee = fee_breakdown.creator_fee;
            cashback_fee = fee_breakdown.cashback_fee;

            fee_breakdown.amount
        } else {
            amount_in
        };

        let output_amount = match trade_direction {
            TradeDirection::QuoteToBase => get_swap_amount_from_quote_to_base(
                self.virtual_quote_reserve as u128,
                self.virtual_base_reserve as u128,
                actual_amount_in,
            ),
            TradeDirection::BaseToQuote => get_swap_amount_from_base_to_quote(
                self.virtual_quote_reserve as u128,
                self.virtual_base_reserve as u128,
                actual_amount_in,
            ),
        }?;

        let actual_amount_out = if trade_direction == TradeDirection::QuoteToBase {
            // Check if output_amount exceeds base_reserve first
            if output_amount >= self.base_reserve
                || self.base_reserve.safe_sub(output_amount)? < config.migration_base_threshold
            {
                let new_base_output_amount = self
                    .base_reserve
                    .safe_sub(config.migration_base_threshold)?;

                let new_virtual_base =
                    self.virtual_base_reserve.safe_sub(new_base_output_amount)?;

                let capped_amount_in = get_swap_amount_from_base_to_quote(
                    config.migration_quote_threshold as u128,
                    new_virtual_base as u128,
                    new_base_output_amount,
                )?;

                let fee_breakdown = config.get_fee_on_amount(
                    capped_amount_in,
                    has_l1_referral,
                    has_l2_referral,
                    has_l3_referral,
                    cashback_tier,
                )?;

                protocol_fee = fee_breakdown.protocol_fee;
                trading_fee = fee_breakdown.sum();
                l1_referral_fee = fee_breakdown.l1_referral_fee;
                l2_referral_fee = fee_breakdown.l2_referral_fee;
                l3_referral_fee = fee_breakdown.l3_referral_fee;
                creator_fee = fee_breakdown.creator_fee;
                cashback_fee = fee_breakdown.cashback_fee;
                actual_amount_in = capped_amount_in;

                new_base_output_amount
            } else {
                output_amount
            }
        } else {
            let fee_breakdown = config.get_fee_on_amount(
                output_amount,
                has_l1_referral,
                has_l2_referral,
                has_l3_referral,
                cashback_tier,
            )?;

            protocol_fee = fee_breakdown.protocol_fee;
            trading_fee = fee_breakdown.sum();
            l1_referral_fee = fee_breakdown.l1_referral_fee;
            l2_referral_fee = fee_breakdown.l2_referral_fee;
            l3_referral_fee = fee_breakdown.l3_referral_fee;
            creator_fee = fee_breakdown.creator_fee;
            cashback_fee = fee_breakdown.cashback_fee;

            fee_breakdown.amount
        };

        Ok(SwapResult {
            actual_input_amount: actual_amount_in,
            output_amount: actual_amount_out,
            trading_fee,
            protocol_fee,
            cashback_fee,
            creator_fee,
            l1_referral_fee,
            l2_referral_fee,
            l3_referral_fee,
        })
    }

    pub fn apply_swap_result(
        &mut self,
        swap_result: &SwapResult,
        trade_direction: TradeDirection,
    ) -> Result<()> {
        if trade_direction == TradeDirection::BaseToQuote {
            self.base_reserve = self
                .base_reserve
                .safe_add(swap_result.actual_input_amount)?;
            self.virtual_base_reserve = self
                .virtual_base_reserve
                .safe_add(swap_result.actual_input_amount)?;

            self.quote_reserve = self.quote_reserve.safe_sub(swap_result.output_amount)?;
            self.virtual_quote_reserve = self
                .virtual_quote_reserve
                .safe_sub(swap_result.output_amount)?;
        } else {
            self.quote_reserve = self
                .quote_reserve
                .safe_add(swap_result.actual_input_amount)?;
            self.virtual_quote_reserve = self
                .virtual_quote_reserve
                .safe_add(swap_result.actual_input_amount)?;
            self.base_reserve = self.base_reserve.safe_sub(swap_result.output_amount)?;
            self.virtual_base_reserve = self
                .virtual_base_reserve
                .safe_sub(swap_result.output_amount)?;
        }

        self.creator_fee = self.creator_fee.safe_add(swap_result.creator_fee)?;
        self.protocol_fee = self.protocol_fee.safe_add(swap_result.protocol_fee)?;

        Ok(())
    }

    pub fn is_curve_complete(&self, migration_base_threshold: u64) -> bool {
        self.base_reserve <= migration_base_threshold
    }

    pub fn set_migration_status(&mut self, status: u8) {
        self.migration_status = status;
    }

    pub fn get_migration_progress(&self) -> Result<MigrationStatus> {
        let migration_progress = MigrationStatus::try_from(self.migration_status)
            .map_err(|_| AmmError::TypeCastFailed)?;
        Ok(migration_progress)
    }

    pub fn update_after_migration(&mut self) {
        self.is_migrated = 1;
    }

    pub fn claim_protocol_fee(&mut self) -> u64 {
        let claim_amount = self.protocol_fee;
        self.protocol_fee = 0u64;
        claim_amount
    }

    pub fn claim_creator_fee(&mut self) -> u64 {
        let claim_amount = self.creator_fee;
        self.creator_fee = 0u64;
        claim_amount
    }

    pub fn get_migration_amount(&self, migration_fee_basis_points: u16) -> Result<MigrationAmount> {
        let quote_amount: u64 = safe_mul_div_cast_u64(
            self.quote_reserve,
            FEE_DENOMINATOR.safe_sub(migration_fee_basis_points as u64)?,
            FEE_DENOMINATOR,
            Rounding::Up,
        )?;
        let base_amount = safe_mul_div_cast_u64(
            self.base_reserve,
            FEE_DENOMINATOR.safe_sub(migration_fee_basis_points as u64)?,
            FEE_DENOMINATOR,
            Rounding::Up,
        )?;
        Ok(MigrationAmount {
            quote_amount,
            base_amount,
        })
    }

    pub fn event(
        &self,
        curve_key: Pubkey,
        quote_mint: Pubkey,
        name: String,
        symbol: String,
        uri: String,
        initial_virtual_quote_reserve: u64,
        initial_virtual_base_reserve: u64,
    ) -> EvtInitializeCurve {
        EvtInitializeCurve {
            curve: curve_key.key(),
            config: self.config,
            creator: self.creator,
            base_mint: self.base_mint,
            quote_mint: quote_mint.key(),
            curve_type: self.curve_type,
            name,
            symbol,
            uri,
            initial_virtual_quote_reserve,
            initial_virtual_base_reserve,
        }
    }
}

pub struct MigrationAmount {
    pub quote_amount: u64,
    pub base_amount: u64,
}

/// Encodes all results of swapping
#[derive(Debug, PartialEq, AnchorDeserialize, AnchorSerialize)]
pub struct SwapResult {
    pub actual_input_amount: u64,
    pub output_amount: u64,
    pub trading_fee: u64,
    pub protocol_fee: u64,
    pub cashback_fee: u64,
    pub creator_fee: u64,
    pub l1_referral_fee: u64,
    pub l2_referral_fee: u64,
    pub l3_referral_fee: u64,
}

/// aka buy
fn get_swap_amount_from_quote_to_base(
    virtual_quote: u128,
    virtual_base: u128,
    amount_in: u64,
) -> Result<u64> {
    // Scale tokens for precision
    // TODO: we are assuming that the quote token has 9 decimals and the base token has 6 decimals.
    // This should be configurable in the future.
    let virtual_base_scaled = virtual_base.safe_mul(1000)?;
    let k = virtual_quote.safe_mul(virtual_base_scaled)?;
    let new_virtual_quote = virtual_quote.safe_add(amount_in as u128)?;
    let new_virtual_base_scaled = k.safe_div(new_virtual_quote)?;
    let base_out_amount = virtual_base_scaled
        .safe_sub(new_virtual_base_scaled)?
        .safe_div(1000)?;

    Ok(base_out_amount as u64)
}

/// aka sell
fn get_swap_amount_from_base_to_quote(
    virtual_quote: u128,
    virtual_base: u128,
    amount_in: u64,
) -> Result<u64> {
    // Scale tokens for precision
    // TODO: we are assuming that the quote token has 9 decimals and the base token has 6 decimals.
    // This should be configurable in the future.
    let virtual_base_scaled = virtual_base.safe_mul(1000)?;
    let amount_in_scaled = (amount_in as u128).safe_mul(1000)?;
    let new_virtual_base_scaled = virtual_base_scaled.safe_add(amount_in_scaled)?;

    // Calculate using x*y=k
    let k = virtual_base_scaled.safe_mul(virtual_quote)?;
    let new_quote = k.safe_div(new_virtual_base_scaled)?;
    let quote_out_amount = virtual_quote.safe_sub(new_quote)?;
    new_quote.safe_div(new_virtual_base_scaled)?;

    Ok(quote_out_amount as u64)
}

pub fn get_price(virtual_quote: u128, virtual_base: u128) -> Result<u128> {
    // Scale the price to account for different decimals
    let virtual_base_scaled = virtual_base.safe_mul(1000)?;
    let price = virtual_quote.safe_div(virtual_base_scaled)?;
    Ok(price)
}
