use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        Mint as MintInterface, TokenAccount as TokenAccountInterface, TokenInterface,
    },
};

use crate::{constants::seeds::CASHBACK_PREFIX, states::CashbackAccount, events::EvtCreateCashback};

#[event_cpi]
#[derive(Accounts)]
pub struct CreateCashback<'info> {
    /// Address paying for the cashback account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The cashback account PDA
    /// This tracks user stats and tier across all tokens
    #[account(
        init,
        payer = payer,
        space = 8 + CashbackAccount::INIT_SPACE,
        seeds = [
            CASHBACK_PREFIX.as_ref(),
            payer.key().as_ref()
        ],
        bump,
    )]
    pub cashback_account: AccountLoader<'info, CashbackAccount>,

    /// WSOL mint
    pub wsol_mint: InterfaceAccount<'info, MintInterface>,

    /// WSOL vault for the cashback account (ATA)
    #[account(
        init,
        payer = payer,
        associated_token::mint = wsol_mint,
        associated_token::authority = cashback_account,
        associated_token::token_program = token_program,
    )]
    pub wsol_vault: InterfaceAccount<'info, TokenAccountInterface>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_cashback(ctx: Context<CreateCashback>) -> Result<()> {
    let mut cashback_account = ctx.accounts.cashback_account.load_init()?;
    cashback_account.init(ctx.accounts.payer.key())?;

    emit_cpi!(EvtCreateCashback {
        owner: ctx.accounts.payer.key(),
        tier: cashback_account.current_tier,
    });

    Ok(())
}
