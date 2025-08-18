use crate::AmmError;
use anchor_lang::prelude::*;
use rust_decimal::prelude::*;
use rust_decimal::Decimal;

/// Calculate sqrt price from base and quote amounts
/// Exact implementation following TypeScript getSqrtPriceFromPrice
pub fn get_sqrt_price_from_amounts(base_amount: u128, quote_amount: u128) -> Result<u128> {
    require!(base_amount > 0, AmmError::AmountIsZero);

    // Convert amounts to Decimal for exact calculation
    let migration_quote_amount =
        Decimal::from_u128(quote_amount).ok_or(AmmError::TypeCastFailed)?;
    let migration_base_amount = Decimal::from_u128(base_amount).ok_or(AmmError::TypeCastFailed)?;

    let migration_price = migration_quote_amount / migration_base_amount;
    let sqrt_value = migration_price.sqrt().ok_or(AmmError::MathOverflow)?;
    let two_pow_64 = Decimal::from_u128(1u128 << 64).ok_or(AmmError::TypeCastFailed)?;
    let sqrt_value_q64 = sqrt_value * two_pow_64;
    let result = sqrt_value_q64.floor();
    result.to_u128().ok_or(AmmError::TypeCastFailed.into())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct CpiPoolArgs {
    token_a_amount: u64,
    token_b_amount: u64,
}

pub fn get_pool_create_ix_data(amount_a: u64, amount_b: u64) -> Vec<u8> {
    let hash = get_function_hash(
        "global",
        "initialize_permissionless_constant_product_pool_with_config",
    );
    let mut buf: Vec<u8> = vec![];
    buf.extend_from_slice(&hash);
    let args = CpiPoolArgs {
        token_a_amount: amount_a,
        token_b_amount: amount_b,
    };

    args.serialize(&mut buf).unwrap();
    buf
}

pub fn get_function_hash(namespace: &str, name: &str) -> [u8; 8] {
    let preimage = format!("{}:{}", namespace, name);
    let mut sighash = [0u8; 8];
    sighash.copy_from_slice(
        &anchor_lang::solana_program::hash::hash(preimage.as_bytes()).to_bytes()[..8],
    );
    sighash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_sqrt_price_from_amounts_matches_ts() {
        let migration_quote_amount = 87_031_082_529;
        let migration_base_amount: u128 = 200_000_000_000_000;

        // Calculate sqrt price
        let sqrt_price =
            get_sqrt_price_from_amounts(migration_base_amount, migration_quote_amount).unwrap();

        // Expected value from running the TS code (verified with bun run tests/utils/price.ts)
        let expected_sqrt_price: u128 = 384806072968317737;

        assert_eq!(
            sqrt_price, expected_sqrt_price,
            "Sqrt price mismatch. Got: {}, Expected: {}",
            sqrt_price, expected_sqrt_price
        );
    }
}
