use crate::{
    params::{liquidity_distribution::get_sqrt_price_from_amounts, swap::TradeDirection},
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
pub enum FeeType {
    Creator,
    Meme,
    Blocked,
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
    /// current sqrt_price
    pub sqrt_price: u128,
    /// curve type, spl token or token2022
    pub curve_type: u8,
    /// fee type, (0: project/creator, 1: meme/community, 2: blocked)
    pub fee_type: u8,
    /// if the curve's fee_type has been reviewed by the admins. (0: not reviewed, 1: reviewed)
    pub fee_type_reviewed: u8,
    /// is migrated
    pub is_migrated: u8,
    /// migration status enum (0: PreBondingCurve, 1: PostBondingCurve, 2: CreatedPool)
    pub migration_status: u8,
    /// padding 1
    pub _padding_1: [u8; 3],
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
        sqrt_price: u128,
        curve_type: u8,
        fee_type: u8,
        base_reserve: u64,
        virtual_quote_reserve: u64,
        virtual_base_reserve: u64,
    ) {
        self.config = config;
        self.creator = creator;
        self.base_mint = base_mint;
        self.base_vault = base_vault;
        self.quote_vault = quote_vault;
        self.sqrt_price = sqrt_price;
        self.curve_type = curve_type;
        self.fee_type = fee_type;
        self.fee_type_reviewed = 0; // default to not reviewed
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
        let mut next_sqrt_price = 0u128;
        let fee_type = FeeType::try_from(self.fee_type).map_err(|_| AmmError::TypeCastFailed)?;

        let mut actual_amount_in = if trade_direction == TradeDirection::QuoteToBase {
            let fee_breakdown = config.get_fee_on_amount(
                amount_in,
                has_l1_referral,
                has_l2_referral,
                has_l3_referral,
                fee_type,
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

        let swap_amount = match trade_direction {
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
        next_sqrt_price = swap_amount.next_sqrt_price;

        let actual_amount_out = if trade_direction == TradeDirection::QuoteToBase {
            // Check if output_amount exceeds base_reserve first
            if swap_amount.output_amount >= self.base_reserve
                || self.base_reserve.safe_sub(swap_amount.output_amount)?
                    < config.migration_base_threshold
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
                    capped_amount_in.output_amount,
                    has_l1_referral,
                    has_l2_referral,
                    has_l3_referral,
                    fee_type,
                    cashback_tier,
                )?;

                protocol_fee = fee_breakdown.protocol_fee;
                trading_fee = fee_breakdown.sum();
                l1_referral_fee = fee_breakdown.l1_referral_fee;
                l2_referral_fee = fee_breakdown.l2_referral_fee;
                l3_referral_fee = fee_breakdown.l3_referral_fee;
                creator_fee = fee_breakdown.creator_fee;
                cashback_fee = fee_breakdown.cashback_fee;
                actual_amount_in = capped_amount_in.output_amount;
                next_sqrt_price = capped_amount_in.next_sqrt_price;

                new_base_output_amount
            } else {
                swap_amount.output_amount
            }
        } else {
            let fee_breakdown = config.get_fee_on_amount(
                swap_amount.output_amount,
                has_l1_referral,
                has_l2_referral,
                has_l3_referral,
                fee_type,
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

    pub fn fee_type_update_from_creator_to_meme(
        &mut self,
        creator_fee_basis_points: u16,
        meme_fee_basis_points: u16,
    ) -> Result<()> {
        require!(self.fee_type == 0, AmmError::InvalidFeeType);

        require!(
            creator_fee_basis_points >= meme_fee_basis_points,
            AmmError::InvalidCreatorTradingFeePercentage
        );
        let creator_fee_amount = self.creator_fee;
        let fee_ratio = creator_fee_basis_points.safe_div(meme_fee_basis_points)?;
        let new_creator_fee_amount = creator_fee_amount.safe_div(fee_ratio as u64)?;
        self.creator_fee = new_creator_fee_amount;

        // excess creator fee will be transferred to protocol fee
        self.protocol_fee += creator_fee_amount.safe_sub(new_creator_fee_amount)?;
        self.fee_type = 1; // update fee type to meme/community
        self.fee_type_reviewed = 1; // mark fee type as reviewed

        Ok(())
    }

    pub fn fee_type_update_from_meme_to_creator(&mut self) -> Result<()> {
        require!(self.fee_type == 1, AmmError::InvalidFeeType);
        self.fee_type = 0; // update fee type to project/creator
        self.fee_type_reviewed = 1; // mark fee type as reviewed

        Ok(())
    }

    pub fn fee_type_update_to_blocked(&mut self) -> Result<()> {
        require!(self.fee_type == 0, AmmError::InvalidFeeType);
        self.protocol_fee += self.creator_fee; // transfer all creator fee to protocol fee
        self.creator_fee = 0; // reset creator fee to 0
        self.fee_type = 2; // update fee type to blocked
        self.fee_type_reviewed = 1; // mark fee type as reviewed

        Ok(())
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

/// aka buy
fn get_swap_amount_from_quote_to_base(
    virtual_quote: u128,
    virtual_base: u128,
    amount_in: u64,
) -> Result<SwapAmount> {
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

    let next_sqrt_price = get_sqrt_price_from_amounts(
        new_virtual_base_scaled,
        new_virtual_quote,
        6, // Assuming base token has 6 decimals
        9, // Assuming quote token has 9 decimals
    )?;

    Ok(SwapAmount {
        output_amount: base_out_amount as u64,
        next_sqrt_price,
    })
}

/// aka sell
fn get_swap_amount_from_base_to_quote(
    virtual_quote: u128,
    virtual_base: u128,
    amount_in: u64,
) -> Result<SwapAmount> {
    // Scale tokens for precision
    // TODO: we are assuming that the quote token has 9 decimals and the base token has 6 decimals.
    // This should be configurable in the future.
    let virtual_base_scaled = virtual_base.safe_mul(1000)?;
    let amount_in_scaled = (amount_in as u128).safe_mul(1000)?;
    let new_virtual_base_scaled = virtual_base_scaled.safe_add(amount_in_scaled)?;
    msg!(
        "[BondingCurve] new_virtual_base_scaled: {}",
        new_virtual_base_scaled
    );
    msg!(
        "[BondingCurve] virtual_base_scaled: {}",
        virtual_base_scaled
    );
    msg!("[BondingCurve] amount_in_scaled: {}", amount_in_scaled);

    // Calculate using x*y=k
    let k = virtual_base_scaled.safe_mul(virtual_quote)?;
    let new_quote = k.safe_div(new_virtual_base_scaled)?;
    let quote_out_amount = virtual_quote.safe_sub(new_quote)?;
    msg!("[BondingCurve] k: {}", k);
    msg!("[BondingCurve] new_quote: {}", new_quote);
    msg!("[BondingCurve] quote_out_amount: {}", quote_out_amount);

    let next_sqrt_price = get_sqrt_price_from_amounts(
        new_virtual_base_scaled,
        new_quote,
        6, // Assuming base token has 6 decimals
        9, // Assuming quote token has 9 decimals
    )?;
    new_quote.safe_div(new_virtual_base_scaled)?;
    msg!("[BondingCurve] next_sqrt_price: {}", next_sqrt_price);

    Ok(SwapAmount {
        output_amount: quote_out_amount as u64,
        next_sqrt_price,
    })
}

pub fn get_price(virtual_quote: u128, virtual_base: u128) -> Result<u128> {
    // Scale the price to account for different decimals
    let virtual_base_scaled = virtual_base.safe_mul(1000)?;
    let price = virtual_quote.safe_div(virtual_base_scaled)?;
    Ok(price)
}

pub struct SwapAmount {
    output_amount: u64,
    next_sqrt_price: u128,
}
