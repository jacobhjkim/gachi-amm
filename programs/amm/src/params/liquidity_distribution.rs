use crate::AmmError;
use anchor_lang::prelude::*;
use ruint::aliases::U256;

/// Calculate sqrt price from price
/// Based on the formula: price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
/// Therefore: sqrtPrice = sqrt(price / 10^(tokenADecimal - tokenBDecimal)) << 64
fn get_sqrt_price_from_price(
    price: U256, // price = quote_amount / base_amount
    base_decimal: u8,
    quote_decimal: u8,
) -> Result<u128> {
    // Adjust for decimal difference
    let decimal_diff = (base_decimal as i32) - (quote_decimal as i32);
    let price_adjusted = if decimal_diff > 0 {
        // base has more decimals than quote, divide by 10^diff
        price
            .checked_div(U256::from(10u128.pow(decimal_diff as u32)))
            .ok_or(AmmError::MathOverflow)?
    } else if decimal_diff < 0 {
        // quote has more decimals than base, multiply by 10^abs(diff)
        price
            .checked_mul(U256::from(10u128.pow((-decimal_diff) as u32)))
            .ok_or(AmmError::MathOverflow)?
    } else {
        price
    };

    // Calculate sqrt
    let sqrt_price = sqrt_u256(price_adjusted)?;

    // Scale by 2^64
    let sqrt_price_q64 = sqrt_price
        .checked_mul(U256::from(1u128 << 64))
        .ok_or(AmmError::MathOverflow)?;

    // Ensure the result fits in u128
    sqrt_price_q64
        .try_into()
        .map_err(|_| AmmError::TypeCastFailed.into())
}

/// Calculate sqrt price from base and quote amounts
pub fn get_sqrt_price_from_amounts(
    base_amount: u128,
    quote_amount: u128,
    base_decimal: u8,
    quote_decimal: u8,
) -> Result<u128> {
    require!(base_amount > 0, AmmError::AmountIsZero);

    // Calculate price with high precision
    // price = quote_amount / base_amount
    // Scale up to maintain precision
    let scale = U256::from(10u128.pow(18));
    let price_scaled = U256::from(quote_amount)
        .checked_mul(scale)
        .ok_or(AmmError::MathOverflow)?
        .checked_div(U256::from(base_amount))
        .ok_or(AmmError::MathOverflow)?;

    get_sqrt_price_from_price(price_scaled, base_decimal, quote_decimal)
}

/// Calculate square root of U256 using Newton's method
fn sqrt_u256(value: U256) -> Result<U256> {
    if value == U256::ZERO {
        return Ok(U256::ZERO);
    }

    // Initial guess: use bit length to get a better starting point
    let mut x = U256::from(1u128);
    let bits = value.bit_len();
    if bits > 1 {
        x = x << ((bits - 1) / 2);
    }

    // Newton's method: x_new = (x + value/x) / 2
    let mut prev_x;
    let max_iterations = 255;
    let mut iterations = 0;

    loop {
        prev_x = x;
        let div_result = value.checked_div(x).ok_or(AmmError::MathOverflow)?;
        x = (x + div_result) >> 1;

        iterations += 1;
        if x == prev_x || iterations >= max_iterations {
            break;
        }
    }

    // Ensure we converged
    require!(iterations < max_iterations, AmmError::MathOverflow);

    Ok(x)
}
