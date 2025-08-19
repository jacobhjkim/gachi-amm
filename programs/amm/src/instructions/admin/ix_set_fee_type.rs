use anchor_lang::prelude::*;

use crate::{
    assert_eq_fee_type_admin,
    errors::AmmError,
    events::EvtSetFeeType,
    states::{BondingCurve, Config, FeeType},
};

/// Accounts for admin to review fee type
#[event_cpi]
#[derive(Accounts)]
pub struct SetFeeTypeCtx<'info> {
    /// admin who can set the fee type of the bonding curve
    #[account(
        constraint = assert_eq_fee_type_admin(payer.key()) @ AmmError::Unauthorized,
    )]
    pub payer: Signer<'info>,

    /// bonding curve config key
    pub config: AccountLoader<'info, Config>,

    /// bonding curve
    #[account(mut, has_one = config)]
    pub curve: AccountLoader<'info, BondingCurve>,
}

pub fn handle_set_fee_type(ctx: Context<SetFeeTypeCtx>, new_fee_type_raw: u8) -> Result<()> {
    let curve = &mut ctx.accounts.curve.load_mut()?;
    let config = &ctx.accounts.config.load()?;

    let new_fee_type = FeeType::try_from(new_fee_type_raw).map_err(|_| AmmError::InvalidFeeType)?;

    let current_fee_type = curve.get_fee_type()?;
    require!(
        current_fee_type != new_fee_type,
        AmmError::FeeTypeAlreadySet
    );

    // Set the fee type
    match (current_fee_type, new_fee_type) {
        (FeeType::Creator, FeeType::Meme) => {
            curve.fee_type_update_from_creator_to_meme(
                config.creator_fee_basis_points,
                config.meme_fee_basis_points,
            )?;
            emit_cpi!(EvtSetFeeType {
                curve: ctx.accounts.curve.key(),
                base_mint: curve.base_mint.key(),
                old_fee_type: FeeType::Creator as u8,
                new_fee_type: FeeType::Meme as u8,
            });
        }
        (FeeType::Meme, FeeType::Creator) => {
            curve.fee_type_update_from_meme_to_creator()?;
            emit_cpi!(EvtSetFeeType {
                curve: ctx.accounts.curve.key(),
                base_mint: curve.base_mint.key(),
                old_fee_type: FeeType::Meme as u8,
                new_fee_type: FeeType::Creator as u8,
            });
        }
        (_, FeeType::Blocked) => {
            emit_cpi!(EvtSetFeeType {
                curve: ctx.accounts.curve.key(),
                base_mint: curve.base_mint.key(),
                old_fee_type: current_fee_type as u8,
                new_fee_type: FeeType::Blocked as u8,
            });
            curve.fee_type_update_to_blocked()?;
        }
        _ => {
            return Err(AmmError::InvalidFeeType.into());
        }
    }

    Ok(())
}
