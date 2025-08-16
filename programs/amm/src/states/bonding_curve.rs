use crate::{
    constants::fee::FEE_DENOMINATOR,
    curve::{
        get_delta_amount_base_unsigned, get_delta_amount_base_unsigned_256,
        get_delta_amount_quote_unsigned, get_delta_amount_quote_unsigned_256,
        get_next_sqrt_price_from_input,
    },
    params::swap::TradeDirection,
    safe_math::{safe_mul_div_cast_u64, SafeMath},
    states::{CashbackTier, Config},
    u128x128_math::Rounding,
    AmmError,
};
use anchor_lang::prelude::*;
use num_enum::{IntoPrimitive, TryFromPrimitive};
use ruint::aliases::U256;

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
// 1. Without lock
//    PreBonding -> LockedVesting -> CreatedPool
//
// 2. With lock
//    PreBonding -> PostBonding -> LockedVesting -> CreatedPool
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
    LockedVesting,
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
    /// quote reserve
    pub quote_reserve: u64,
    /// current price
    pub sqrt_price: u128,
    /// curve type, spl token or token2022
    pub curve_type: u8,
    /// is migrated
    pub is_migrated: u8,
    /// migration status enum (0: PreBondingCurve, 1: PostBondingCurve, 2: LockedVesting, 3: CreatedPool)
    pub migration_status: u8,
    /// padding 1
    pub _padding_1: [u8; 5],
    /// The time curve is finished
    pub curve_finish_timestamp: u64,
    /// The protocol fee
    pub protocol_fee: u64,
    /// The creator fee
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
        sqrt_price: u128,
        curve_type: u8,
        base_reserve: u64,
    ) {
        self.config = config;
        self.creator = creator;
        self.base_mint = base_mint;
        self.base_vault = base_vault;
        self.quote_vault = quote_vault;
        self.sqrt_price = sqrt_price;
        self.curve_type = curve_type;
        self.base_reserve = base_reserve;
    }

    // aka sell
    fn get_swap_amount_from_base_to_quote(
        &self,
        config: &Config,
        amount_in: u64,
    ) -> Result<SwapAmount> {
        // finding new target price
        let mut total_output_amount = 0u64;
        let mut current_sqrt_price = self.sqrt_price;
        let mut amount_left = amount_in;

        for i in (0..config.curve.len() - 1).rev() {
            if config.curve[i].sqrt_price == 0 || config.curve[i].liquidity == 0 {
                continue;
            }
            if config.curve[i].sqrt_price < current_sqrt_price {
                let max_amount_in = get_delta_amount_base_unsigned_256(
                    config.curve[i].sqrt_price,
                    current_sqrt_price,
                    config.curve[i + 1].liquidity,
                    Rounding::Up, // TODO check whether we should use round down or round up
                )?;
                if U256::from(amount_left) < max_amount_in {
                    let next_sqrt_price = get_next_sqrt_price_from_input(
                        current_sqrt_price,
                        config.curve[i + 1].liquidity,
                        amount_left,
                        true,
                    )?;

                    let output_amount = get_delta_amount_quote_unsigned(
                        next_sqrt_price,
                        current_sqrt_price,
                        config.curve[i + 1].liquidity,
                        Rounding::Down,
                    )?;
                    total_output_amount = total_output_amount.safe_add(output_amount)?;
                    current_sqrt_price = next_sqrt_price;
                    amount_left = 0;
                    break;
                } else {
                    let next_sqrt_price = config.curve[i].sqrt_price;
                    let output_amount = get_delta_amount_quote_unsigned(
                        next_sqrt_price,
                        current_sqrt_price,
                        config.curve[i + 1].liquidity,
                        Rounding::Down,
                    )?;
                    total_output_amount = total_output_amount.safe_add(output_amount)?;
                    current_sqrt_price = next_sqrt_price;
                    amount_left = amount_left.safe_sub(
                        max_amount_in
                            .try_into()
                            .map_err(|_| AmmError::TypeCastFailed)?,
                    )?;
                }
            }
        }
        if amount_left != 0 {
            let next_sqrt_price = get_next_sqrt_price_from_input(
                current_sqrt_price,
                config.curve[0].liquidity,
                amount_left,
                true,
            )?;

            let output_amount = get_delta_amount_quote_unsigned(
                next_sqrt_price,
                current_sqrt_price,
                config.curve[0].liquidity,
                Rounding::Down,
            )?;
            total_output_amount = total_output_amount.safe_add(output_amount)?;
            current_sqrt_price = next_sqrt_price;
        }

        Ok(SwapAmount {
            output_amount: total_output_amount,
            next_sqrt_price: current_sqrt_price,
        })
    }

    fn get_swap_amount_from_quote_to_base(
        &self,
        config: &Config,
        amount_in: u64,
    ) -> Result<SwapAmount> {
        // finding new target price
        let mut total_output_amount = 0u64;
        let mut current_sqrt_price = self.sqrt_price;
        let mut amount_left = amount_in;

        for i in 0..config.curve.len() {
            if config.curve[i].sqrt_price == 0 || config.curve[i].liquidity == 0 {
                break;
            }
            if config.curve[i].sqrt_price > current_sqrt_price {
                let max_amount_in = get_delta_amount_quote_unsigned_256(
                    current_sqrt_price,
                    config.curve[i].sqrt_price,
                    config.curve[i].liquidity,
                    Rounding::Up, // TODO check whether we should use round down or round up
                )?;
                if U256::from(amount_left) < max_amount_in {
                    let next_sqrt_price = get_next_sqrt_price_from_input(
                        current_sqrt_price,
                        config.curve[i].liquidity,
                        amount_left,
                        false,
                    )?;

                    let output_amount = get_delta_amount_base_unsigned(
                        current_sqrt_price,
                        next_sqrt_price,
                        config.curve[i].liquidity,
                        Rounding::Down,
                    )?;
                    total_output_amount = total_output_amount.safe_add(output_amount)?;
                    current_sqrt_price = next_sqrt_price;
                    amount_left = 0;
                    break;
                } else {
                    let next_sqrt_price = config.curve[i].sqrt_price;
                    let output_amount = get_delta_amount_base_unsigned(
                        current_sqrt_price,
                        next_sqrt_price,
                        config.curve[i].liquidity,
                        Rounding::Down,
                    )?;
                    total_output_amount = total_output_amount.safe_add(output_amount)?;
                    current_sqrt_price = next_sqrt_price;
                    amount_left = amount_left.safe_sub(
                        max_amount_in
                            .try_into()
                            .map_err(|_| AmmError::TypeCastFailed)?,
                    )?;
                }
            }
        }

        // allow pool swallow an extra amount
        require!(
            amount_left <= config.get_max_swallow_quote_amount()?,
            AmmError::SwapAmountIsOverAThreshold
        );

        Ok(SwapAmount {
            output_amount: total_output_amount,
            next_sqrt_price: current_sqrt_price,
        })
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

        let actual_amount_in = if trade_direction == TradeDirection::QuoteToBase {
            let mut fee_breakdown = config.get_fee_on_amount(
                amount_in,
                has_l1_referral,
                has_l2_referral,
                has_l3_referral,
                cashback_tier,
            )?;

            if self
                .quote_reserve
                .safe_sub(self.creator_fee)?
                .safe_sub(self.protocol_fee)?
                .safe_add(fee_breakdown.amount)?
                > config.migration_quote_threshold
            {
                let has_referral = has_l1_referral || has_l2_referral || has_l3_referral;
                let capped_amount_in_before_fees = config
                    .migration_quote_threshold
                    .safe_sub(self.quote_reserve)?
                    .safe_add(self.creator_fee)?
                    .safe_add(self.protocol_fee)?;
                let effective_fee_basis_points = if has_referral {
                    config
                        .fee_basis_points
                        .safe_sub(config.referee_discount_basis_points)?
                } else {
                    config.fee_basis_points
                };
                let capped_amount_in = safe_mul_div_cast_u64(
                    capped_amount_in_before_fees,
                    FEE_DENOMINATOR,
                    FEE_DENOMINATOR.safe_sub(effective_fee_basis_points as u64)?,
                    Rounding::Up,
                )?;

                fee_breakdown = config.get_fee_on_amount(
                    capped_amount_in,
                    has_l1_referral,
                    has_l2_referral,
                    has_l3_referral,
                    cashback_tier,
                )?;

                // Ensure that the amount after fees is still above the migration threshold
                require!(
                    self.quote_reserve
                        .safe_sub(self.creator_fee)?
                        .safe_sub(self.protocol_fee)?
                        .safe_add(fee_breakdown.amount)?
                        >= config.migration_quote_threshold,
                    AmmError::InvalidMigrationCalculation
                );
            }

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

        let SwapAmount {
            output_amount,
            next_sqrt_price,
        } = match trade_direction {
            TradeDirection::QuoteToBase => {
                self.get_swap_amount_from_quote_to_base(config, actual_amount_in)
            }
            TradeDirection::BaseToQuote => {
                self.get_swap_amount_from_base_to_quote(config, actual_amount_in)
            }
        }?;

        let actual_amount_out = if trade_direction == TradeDirection::QuoteToBase {
            output_amount
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
            next_sqrt_price,
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
        self.sqrt_price = swap_result.next_sqrt_price;

        if trade_direction == TradeDirection::BaseToQuote {
            self.base_reserve = self
                .base_reserve
                .safe_add(swap_result.actual_input_amount)?;
            self.quote_reserve = self.quote_reserve.safe_sub(swap_result.output_amount)?;
        } else {
            self.quote_reserve = self
                .quote_reserve
                .safe_add(swap_result.actual_input_amount)?;
            self.base_reserve = self.base_reserve.safe_sub(swap_result.output_amount)?;
        }

        self.creator_fee = self.creator_fee.safe_add(swap_result.creator_fee)?;
        self.protocol_fee = self.protocol_fee.safe_add(swap_result.protocol_fee)?;

        Ok(())
    }

    pub fn is_curve_complete(&self, migration_threshold: u64) -> bool {
        self.quote_reserve >= migration_threshold
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
}

/// Encodes all results of swapping
#[derive(Debug, PartialEq, AnchorDeserialize, AnchorSerialize)]
pub struct SwapResult {
    pub actual_input_amount: u64,
    pub output_amount: u64,
    pub next_sqrt_price: u128,
    pub trading_fee: u64,
    pub protocol_fee: u64,
    pub cashback_fee: u64,
    pub creator_fee: u64,
    pub l1_referral_fee: u64,
    pub l2_referral_fee: u64,
    pub l3_referral_fee: u64,
}

pub struct SwapAmount {
    output_amount: u64,
    next_sqrt_price: u128,
}
