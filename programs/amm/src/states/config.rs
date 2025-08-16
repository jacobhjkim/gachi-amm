use anchor_lang::prelude::*;
use num_enum::{IntoPrimitive, TryFromPrimitive};
use static_assertions::const_assert_eq;

use crate::{
    constants::fee::FEE_DENOMINATOR,
    events::EvtCreateConfig,
    instructions::LockedVestingParams,
    params::liquidity_distribution::LiquidityDistributionParameters,
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

#[zero_copy]
#[derive(InitSpace, Debug, Default)]
pub struct LiquidityDistributionConfig {
    pub sqrt_price: u128,
    pub liquidity: u128,
}

#[zero_copy]
#[derive(Debug, InitSpace, Default)]
pub struct LockedVestingConfig {
    pub amount_per_period: u64,
    pub cliff_duration_from_migration_time: u64,
    pub frequency: u64,
    pub number_of_period: u64,
    pub cliff_unlock_amount: u64,
    pub _padding: u64,
}

const_assert_eq!(LockedVestingConfig::INIT_SPACE, 48);

impl LockedVestingConfig {
    pub fn to_locked_vesting_params(&self) -> LockedVestingParams {
        LockedVestingParams {
            amount_per_period: self.amount_per_period,
            cliff_duration_from_migration_time: self.cliff_duration_from_migration_time,
            frequency: self.frequency,
            number_of_period: self.number_of_period,
            cliff_unlock_amount: self.cliff_unlock_amount,
        }
    }
}

#[account(zero_copy)]
#[derive(InitSpace, Debug, Default)]
pub struct Config {
    /// quote mint
    pub quote_mint: Pubkey,
    /// fee claimer
    pub fee_claimer: Pubkey,

    /* Token configurations */
    /// token type (0 | 1), 0: SPL Token, 1: Token2022
    pub token_type: u8,
    /// quote token flag (either SPL Token or Token2022)
    pub quote_token_flag: u8,
    /// token decimal, (6 | 9)
    pub token_decimal: u8,
    /// padding 1  
    pub _padding_1: [u8; 5],

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
    /// creator fee in bps
    pub creator_fee_basis_points: u16,
    /// migration fee in bps (quote token fee)
    pub migration_fee_basis_points: u16,
    pub _padding_2: [u8; 2],

    /* Price configurations */
    /// total amount of quote token raised for migration
    pub migration_quote_threshold: u64,
    /// migration base threshold (in base token)
    pub migration_base_threshold: u64,
    /// base token amount to sell before migration
    pub swap_base_amount: u64,
    /// initial sqrt price, the minimum price
    pub initial_sqrt_price: u128,
    /// migration sqrt price, once we reach this price, we will migrate
    pub migration_sqrt_price: u128,

    /// locked vesting config
    pub locked_vesting_config: LockedVestingConfig,

    /// curve, only use 4 points firstly, we can extend that later
    // each distribution will include curve[i].sqrt_price + curve[i+1].sqrt_price + curve[i+1].liquidity
    // for the first: sqrt_start_price + curve[0].sqrt_price + curve[0].liquidity
    pub curve: [LiquidityDistributionConfig; 4],
}

impl Config {
    pub fn init(
        &mut self,
        /* Token configurations */
        token_type: u8,
        quote_token_flag: u8,
        token_decimal: u8,
        quote_mint: &Pubkey,

        /* Fee configurations */
        fee_basis_points: u16,
        l1_referral_fee_basis_points: u16,
        l2_referral_fee_basis_points: u16,
        l3_referral_fee_basis_points: u16,
        referee_discount_basis_points: u16,
        creator_fee_basis_points: u16,
        migration_fee_basis_points: u16,
        fee_claimer: &Pubkey,

        /* Price configurations */
        initial_sqrt_price: u128,
        migration_sqrt_price: u128,
        migration_quote_threshold: u64,
        migration_base_threshold: u64,
        swap_base_amount: u64,

        /* Locked vesting config */
        locked_vesting_params: &LockedVestingParams,

        /* Liquidity distribution curve */
        curve: &Vec<LiquidityDistributionParameters>,
    ) {
        self.token_type = token_type;
        self.quote_token_flag = quote_token_flag;
        self.token_decimal = token_decimal;
        self.quote_mint = *quote_mint;

        /* Fee configurations */
        self.fee_basis_points = fee_basis_points;
        self.l1_referral_fee_basis_points = l1_referral_fee_basis_points;
        self.l2_referral_fee_basis_points = l2_referral_fee_basis_points;
        self.l3_referral_fee_basis_points = l3_referral_fee_basis_points;
        self.referee_discount_basis_points = referee_discount_basis_points;
        self.creator_fee_basis_points = creator_fee_basis_points;
        self.migration_fee_basis_points = migration_fee_basis_points;
        self.fee_claimer = *fee_claimer;

        /* Price configurations */
        self.initial_sqrt_price = initial_sqrt_price;
        self.migration_sqrt_price = migration_sqrt_price;
        self.migration_quote_threshold = migration_quote_threshold;
        self.migration_base_threshold = migration_base_threshold;
        self.swap_base_amount = swap_base_amount;

        self.locked_vesting_config = locked_vesting_params.to_locked_vesting_config();

        for i in 0..curve.len() {
            self.curve[i] = curve[i].to_liquidity_distribution_config();
        }
    }

    pub fn event(&self, config_key: Pubkey) -> EvtCreateConfig {
        EvtCreateConfig {
            config: config_key,

            /* Token configurations */
            token_type: self.token_type,
            quote_token_flag: self.quote_token_flag,
            token_decimal: self.token_decimal,
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
            initial_sqrt_price: self.initial_sqrt_price,
            migration_sqrt_price: self.migration_sqrt_price,
            migration_quote_threshold: self.migration_quote_threshold,
            migration_base_threshold: self.migration_base_threshold,
            swap_base_amount: self.swap_base_amount,
            curve: self
                .curve
                .iter()
                .map(|c| LiquidityDistributionParameters {
                    sqrt_price: c.sqrt_price,
                    liquidity: c.liquidity,
                })
                .collect(),
        }
    }

    pub fn get_fee_on_amount(
        &self,
        amount_in: u64,
        has_l1_referral: bool,
        has_l2_referral: bool,
        has_l3_referral: bool,
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
        let cashback_fee: u64 =
            safe_mul_div_cast_u64(amount_in, cashback_bps, FEE_DENOMINATOR, Rounding::Down)?;

        let creator_fee: u64 = safe_mul_div_cast_u64(
            amount_in,
            self.creator_fee_basis_points as u64,
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

    pub fn get_max_swallow_quote_amount(&self) -> Result<u64> {
        let max_swallow_amount = safe_mul_div_cast_u64(
            self.migration_quote_threshold,
            20, // TODO: make this configurable
            100,
            Rounding::Down,
        )?;
        Ok(max_swallow_amount)
    }

    pub fn get_migration_quote_amount(&self) -> Result<MigrationAmount> {
        let quote_amount: u64 = safe_mul_div_cast_u64(
            self.migration_quote_threshold,
            FEE_DENOMINATOR.safe_sub(self.migration_fee_basis_points as u64)?,
            FEE_DENOMINATOR,
            Rounding::Up,
        )?;
        let fee = self.migration_quote_threshold.safe_sub(quote_amount)?;
        Ok(MigrationAmount { quote_amount, fee })
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

pub struct MigrationAmount {
    pub quote_amount: u64,
    pub fee: u64,
}
