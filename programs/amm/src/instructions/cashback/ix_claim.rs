use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        transfer_checked, Mint as MintInterface, TokenAccount as TokenAccountInterface,
        TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::{cashback::CASHBACK_CLAIM_COOLDOWN, seeds::CASHBACK_PREFIX},
    errors::AmmError,
    states::CashbackAccount,
};
use crate::events::EvtClaimCashback;

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCashback<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            CASHBACK_PREFIX.as_ref(),
            user.key().as_ref()
        ],
        bump,
        constraint = cashback_account.load()?.owner == user.key() @ AmmError::Unauthorized
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

    /// User's WSOL token account to receive the cashback
    #[account(
        mut,
        token::mint = wsol_mint,
        token::authority = user,
    )]
    pub user_wsol_account: InterfaceAccount<'info, TokenAccountInterface>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_cashback(ctx: Context<ClaimCashback>) -> Result<()> {
    let mut cashback_account = ctx.accounts.cashback_account.load_mut()?;
    let current_timestamp = Clock::get()?.unix_timestamp;
    let time_since_last_claim = current_timestamp - cashback_account.last_claim_timestamp;

    require!(
        time_since_last_claim >= CASHBACK_CLAIM_COOLDOWN,
        AmmError::ClaimCooldownNotMet
    );

    // Get claimable amounts from both vaults
    let wsol_claimable = ctx.accounts.wsol_vault.amount;

    require!(wsol_claimable > 0, AmmError::NoCashbackToClaim);

    // Get the bump for cashback account PDA
    let cashback_bump = ctx.bumps.cashback_account;
    let user_key = ctx.accounts.user.key();
    let signer_seeds = &[
        CASHBACK_PREFIX.as_ref(),
        user_key.as_ref(),
        &[cashback_bump],
    ];

    // Transfer WSOL if available
    if wsol_claimable > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.wsol_vault.to_account_info(),
                    to: ctx.accounts.user_wsol_account.to_account_info(),
                    authority: ctx.accounts.cashback_account.to_account_info(),
                    mint: ctx.accounts.wsol_mint.to_account_info(),
                },
                &[signer_seeds],
            ),
            wsol_claimable,
            ctx.accounts.wsol_mint.decimals,
        )?;
        msg!("Claimed {} WSOL cashback", wsol_claimable);
    }

    // Update last claim timestamp
    cashback_account.update_claim_timestamp()?;

    emit_cpi!(EvtClaimCashback {
        owner: user_key,
        wsol_claim_amount: wsol_claimable,
    });

    Ok(())
}
