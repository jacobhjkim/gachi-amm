use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction::transfer};
use anchor_spl::{
    token_2022::{set_authority, spl_token_2022::instruction::AuthorityType, SetAuthority},
    token_interface::{TokenAccount, TokenInterface},
};
use damm_v2::types::InitializePoolParameters;
use ruint::aliases::U512;
use std::u64;

use crate::{
    assert_eq_admin, const_pda,
    constants::{MAX_SQRT_PRICE, MIN_SQRT_PRICE},
    curve::{get_initial_liquidity_from_delta_base, get_initial_liquidity_from_delta_quote},
    errors::AmmError,
    events::EvtMigrateDammV2,
    safe_math::SafeMath,
    states::{BondingCurve, Config, MigrationAmount, MigrationStatus},
};

#[event_cpi]
#[derive(Accounts)]
pub struct MigrateDammV2Ctx<'info> {
    /// bonding curve
    #[account(mut, has_one = base_vault, has_one = quote_vault, has_one = config)]
    pub curve: AccountLoader<'info, BondingCurve>,

    /// bonding curve config key
    pub config: AccountLoader<'info, Config>,

    /// CHECK: curve authority
    #[account(
        mut,
        address = const_pda::curve_authority::ID,
    )]
    pub curve_authority: AccountInfo<'info>,

    /// migration authority
    #[account(
        mut,
        constraint = assert_eq_admin(migration_authority.key()) @ AmmError::Unauthorized,
    )]
    pub migration_authority: Signer<'info>,

    /// CHECK: pool
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: position nft mint for partner (must be signer for DAMM v2 initialization)
    #[account(mut, signer)]
    pub first_position_nft_mint: UncheckedAccount<'info>,

    /// CHECK: position nft account for partner
    #[account(mut)]
    pub first_position_nft_account: UncheckedAccount<'info>,

    /// CHECK:
    #[account(mut)]
    pub first_position: UncheckedAccount<'info>,

    /// CHECK: position nft mint for owner (must be signer for DAMM v2 initialization)
    #[account(mut, signer, constraint = first_position_nft_mint.key().ne(&second_position_nft_mint.key()))]
    pub second_position_nft_mint: Option<UncheckedAccount<'info>>,

    /// CHECK: position nft account for owner
    #[account(mut)]
    pub second_position_nft_account: Option<UncheckedAccount<'info>>,

    /// CHECK:
    #[account(mut)]
    pub second_position: Option<UncheckedAccount<'info>>,

    /// CHECK: damm pool authority
    pub damm_pool_authority: UncheckedAccount<'info>,

    /// CHECK:
    #[account(address = damm_v2::ID)]
    pub amm_program: UncheckedAccount<'info>,

    /// CHECK: base token mint
    #[account(mut)]
    pub base_mint: UncheckedAccount<'info>,

    /// CHECK: quote token mint
    #[account(mut)]
    pub quote_mint: UncheckedAccount<'info>,

    /// CHECK:
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,

    /// CHECK:
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,

    /// CHECK: base_vault
    #[account(
        mut,
        token::mint = base_mint,
        token::token_program = token_base_program
    )]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: quote vault
    #[account(
        mut,
        token::mint = quote_mint,
        token::token_program = token_quote_program
    )]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: token_program
    pub token_base_program: Interface<'info, TokenInterface>,
    /// CHECK: token_program
    pub token_quote_program: Interface<'info, TokenInterface>,
    /// CHECK: token_program
    pub token_2022_program: Interface<'info, TokenInterface>,
    /// CHECK: damm event authority
    pub damm_event_authority: UncheckedAccount<'info>,
    /// System program.
    pub system_program: Program<'info, System>,
    // CHECK: damm-v2 config key, use remaining accounts
    // pub damm_config: AccountLoader<'info, damm_v2::accounts::Config>,
}

