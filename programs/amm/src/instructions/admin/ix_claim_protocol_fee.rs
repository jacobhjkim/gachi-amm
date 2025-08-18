use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    const_pda,
    errors::AmmError,
    events::EvtClaimTradingFee,
    states::{BondingCurve, Config, MigrationStatus},
    utils::token::transfer_from_curve,
};

/// Accounts for protocol admin to claim fees
#[event_cpi]
#[derive(Accounts)]
pub struct ClaimProtocolFeeCtx<'info> {
    /// CHECK: curve authority
    #[account(
        address = const_pda::curve_authority::ID
    )]
    pub curve_authority: UncheckedAccount<'info>,

    #[account(has_one=quote_mint, has_one=fee_claimer)]
    pub config: AccountLoader<'info, Config>,

    #[account(
        mut,
        has_one = quote_vault,
        has_one = config,
    )]
    pub curve: AccountLoader<'info, BondingCurve>,

    /// Fee claimer's token account to receive the claimed fees
    #[account(
        init_if_needed,
        payer = fee_claimer,
        associated_token::mint = quote_mint,
        associated_token::authority = fee_claimer,
        associated_token::token_program = token_quote_program,
    )]
    pub fee_claimer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for output token
    #[account(mut, token::token_program = token_quote_program, token::mint = quote_mint)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of quote token
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The fee claimer
    #[account(mut)]
    pub fee_claimer: Signer<'info>,

    /// Quote token program
    pub token_quote_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_protocol_fee(ctx: Context<ClaimProtocolFeeCtx>) -> Result<()> {
    let mut curve = ctx.accounts.curve.load_mut()?;

    // Check if migration is complete
    let migration_status = curve.get_migration_progress()?;

    let quote_token_claim_amount = if migration_status == MigrationStatus::CreatedPool {
        // If migration is complete, claim all remaining tokens in quote vault
        // Also clear the protocol_fee to avoid confusion
        curve.claim_protocol_fee();
        ctx.accounts.quote_vault.amount
    } else {
        // Normal protocol fee claim
        curve.claim_protocol_fee()
    };

    require!(quote_token_claim_amount > 0, AmmError::NothingToClaim);

    transfer_from_curve(
        ctx.accounts.curve_authority.to_account_info(),
        &ctx.accounts.quote_mint,
        &ctx.accounts.quote_vault,
        &ctx.accounts.fee_claimer_token_account,
        &ctx.accounts.token_quote_program,
        quote_token_claim_amount,
        const_pda::curve_authority::BUMP,
    )?;

    emit_cpi!(EvtClaimTradingFee {
        curve: ctx.accounts.curve.key(),
        quote_token_claim_amount,
    });

    Ok(())
}
