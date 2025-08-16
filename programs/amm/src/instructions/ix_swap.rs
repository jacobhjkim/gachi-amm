use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    const_pda,
    events::{EvtCurveComplete, EvtSwap},
    params::swap::TradeDirection,
    states::{BondingCurve, CashbackAccount, Config, MigrationStatus},
    utils::{transfer_from_curve, transfer_from_user},
    AmmError,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SwapParameters {
    amount_in: u64,
    minimum_amount_out: u64,
}

#[event_cpi]
#[derive(Accounts)]
pub struct SwapCtx<'info> {
    /// CHECK: curve authority is validated by address constraint to match predefined PDA
    #[account(
        address = const_pda::curve_authority::ID,
    )]
    pub curve_authority: AccountInfo<'info>,

    /// config key
    pub config: AccountLoader<'info, Config>,

    /// bonding curve account
    #[account(mut, has_one = base_vault, has_one = quote_vault, has_one = config)]
    pub curve: AccountLoader<'info, BondingCurve>,

    /// The user token account for input token
    #[account(mut)]
    pub input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The user token account for output token
    #[account(mut)]
    pub output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for base token
    #[account(mut, token::token_program = token_base_program, token::mint = base_mint)]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for quote token
    #[account(mut, token::token_program = token_quote_program, token::mint = quote_mint)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of base token
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of quote token
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The user performing the swap
    pub payer: Signer<'info>,

    /// Token base program
    pub token_base_program: Interface<'info, TokenInterface>,

    /// Token quote program
    pub token_quote_program: Interface<'info, TokenInterface>,

    /// System program
    pub system_program: Program<'info, System>,

    /// CHECK: optional user cashback account (must be initialized, if present)
    /// This tracks user stats and tier across all tokens
    /// PDA validation is done manually in the handler
    #[account(mut)]
    pub cashback: Option<AccountLoader<'info, CashbackAccount>>,

    /// User's cashback token account for the quote token (ATA of cashback account)
    /// This holds the actual cashback tokens
    #[account(
        mut,
        token::mint = quote_mint,
        token::token_program = token_quote_program,
    )]
    pub cashback_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    /// l1 referral cashback token account for the quote token
    #[account(
        mut,
        token::mint = quote_mint,
        token::token_program = token_quote_program,
    )]
    pub l1_referral_cashback_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    /// l2 referral cashback token account for the quote token
    #[account(
        mut,
        token::mint = quote_mint,
        token::token_program = token_quote_program,
    )]
    pub l2_referral_cashback_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    /// l3 referral cashback token account for the quote token
    #[account(
        mut,
        token::mint = quote_mint,
        token::token_program = token_quote_program,
    )]
    pub l3_referral_cashback_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
}

impl<'info> SwapCtx<'info> {
    /// Get the trading direction of the current swap. Eg: USDT -> USDC
    pub fn get_trade_direction(&self) -> TradeDirection {
        if self.input_token_account.mint == self.base_mint.key() {
            return TradeDirection::BaseToQuote;
        }
        TradeDirection::QuoteToBase
    }
}

