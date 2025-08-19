use anchor_lang::prelude::*;
use num_enum::{IntoPrimitive, TryFromPrimitive};

use crate::states::FeeType;
use crate::{
    constants::fee::FEE_DENOMINATOR,
    events::EvtCreateConfig,
    safe_math::{safe_mul_div_cast_u64, SafeMath},
    states::CashbackTier,
    u128x128_math::Rounding,
};

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
pub enum TokenType {
    SplToken,
    Token2022,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ProtocolAuthorityArgs {
    pub global_authority: Option<Pubkey>,
    pub migration_authority: Option<Pubkey>,
}

/// Encodes all results of swapping
#[derive(Debug, PartialEq)]
pub struct FeeBreakdown {
    pub amount: u64,
    pub l1_referral_fee: u64, // Goes to referrer's cashback account
    pub l2_referral_fee: u64, // Goes to referrer's cashback account
    pub l3_referral_fee: u64, // Goes to referrer's cashback account
    pub creator_fee: u64,     // Goes to creator's cashback account
    pub cashback_fee: u64,    // Goes to trader's cashback account
    pub protocol_fee: u64,    // Goes to protocol
}

#[account(zero_copy)]
#[derive(InitSpace, Debug, Default)]
pub struct Config {
    /// quote mint
    pub quote_mint: Pubkey,
    /// fee claimer
    pub fee_claimer: Pubkey,

    /* Token configurations */
    /// base token flag (0 | 1), 0: SPL Token, 1: Token2022
    pub base_token_flag: u8,
    /// quote token flag (0 | 1), 0: SPL Token, 1: Token2022
    pub quote_token_flag: u8,
    /// base token decimal, (6 | 9)
    pub base_decimal: u8,
    /// quote token decimal, (6 | 9)
    pub quote_decimal: u8,
    /// padding 1  
    pub _padding_1: [u8; 4],

    /* Fee configurations */
    /// Trading fee in bps
    pub fee_basis_points: u16,
    /// Level 1 referral fee in bps
    pub l1_referral_fee_basis_points: u16,
    /// Level 2 referral fee in bps
    pub l2_referral_fee_basis_points: u16,
    /// Level 3 referral fee in bps
    pub l3_referral_fee_basis_points: u16,
    /// Referee discount fee in bps (if the user has a referral, they will get this discount)
    pub referee_discount_basis_points: u16,
    /// creator/project fee in bps
    pub creator_fee_basis_points: u16,
    /// meme/community fee in bps
    pub meme_fee_basis_points: u16,
    /// migration fee in bps (quote token fee)
    pub migration_fee_basis_points: u16,

    /* Price configurations */
    /// migration base threshold (the amount of token to migrate)
    pub migration_base_threshold: u64,
    /// migration quote threshold
    pub migration_quote_threshold: u64,
    /// initial virtual quote reserve to boost the initial liquidity
    pub initial_virtual_quote_reserve: u64,
    /// initial virtual base reserve to boost the initial liquidity
    pub initial_virtual_base_reserve: u64,
    /// for future use
    pub _padding_3: [u64; 4],
}

impl Config {
    pub fn init(
        &mut self,
        quote_mint: &Pubkey,
        fee_claimer: &Pubkey,

        /* Token configurations */
        base_token_flag: u8,
        quote_token_flag: u8,
        base_decimal: u8,
        quote_decimal: u8,

        /* Fee configurations */
        fee_basis_points: u16,
        l1_referral_fee_basis_points: u16,
        l2_referral_fee_basis_points: u16,
        l3_referral_fee_basis_points: u16,
        referee_discount_basis_points: u16,
        creator_fee_basis_points: u16,
        meme_fee_basis_points: u16,
        migration_fee_basis_points: u16,

        /* Price configurations */
        migration_base_threshold: u64,
        migration_quote_threshold: u64,
        initial_virtual_quote_reserve: u64,
        initial_virtual_base_reserve: u64,
    ) {
        self.quote_mint = *quote_mint;
        self.fee_claimer = *fee_claimer;

        /* Token configurations */
        self.base_token_flag = base_token_flag;
        self.quote_token_flag = quote_token_flag;
        self.base_decimal = base_decimal;
        self.quote_decimal = quote_decimal;

        /* Fee configurations */
        self.fee_basis_points = fee_basis_points;
        self.l1_referral_fee_basis_points = l1_referral_fee_basis_points;
        self.l2_referral_fee_basis_points = l2_referral_fee_basis_points;
        self.l3_referral_fee_basis_points = l3_referral_fee_basis_points;
        self.referee_discount_basis_points = referee_discount_basis_points;
        self.creator_fee_basis_points = creator_fee_basis_points;
        self.meme_fee_basis_points = meme_fee_basis_points;
        self.migration_fee_basis_points = migration_fee_basis_points;

        /* Price configurations */
        self.migration_base_threshold = migration_base_threshold;
        self.migration_quote_threshold = migration_quote_threshold;
        self.initial_virtual_quote_reserve = initial_virtual_quote_reserve;
        self.initial_virtual_base_reserve = initial_virtual_base_reserve;
    }

