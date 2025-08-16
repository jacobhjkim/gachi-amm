use std::u64;

use anchor_lang::prelude::*;
use ruint::aliases::U256;

use crate::{
    constants::{fee::FEE_DENOMINATOR, MAX_SQRT_PRICE, MIN_SQRT_PRICE},
    curve::{
        get_delta_amount_base_unsigned_256, get_delta_amount_quote_unsigned_256,
        get_initial_liquidity_from_delta_quote, get_next_sqrt_price_from_input,
    },
    safe_math::{safe_mul_div_cast_u64, SafeMath},
    states::LiquidityDistributionConfig,
    u128x128_math::Rounding,
    AmmError,
};

#[cfg(feature = "local")]
use crate::curve::get_initialize_amounts;

#[derive(Copy, Clone, Debug, AnchorSerialize, AnchorDeserialize, InitSpace, Default)]
pub struct LiquidityDistributionParameters {
    pub sqrt_price: u128,
    pub liquidity: u128,
}

impl LiquidityDistributionParameters {
    pub fn to_liquidity_distribution_config(&self) -> LiquidityDistributionConfig {
        LiquidityDistributionConfig {
            sqrt_price: self.sqrt_price,
            liquidity: self.liquidity,
        }
    }
}

pub fn get_base_token_for_swap(
    sqrt_start_price: u128,
    sqrt_migration_price: u128,
    curve: &[LiquidityDistributionParameters],
) -> Result<U256> {
    let mut total_amount = U256::ZERO;
    for i in 0..curve.len() {
        let lower_sqrt_price = if i == 0 {
            sqrt_start_price
        } else {
            curve[i - 1].sqrt_price
        };
        if curve[i].sqrt_price > sqrt_migration_price {
            let delta_amount = get_delta_amount_base_unsigned_256(
                lower_sqrt_price,
                sqrt_migration_price,
                curve[i].liquidity,
                Rounding::Up, // TODO check whether we should use round down or round up
            )?;
            total_amount = total_amount.safe_add(delta_amount)?;
            break;
        } else {
            let delta_amount = get_delta_amount_base_unsigned_256(
                lower_sqrt_price,
                curve[i].sqrt_price,
                curve[i].liquidity,
                Rounding::Up, // TODO check whether we should use round down or round up
            )?;
            total_amount = total_amount.safe_add(delta_amount)?;
        }
    }
    Ok(total_amount)
}

fn get_migration_quote_amount(
    migration_quote_threshold: u64,
    migration_fee_basis_points: u16,
) -> Result<u64> {
    let quote_amount: u64 = safe_mul_div_cast_u64(
        migration_quote_threshold,
        FEE_DENOMINATOR.safe_sub(migration_fee_basis_points as u64)?,
        FEE_DENOMINATOR,
        Rounding::Up,
    )?;
    Ok(quote_amount)
}

pub fn get_migration_base_token(
    migration_threshold: u64,
    migration_fee_basis_points: u16,
    sqrt_migration_price: u128,
) -> Result<u64> {
    let quote_amount = get_migration_quote_amount(migration_threshold, migration_fee_basis_points)?;
    // calculate to L firstly
    let liquidity =
        get_initial_liquidity_from_delta_quote(quote_amount, MIN_SQRT_PRICE, sqrt_migration_price)?;
    // calculate base threshold
    let base_amount = get_delta_amount_base_unsigned_256(
        sqrt_migration_price,
        MAX_SQRT_PRICE,
        liquidity,
        Rounding::Up,
    )?;
    require!(base_amount <= U256::from(u64::MAX), AmmError::MathOverflow);
    let base_amount = base_amount
        .try_into()
        .map_err(|_| AmmError::TypeCastFailed)?;

    // re-validation
    #[cfg(feature = "local")]
    {
        let (_initial_base_amount, initial_quote_amount) = get_initialize_amounts(
            MIN_SQRT_PRICE,
            MAX_SQRT_PRICE,
            sqrt_migration_price,
            liquidity,
        )?;
        // TODO no need to validate for _initial_base_amount?
        msg!("debug dammv2 {} {}", initial_quote_amount, quote_amount);
        require!(
            initial_quote_amount <= quote_amount,
            AmmError::InsufficientLiquidityForMigration
        );
    }
    Ok(base_amount)
}

pub fn get_migration_threshold_price(
    migration_threshold: u64,
    sqrt_start_price: u128,
    curve: &[LiquidityDistributionParameters],
) -> Result<u128> {
    let mut next_sqrt_price = sqrt_start_price;

    let total_amount = get_delta_amount_quote_unsigned_256(
        next_sqrt_price,
        curve[0].sqrt_price,
        curve[0].liquidity,
        Rounding::Up, // TODO check whether we should use round down or round up
    )?;
    if total_amount > U256::from(migration_threshold) {
        next_sqrt_price = get_next_sqrt_price_from_input(
            next_sqrt_price,
            curve[0].liquidity,
            migration_threshold,
            false,
        )?;
    } else {
        let total_amount = total_amount
            .try_into()
            .map_err(|_| AmmError::TypeCastFailed)?;
        let mut amount_left = migration_threshold.safe_sub(total_amount)?;
        next_sqrt_price = curve[0].sqrt_price;
        for i in 1..curve.len() {
            let max_amount = get_delta_amount_quote_unsigned_256(
                next_sqrt_price,
                curve[i].sqrt_price,
                curve[i].liquidity,
                Rounding::Up, // TODO check whether we should use round down or round up
            )?;
            if max_amount > U256::from(amount_left) {
                next_sqrt_price = get_next_sqrt_price_from_input(
                    next_sqrt_price,
                    curve[i].liquidity,
                    amount_left,
                    false,
                )?;
                amount_left = 0;
                break;
            } else {
                amount_left = amount_left.safe_sub(
                    max_amount
                        .try_into()
                        .map_err(|_| AmmError::TypeCastFailed)?,
                )?;
                next_sqrt_price = curve[i].sqrt_price
            }
        }
        require!(amount_left == 0, AmmError::NotEnoughLiquidity);
    }
    Ok(next_sqrt_price)
}