impl<'info> MigrateDammV2Ctx<'info> {
    fn validate_config_key(&self, damm_config: &damm_v2::accounts::Config) -> Result<()> {
        // TODO: Uncomment this check when we have our own DAMM config
        // require!(
        //     damm_config.pool_creator_authority == self.curve_authority.key(),
        //     PoolError::InvalidConfigAccount
        // );
        require!(
            damm_config.pool_fees.partner_fee_percent == 0,
            AmmError::InvalidConfigAccount
        );

        require!(
            damm_config.sqrt_min_price == MIN_SQRT_PRICE,
            AmmError::InvalidConfigAccount
        );

        require!(
            damm_config.sqrt_max_price == MAX_SQRT_PRICE,
            AmmError::InvalidConfigAccount
        );

        require!(
            damm_config.vault_config_key == Pubkey::default(),
            AmmError::InvalidConfigAccount
        );
        Ok(())
    }

    fn create_pool(
        &self,
        pool_config: AccountInfo<'info>,
        liquidity: u128,
        sqrt_price: u128,
        bump: u8,
    ) -> Result<()> {
        let curve_authority_seeds = curve_authority_seeds!(bump);

        // Send some lamport to pool authority to pay rent fee?
        msg!("transfer lamport to curve_authority");
        invoke(
            &transfer(
                &self.migration_authority.key(),
                &self.curve_authority.key(),
                50_000_000, // TODO calculate correct lamport here
            ),
            &[
                self.migration_authority.to_account_info(),
                self.curve_authority.to_account_info(),
                self.system_program.to_account_info(),
            ],
        )?;

        msg!("initialize pool");
        damm_v2::cpi::initialize_pool(
            CpiContext::new_with_signer(
                self.amm_program.to_account_info(),
                damm_v2::cpi::accounts::InitializePool {
                    creator: self.curve_authority.to_account_info(),
                    position_nft_mint: self.first_position_nft_mint.to_account_info(),
                    position_nft_account: self.first_position_nft_account.to_account_info(),
                    payer: self.curve_authority.to_account_info(),
                    config: pool_config.to_account_info(),
                    pool_authority: self.damm_pool_authority.to_account_info(),
                    pool: self.pool.to_account_info(),
                    position: self.first_position.to_account_info(),
                    token_a_mint: self.base_mint.to_account_info(),
                    token_b_mint: self.quote_mint.to_account_info(),
                    token_a_vault: self.token_a_vault.to_account_info(),
                    token_b_vault: self.token_b_vault.to_account_info(),
                    payer_token_a: self.base_vault.to_account_info(),
                    payer_token_b: self.quote_vault.to_account_info(),
                    token_a_program: self.token_base_program.to_account_info(),
                    token_b_program: self.token_quote_program.to_account_info(),
                    token_2022_program: self.token_2022_program.to_account_info(),
                    system_program: self.system_program.to_account_info(),
                    event_authority: self.damm_event_authority.to_account_info(),
                    program: self.amm_program.to_account_info(),
                },
                &[&curve_authority_seeds[..]],
            ),
            InitializePoolParameters {
                liquidity,
                sqrt_price,
                activation_point: None,
            },
        )?;

        Ok(())
    }

    fn lock_permanent_liquidity_for_first_position(
        &self,
        permanent_lock_liquidity: u128,
        bump: u8,
    ) -> Result<()> {
        let curve_authority_seeds = curve_authority_seeds!(bump);
        msg!("lock permanent liquidity for first position");
        damm_v2::cpi::permanent_lock_position(
            CpiContext::new_with_signer(
                self.amm_program.to_account_info(),
                damm_v2::cpi::accounts::PermanentLockPosition {
                    pool: self.pool.to_account_info(),
                    position: self.first_position.to_account_info(),
                    position_nft_account: self.first_position_nft_account.to_account_info(),
                    owner: self.curve_authority.to_account_info(),
                    event_authority: self.damm_event_authority.to_account_info(),
                    program: self.amm_program.to_account_info(),
                },
                &[&curve_authority_seeds[..]],
            ),
            permanent_lock_liquidity,
        )?;
        Ok(())
    }

    fn set_authority_for_first_position(&self, new_authority: Pubkey, bump: u8) -> Result<()> {
        let curve_authority_seeds = curve_authority_seeds!(bump);
        msg!("set authority for first position");
        set_authority(
            CpiContext::new_with_signer(
                self.token_2022_program.to_account_info(),
                SetAuthority {
                    current_authority: self.curve_authority.to_account_info(),
                    account_or_mint: self.first_position_nft_account.to_account_info(),
                },
                &[&curve_authority_seeds[..]],
            ),
            AuthorityType::AccountOwner,
            Some(new_authority),
        )?;
        Ok(())
    }
}

