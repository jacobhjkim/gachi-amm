use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    const_pda, errors::AmmError, events::EvtClaimCreatorTradingFee, states::BondingCurve,
    utils::token::transfer_from_curve,
};

/// Accounts for creator to claim trading fees
#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCreatorFeeCtx<'info> {
    /// CHECK: curve authority
    #[account(
        address = const_pda::curve_authority::ID
    )]
    pub curve_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = quote_vault,
        has_one = creator,
    )]
    pub curve: AccountLoader<'info, BondingCurve>,

    /// Creator's token account to receive the claimed fees
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_quote_program,
    )]
    pub creator_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for output token
    #[account(mut, token::token_program = token_quote_program, token::mint = quote_mint)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of quote token
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// Token quote program
    pub token_quote_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_creator_fee(ctx: Context<ClaimCreatorFeeCtx>) -> Result<()> {
    let mut curve = ctx.accounts.curve.load_mut()?;
    let quote_token_claim_amount = curve.claim_creator_fee();

    require!(quote_token_claim_amount > 0, AmmError::NothingToClaim);

    transfer_from_curve(
        ctx.accounts.curve_authority.to_account_info(),
        &ctx.accounts.quote_mint,
        &ctx.accounts.quote_vault,
        &ctx.accounts.creator_token_account,
        &ctx.accounts.token_quote_program,
        quote_token_claim_amount,
        const_pda::curve_authority::BUMP,
    )?;

    emit!(EvtClaimCreatorTradingFee {
        curve: ctx.accounts.curve.key(),
        creator: ctx.accounts.creator.key(),
        quote_token_claim_amount,
    });

    Ok(())
}