    pub fn event(&self, config_key: Pubkey) -> EvtCreateConfig {
        EvtCreateConfig {
            config: config_key,

            /* Token configurations */
            base_token_flag: self.base_token_flag,
            quote_token_flag: self.quote_token_flag,
            base_decimal: self.base_decimal,
            quote_decimal: self.quote_decimal,
            quote_mint: self.quote_mint,

            /* Fee configurations */
            fee_basis_points: self.fee_basis_points,
            l1_referral_fee_basis_points: self.l1_referral_fee_basis_points,
            l2_referral_fee_basis_points: self.l2_referral_fee_basis_points,
            l3_referral_fee_basis_points: self.l3_referral_fee_basis_points,
            creator_fee_basis_points: self.creator_fee_basis_points,
            migration_fee_basis_points: self.migration_fee_basis_points,
            fee_claimer: self.fee_claimer,

            /* Price configurations */
            migration_base_threshold: self.migration_base_threshold,
            migration_quote_threshold: self.migration_quote_threshold,
            initial_virtual_quote_reserve: self.initial_virtual_quote_reserve,
            initial_virtual_base_reserve: self.initial_virtual_base_reserve,
        }
    }

    pub fn get_fee_on_amount(
        &self,
        amount_in: u64,
        has_l1_referral: bool,
        has_l2_referral: bool,
        has_l3_referral: bool,
        fee_type: FeeType,
        cashback_tier: Option<CashbackTier>,
    ) -> Result<FeeBreakdown> {
        let l1_referral_fee = if has_l1_referral {
            safe_mul_div_cast_u64(
                amount_in,
                self.l1_referral_fee_basis_points as u64,
                FEE_DENOMINATOR,
                Rounding::Down,
            )?
        } else {
            0u64
        };

        let l2_referral_fee = if has_l2_referral {
            safe_mul_div_cast_u64(
                amount_in,
                self.l2_referral_fee_basis_points as u64,
                FEE_DENOMINATOR,
                Rounding::Down,
            )?
        } else {
            0u64
        };

        let l3_referral_fee = if has_l3_referral {
            safe_mul_div_cast_u64(
                amount_in,
                self.l3_referral_fee_basis_points as u64,
                FEE_DENOMINATOR,
                Rounding::Down,
            )?
        } else {
            0u64
        };

        let cashback_bps = cashback_tier
            .map(|tier| tier.get_cashback_bps())
            .unwrap_or(0);
        let cashback_fee: u64 = safe_mul_div_cast_u64(
            amount_in,
            cashback_bps as u64,
            FEE_DENOMINATOR,
            Rounding::Down,
        )?;

        let creator_fee_basis_points = if fee_type == FeeType::Creator {
            self.creator_fee_basis_points
        } else if fee_type == FeeType::Meme {
            self.meme_fee_basis_points
        } else {
            0u16
        };

        let creator_fee: u64 = safe_mul_div_cast_u64(
            amount_in,
            creator_fee_basis_points as u64,
            FEE_DENOMINATOR,
            Rounding::Down,
        )?;

        let has_referral = has_l1_referral || has_l2_referral || has_l3_referral;
        let total_fee: u64 = safe_mul_div_cast_u64(
            amount_in,
            if has_referral {
                self.fee_basis_points
                    .safe_sub(self.referee_discount_basis_points)? as u64
            } else {
                self.fee_basis_points as u64
            },
            FEE_DENOMINATOR,
            Rounding::Down,
        )?;
        let protocol_fee = total_fee
            .safe_sub(l1_referral_fee)?
            .safe_sub(l2_referral_fee)?
            .safe_sub(l3_referral_fee)?
            .safe_sub(creator_fee)?
            .safe_sub(cashback_fee)?;

        let amount = amount_in.safe_sub(total_fee)?;

        Ok(FeeBreakdown {
            amount,
            protocol_fee,
            cashback_fee,
            creator_fee,
            l1_referral_fee,
            l2_referral_fee,
            l3_referral_fee,
        })
    }
}

impl FeeBreakdown {
    pub fn sum(&self) -> u64 {
        self.l1_referral_fee
            + self.l2_referral_fee
            + self.l3_referral_fee
            + self.creator_fee
            + self.cashback_fee
            + self.protocol_fee
    }
}