pub fn handle_migrate_damm_v2<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, MigrateDammV2Ctx<'info>>,
) -> Result<()> {
    let config = ctx.accounts.config.load()?;
    {
        require!(
            ctx.remaining_accounts.len() == 1,
            AmmError::MissingPoolConfigInRemainingAccount
        );
        let damm_config_loader: AccountLoader<'_, damm_v2::accounts::Config> =
            AccountLoader::try_from(&ctx.remaining_accounts[0])?; // TODO fix damm config in remaining accounts
        let damm_config = damm_config_loader.load()?;
        ctx.accounts.validate_config_key(&damm_config)?;
    }

    let mut curve = ctx.accounts.curve.load_mut()?;

    require!(
        curve.get_migration_progress()? == MigrationStatus::LockedVesting,
        AmmError::NotPermitToDoThisAction
    );

    require!(
        curve.is_curve_complete(config.migration_quote_threshold),
        AmmError::PoolIsIncompleted
    );

    let initial_quote_vault_amount = ctx.accounts.quote_vault.amount;
    let initial_base_vault_amount = ctx.accounts.base_vault.amount;
    let migration_sqrt_price = config.migration_sqrt_price;

    let MigrationAmount { quote_amount, .. } = config.get_migration_quote_amount()?;

    // calculate initial liquidity
    let initial_liquidity = get_liquidity_for_adding_liquidity(
        initial_base_vault_amount,
        quote_amount,
        migration_sqrt_price,
    )?;

    // create pool
    msg!("create pool");
    ctx.accounts.create_pool(
        ctx.remaining_accounts[0].clone(),
        initial_liquidity,
        config.migration_sqrt_price,
        const_pda::curve_authority::BUMP,
    )?;
    // lock permanent liquidity
    msg!("lock permanent liquidity for first position");
    ctx.accounts.lock_permanent_liquidity_for_first_position(
        initial_liquidity,
        const_pda::curve_authority::BUMP,
    )?;

    msg!("transfer ownership of the first position");
    ctx.accounts.set_authority_for_first_position(
        ctx.accounts.migration_authority.key(),
        const_pda::curve_authority::BUMP,
    )?;

    // reload quote reserve and base reserve
    ctx.accounts.quote_vault.reload()?;
    ctx.accounts.base_vault.reload()?;
    let deposited_base_amount =
        initial_base_vault_amount.safe_sub(ctx.accounts.base_vault.amount)?;
    let deposited_quote_amount =
        initial_quote_vault_amount.safe_sub(ctx.accounts.quote_vault.amount)?;

    let updated_excluded_fee_base_reserve =
        initial_base_vault_amount.safe_sub(deposited_base_amount)?;
    let updated_quote_threshold = quote_amount.safe_sub(deposited_quote_amount)?;

    curve.update_after_migration();

    // burn the rest of token in pool authority after migrated amount and fee
    ctx.accounts.base_vault.reload()?;

    curve.set_migration_status(MigrationStatus::CreatedPool.into());

    emit_cpi!(EvtMigrateDammV2 {
        curve: ctx.accounts.curve.key(),
        config: ctx.accounts.config.key(),
        pool: ctx.accounts.pool.key(),
        base_mint: ctx.accounts.base_mint.key(),
        quote_mint: ctx.accounts.quote_mint.key(),
        deposited_base_amount,
        deposited_quote_amount,
        initial_liquidity,
        sqrt_price: config.migration_sqrt_price,
    });

    Ok(())
}

fn get_liquidity_for_adding_liquidity(
    base_amount: u64,
    quote_amount: u64,
    sqrt_price: u128,
) -> Result<u128> {
    let liquidity_from_base =
        get_initial_liquidity_from_delta_base(base_amount, MAX_SQRT_PRICE, sqrt_price)?;
    let liquidity_from_quote =
        get_initial_liquidity_from_delta_quote(quote_amount, MIN_SQRT_PRICE, sqrt_price)?;
    if liquidity_from_base > U512::from(liquidity_from_quote) {
        Ok(liquidity_from_quote)
    } else {
        Ok(liquidity_from_base
            .try_into()
            .map_err(|_| AmmError::TypeCastFailed)?)
    }
}
