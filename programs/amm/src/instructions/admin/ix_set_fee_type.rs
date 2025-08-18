use anchor_lang::prelude::*;

use crate::{
    assert_eq_fee_type_admin,
    errors::AmmError,
    events::EvtSetFeeType,
    states::{BondingCurve, Config},
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

pub fn handle_set_fee_type(ctx: Context<SetFeeTypeCtx>, new_fee_type: u8) -> Result<()> {
    let curve = &mut ctx.accounts.curve.load_mut()?;
    let config = &ctx.accounts.config.load()?;

    // Check if the fee type is valid
    require!(new_fee_type <= 2, AmmError::InvalidFeeType);

    require!(curve.fee_type != new_fee_type, AmmError::FeeTypeAlreadySet);

    // Set the fee type
    if curve.fee_type == 0 && new_fee_type == 1 {
        curve.fee_type_update_from_creator_to_meme(
            config.creator_fee_basis_points,
            config.meme_fee_basis_points,
        )?;
        emit_cpi!(EvtSetFeeType {
            curve: ctx.accounts.curve.key(),
            base_mint: curve.base_mint.key(),
            old_fee_type: 0,
            new_fee_type: 1,
        });
    } else if curve.fee_type == 1 && new_fee_type == 0 {
        curve.fee_type_update_from_meme_to_creator()?;
        emit_cpi!(EvtSetFeeType {
            curve: ctx.accounts.curve.key(),
            base_mint: curve.base_mint.key(),
            old_fee_type: 1,
            new_fee_type: 0,
        });
    } else if new_fee_type == 2 {
        emit_cpi!(EvtSetFeeType {
            curve: ctx.accounts.curve.key(),
            base_mint: curve.base_mint.key(),
            old_fee_type: curve.fee_type,
            new_fee_type: 2,
        });
        curve.fee_type_update_to_blocked()?;
    }

    // TODO: we do not allow
    Ok(())
}
