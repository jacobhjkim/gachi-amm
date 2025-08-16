use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        transfer_checked, Mint as MintInterface, TokenAccount as TokenAccountInterface,
        TokenInterface, TransferChecked,
    },
};

use crate::{
    assert_eq_admin,
    constants::{cashback::CASHBACK_INACTIVE_PERIOD, seeds::CASHBACK_PREFIX},
    errors::AmmError,
    states::CashbackAccount,
};

#[derive(Accounts)]
pub struct ReclaimInactiveCashback<'info> {
    /// Address to be set as global authority.
    #[account(
        mut,
        constraint = assert_eq_admin(global_authority.key()) @ AmmError::Unauthorized,
    )]
    pub global_authority: Signer<'info>,

    /// The inactive user's wallet address
    /// CHECK: We only need this for PDA derivation
    pub inactive_user: AccountInfo<'info>,

    /// The inactive user's cashback account
    #[account(
        mut,
        seeds = [
            CASHBACK_PREFIX.as_ref(),
            inactive_user.key().as_ref()
        ],
        bump,
    )]
    pub cashback_account: AccountLoader<'info, CashbackAccount>,

    /// WSOL mint
    pub wsol_mint: InterfaceAccount<'info, MintInterface>,

    /// WSOL vault for the cashback account (ATA)
    #[account(
        mut,
        associated_token::mint = wsol_mint,
        associated_token::authority = cashback_account,
        associated_token::token_program = token_program,
    )]
    pub wsol_vault: InterfaceAccount<'info, TokenAccountInterface>,

    /// The protocol fee recipient's WSOL token account
    #[account(
        mut,
        token::mint = wsol_mint,
    )]
    pub fee_recipient_wsol_account: InterfaceAccount<'info, TokenAccountInterface>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// reclaim unclaimed cashback from an inactive account
pub fn handle_reclaim_cashback(ctx: Context<ReclaimInactiveCashback>) -> Result<()> {
    let cashback_account = ctx.accounts.cashback_account.load()?;
    let current_timestamp = Clock::get()?.unix_timestamp;

    // Check if account has been inactive for more than a year
    let time_since_last_claim = current_timestamp - cashback_account.last_claim_timestamp;
    require!(
        time_since_last_claim >= CASHBACK_INACTIVE_PERIOD,
        AmmError::AccountNotInactive
    );

    // Get reclaimable amount from WSOL vault
    let wsol_reclaimable = ctx.accounts.wsol_vault.amount;

    require!(wsol_reclaimable > 0, AmmError::NoCashbackToClaim);

    // Transfer WSOL to protocol fee recipient
    let cashback_bump = ctx.bumps.cashback_account;
    let inactive_user_key = ctx.accounts.inactive_user.key();
    let signer_seeds = &[
        CASHBACK_PREFIX.as_ref(),
        inactive_user_key.as_ref(),
        &[cashback_bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.wsol_vault.to_account_info(),
                to: ctx.accounts.fee_recipient_wsol_account.to_account_info(),
                authority: ctx.accounts.cashback_account.to_account_info(),
                mint: ctx.accounts.wsol_mint.to_account_info(),
            },
            &[signer_seeds],
        ),
        wsol_reclaimable,
        ctx.accounts.wsol_mint.decimals,
    )?;

    msg!("Reclaimed {} WSOL from inactive account", wsol_reclaimable);

    Ok(())
}