pub fn handle_swap(ctx: Context<SwapCtx>, params: SwapParameters) -> Result<()> {
    // Validate that both cashback account and token account are provided together or both are None
    require!(
        (ctx.accounts.cashback.is_some() && ctx.accounts.cashback_token_account.is_some())
            || (ctx.accounts.cashback.is_none() && ctx.accounts.cashback_token_account.is_none()),
        AmmError::InvalidCashbackTokenAccount
    );

    // Validate cashback token account is the correct ATA if both are provided
    if let (Some(ref cashback), Some(ref cashback_token_account)) =
        (&ctx.accounts.cashback, &ctx.accounts.cashback_token_account)
    {
        // Manually validate cashback account PDA
        let (expected_cashback_pda, _bump) =
            const_pda::cashback::derive_pda(&ctx.accounts.payer.key());
        require!(
            cashback.key() == expected_cashback_pda,
            AmmError::InvalidCashbackTokenAccount
        );

        let expected_cashback_ata =
            get_associated_token_address(&cashback.key(), &ctx.accounts.quote_mint.key());
        require!(
            cashback_token_account.key() == expected_cashback_ata,
            AmmError::InvalidCashbackTokenAccount
        );

        // Validate token account authority matches cashback PDA
        require!(
            cashback_token_account.owner == cashback.key(),
            AmmError::InvalidCashbackTokenAccount
        );
    }

    let trade_direction = ctx.accounts.get_trade_direction();
    // Validate input and output token accounts match the trade direction
    match trade_direction {
        TradeDirection::BaseToQuote => {
            require!(
                ctx.accounts.input_token_account.mint == ctx.accounts.base_mint.key(),
                AmmError::InvalidAccount
            );
            require!(
                ctx.accounts.output_token_account.mint == ctx.accounts.quote_mint.key(),
                AmmError::InvalidAccount
            );
        }
        TradeDirection::QuoteToBase => {
            require!(
                ctx.accounts.input_token_account.mint == ctx.accounts.quote_mint.key(),
                AmmError::InvalidAccount
            );
            require!(
                ctx.accounts.output_token_account.mint == ctx.accounts.base_mint.key(),
                AmmError::InvalidAccount
            );
        }
    }

    let SwapParameters {
        amount_in,
        minimum_amount_out,
    } = params;
    let (
        token_in_mint,
        token_out_mint,
        input_vault_account,
        output_vault_account,
        input_program,
        output_program,
    ) = match trade_direction {
        TradeDirection::BaseToQuote => (
            &ctx.accounts.base_mint,
            &ctx.accounts.quote_mint,
            &ctx.accounts.base_vault,
            &ctx.accounts.quote_vault,
            &ctx.accounts.token_base_program,
            &ctx.accounts.token_quote_program,
        ),
        TradeDirection::QuoteToBase => (
            &ctx.accounts.quote_mint,
            &ctx.accounts.base_mint,
            &ctx.accounts.quote_vault,
            &ctx.accounts.base_vault,
            &ctx.accounts.token_quote_program,
            &ctx.accounts.token_base_program,
        ),
    };
    require!(amount_in > 0, AmmError::AmountIsZero);

    let config = ctx.accounts.config.load()?;
    let mut curve = ctx.accounts.curve.load_mut()?;

    // validate if it is over threshold (aka ready for migration)
    require!(
        !curve.is_curve_complete(config.migration_quote_threshold),
        AmmError::PoolIsCompleted
    );

    // Get cashback tier if user has a cashback account
    let cashback_tier = if let Some(ref cashback_account) = ctx.accounts.cashback {
        let account = cashback_account.load()?;
        Some(account.get_tier()?)
    } else {
        None
    };

    let swap_result = curve.get_swap_result(
        &config,
        amount_in,
        trade_direction,
        ctx.accounts.l1_referral_cashback_token_account.is_some(),
        ctx.accounts.l2_referral_cashback_token_account.is_some(),
        ctx.accounts.l3_referral_cashback_token_account.is_some(),
        cashback_tier,
    )?;

    require!(
        swap_result.output_amount >= minimum_amount_out,
        AmmError::ExceededSlippage
    );

    curve.apply_swap_result(&swap_result, trade_direction)?;

    // send to reserve
    transfer_from_user(
        &ctx.accounts.payer,
        token_in_mint,
        &ctx.accounts.input_token_account,
        input_vault_account,
        input_program,
        if trade_direction == TradeDirection::QuoteToBase {
            swap_result.actual_input_amount + swap_result.trading_fee
        } else {
            amount_in
        },
    )?;

    // send to user
    transfer_from_curve(
        ctx.accounts.curve_authority.to_account_info(),
        token_out_mint,
        output_vault_account,
        &ctx.accounts.output_token_account,
        output_program,
        swap_result.output_amount,
        const_pda::curve_authority::BUMP,
    )?;

    let has_referral = ctx.accounts.l1_referral_cashback_token_account.is_some()
        || ctx.accounts.l2_referral_cashback_token_account.is_some()
        || ctx.accounts.l3_referral_cashback_token_account.is_some();
    if has_referral {
        if let Some(l1_referral_cashback_token_account) =
            ctx.accounts.l1_referral_cashback_token_account.as_ref()
        {
            transfer_from_curve(
                ctx.accounts.curve_authority.to_account_info(),
                &ctx.accounts.quote_mint,
                &ctx.accounts.quote_vault,
                l1_referral_cashback_token_account,
                &ctx.accounts.token_quote_program,
                swap_result.l1_referral_fee,
                const_pda::curve_authority::BUMP,
            )?;
        }
        if let Some(l2_referral_cashback_token_account) =
            ctx.accounts.l2_referral_cashback_token_account.as_ref()
        {
            transfer_from_curve(
                ctx.accounts.curve_authority.to_account_info(),
                &ctx.accounts.quote_mint,
                &ctx.accounts.quote_vault,
                l2_referral_cashback_token_account,
                &ctx.accounts.token_quote_program,
                swap_result.l2_referral_fee,
                const_pda::curve_authority::BUMP,
            )?;
        }
        if let Some(l3_referral_cashback_token_account) =
            ctx.accounts.l3_referral_cashback_token_account.as_ref()
        {
            transfer_from_curve(
                ctx.accounts.curve_authority.to_account_info(),
                &ctx.accounts.quote_mint,
                &ctx.accounts.quote_vault,
                l3_referral_cashback_token_account,
                &ctx.accounts.token_quote_program,
                swap_result.l3_referral_fee,
                const_pda::curve_authority::BUMP,
            )?;
        }
    }

    // Transfer cashback to user if cashback account is provided
    if let Some(ref cashback_token_account) = ctx.accounts.cashback_token_account {
        transfer_from_curve(
            ctx.accounts.curve_authority.to_account_info(),
            &ctx.accounts.quote_mint,
            &ctx.accounts.quote_vault,
            cashback_token_account,
            &ctx.accounts.token_quote_program,
            swap_result.cashback_fee,
            const_pda::curve_authority::BUMP,
        )?;
    }

    emit_cpi!(EvtSwap {
        curve: ctx.accounts.curve.key(),
        base_mint: ctx.accounts.base_mint.key(),
        trade_direction: trade_direction.into(),
        params,
        swap_result,
        has_referral,
    });

    if curve.is_curve_complete(config.migration_quote_threshold) {
        ctx.accounts.base_vault.reload()?;
        // validate if base reserve is enough token for migration
        let base_vault_balance = ctx.accounts.base_vault.amount;

        msg!("Base vault balance: {}", base_vault_balance);
        msg!("Migration base threshold: {}", config.migration_base_threshold);

        require!(
            base_vault_balance >= config.migration_base_threshold,
            AmmError::InsufficientLiquidityForMigration
        );

        // set finish time and migration progress
        let current_timestamp = Clock::get()?.unix_timestamp as u64;
        curve.curve_finish_timestamp = current_timestamp;

        let locked_vesting_params = config.locked_vesting_config.to_locked_vesting_params();
        if locked_vesting_params.has_vesting() {
            curve.set_migration_status(MigrationStatus::PostBondingCurve.into());
        } else {
            curve.set_migration_status(MigrationStatus::LockedVesting.into());
        }

        emit_cpi!(EvtCurveComplete {
            curve: ctx.accounts.curve.key(),
            config: ctx.accounts.config.key(),
            base_reserve: curve.base_reserve,
            quote_reserve: curve.quote_reserve,
        })
    }

    Ok(())
}
