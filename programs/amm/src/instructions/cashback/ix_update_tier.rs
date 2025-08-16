use anchor_lang::prelude::*;

use crate::{
    assert_eq_admin, constants::seeds::CASHBACK_PREFIX, errors::AmmError, states::CashbackAccount,
};

#[derive(Accounts)]
pub struct UpdateCashbackTier<'info> {
    /// Admin who can update tiers
    #[account(
        mut,
        constraint = assert_eq_admin(admin.key()) @ AmmError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    /// The cashback account to update
    #[account(
        mut,
        seeds = [
            CASHBACK_PREFIX.as_ref(),
            user.key().as_ref()
        ],
        bump,
    )]
    pub cashback_account: AccountLoader<'info, CashbackAccount>,

    /// The user whose tier is being updated
    /// CHECK: This is just for the PDA derivation
    pub user: AccountInfo<'info>,
}

pub fn handle_update_cashback_tier(ctx: Context<UpdateCashbackTier>, new_tier: u8) -> Result<()> {
    let mut cashback_account = ctx.accounts.cashback_account.load_mut()?;
    cashback_account.update_tier(new_tier)?;

    msg!(
        "Updated cashback tier for {} to {:?}",
        ctx.accounts.user.key(),
        new_tier
    );

    Ok(())
}
