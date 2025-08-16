use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction::transfer};
use anchor_spl::token_interface::{TokenAccount, TokenInterface};
use locker::cpi::accounts::CreateVestingEscrowV2;

use crate::{
    const_pda,
    constants::seeds::BASE_LOCKER_PREFIX,
    errors::AmmError,
    events::EvtCreateLocker,
    states::{BondingCurve, Config, MigrationStatus},
};

#[event_cpi]
#[derive(Accounts)]
pub struct CreateLockerCtx<'info> {
    /// Virtual pool
    #[account(mut, has_one = config, has_one = creator, has_one = base_vault, has_one = base_mint)]
    pub curve: AccountLoader<'info, BondingCurve>,
    /// Config
    pub config: AccountLoader<'info, Config>,
    /// CHECK: curve authority
    #[account(
        mut,
        address = const_pda::curve_authority::ID,
    )]
    pub curve_authority: AccountInfo<'info>,
    /// CHECK: base_vault
    #[account(
        mut,
        token::mint = base_mint,
        token::token_program = token_program
    )]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: base token mint
    #[account(mut)]
    pub base_mint: UncheckedAccount<'info>,

    /// CHECK: base key to create locked escrow
    #[account(
        mut,
        seeds = [
            BASE_LOCKER_PREFIX.as_ref(),
            curve.key().as_ref(),
        ],
        bump,
    )]
    pub base: UncheckedAccount<'info>,
    /// CHECK: owner
    pub creator: UncheckedAccount<'info>,
    /// CHECK: escrow of locker, derived from base
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,

    /// CHECK: ATA escrow token, needs to be pre-created by the caller
    #[account(mut)]
    pub escrow_token: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: token_program
    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: Locker program
    #[account(address = locker::ID)]
    pub locker_program: UncheckedAccount<'info>,

    /// CHECK: Locker event authority
    pub locker_event_authority: UncheckedAccount<'info>,

    /// System program.
    pub system_program: Program<'info, System>,
}

/// Create a locker for the vested tokens.
pub fn handle_create_locker(ctx: Context<CreateLockerCtx>) -> Result<()> {
    let mut curve = ctx.accounts.curve.load_mut()?;

    require!(
        curve.get_migration_progress()? == MigrationStatus::PostBondingCurve,
        AmmError::NotPermitToDoThisAction
    );

    let config = ctx.accounts.config.load()?;

    let locked_vesting_params = config.locked_vesting_config.to_locked_vesting_params();

    let vesting_params =
        locked_vesting_params.to_create_vesting_escrow_params(curve.curve_finish_timestamp)?;

    let virtual_pool_key = ctx.accounts.curve.key();
    let base_seeds = base_locker_seeds!(virtual_pool_key, ctx.bumps.base);

    // Send some lamport to pool authority to pay rent fee?
    msg!("transfer lamport to pool authority");
    invoke(
        &transfer(
            &ctx.accounts.payer.key(),
            &ctx.accounts.curve_authority.key(),
            10_000_000, // TODO calculate correct lamport here
        ),
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.curve_authority.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let curve_authority_seeds = curve_authority_seeds!(const_pda::curve_authority::BUMP);
    msg!("create vesting escrow for creator");
    locker::cpi::create_vesting_escrow_v2(
        CpiContext::new_with_signer(
            ctx.accounts.locker_program.to_account_info(),
            CreateVestingEscrowV2 {
                base: ctx.accounts.base.to_account_info(), // use payer token account for base key, unique
                escrow: ctx.accounts.escrow.to_account_info(),
                escrow_token: ctx.accounts.escrow_token.to_account_info(),
                token_mint: ctx.accounts.base_mint.to_account_info(),
                sender: ctx.accounts.curve_authority.to_account_info(),
                sender_token: ctx.accounts.base_vault.to_account_info(),
                recipient: ctx.accounts.creator.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                event_authority: ctx.accounts.locker_event_authority.to_account_info(),
                program: ctx.accounts.locker_program.to_account_info(),
            },
            &[&base_seeds[..], &curve_authority_seeds[..]],
        ),
        vesting_params,
        None,
    )?;

    // set progress
    curve.set_migration_status(MigrationStatus::LockedVesting.into());

    emit_cpi!(EvtCreateLocker {
        curve: ctx.accounts.curve.key(),
        config: ctx.accounts.config.key(),
        creator: ctx.accounts.creator.key(),
        base_mint: ctx.accounts.base_mint.key(),
        escrow: ctx.accounts.escrow.key(),
        base_amount: ctx.accounts.base_vault.amount,
    });

    Ok(())
}
