use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        Mint as MintInterface, TokenAccount as TokenAccountInterface, TokenInterface,
    },
};

use crate::{
    assert_eq_admin,
    constants::{cashback::CASHBACK_CHAMPION_BPS, fee::MAX_FEE_BASIS_POINTS},
    errors::AmmError,
    safe_math::SafeMath,
    states::{Config, TokenType},
    utils::{get_token_program_flags, is_supported_quote_mint},
};

#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct ConfigParameters {
    /* Token configurations */
    /// token type (0 | 1), 0: SPL Token, 1: Token2022
    pub base_token_flag: u8,
    /// token decimal, (6 | 9)
    pub base_decimal: u8,

    /* Fee configurations */
    /// Trading fee in bps
    pub fee_basis_points: u16,
    /// Level 1 referral fee in bps
    pub l1_referral_fee_basis_points: u16,
    /// Level 2 referral fee in bps
    pub l2_referral_fee_basis_points: u16,
    /// Level 3 referral fee in bps
    pub l3_referral_fee_basis_points: u16,
    /// Referee discount in bps
    pub referee_discount_basis_points: u16,
    /// creator/project fee in bps
    pub creator_fee_basis_points: u16,
    /// meme/community fee in bps
    pub meme_fee_basis_points: u16,
    /// migration fee in bps (quote token fee)
    pub migration_fee_basis_points: u16,

    /* Price configurations */
    /// migration base threshold (the amount of token to migrate)
    pub migration_base_threshold: u64,
    /// migration quote threshold
    pub migration_quote_threshold: u64,
    /// initial virtual quote reserve to boost the initial liquidity
    pub initial_virtual_quote_reserve: u64,
    /// initial virtual base reserve to boost the initial liquidity
    pub initial_virtual_base_reserve: u64,
}

impl ConfigParameters {
    pub fn validate<'info>(
        &self,
        quote_mint: &InterfaceAccount<'info, MintInterface>,
    ) -> Result<()> {
        // validate quote mint
        require!(
            is_supported_quote_mint(quote_mint)?,
            AmmError::InvalidQuoteMint
        );

        // validate token type
        TokenType::try_from(self.base_token_flag).map_err(|_| AmmError::InvalidTokenType)?;

        // validate token decimals
        require!(
            self.base_decimal >= 6 && self.base_decimal <= 9,
            AmmError::InvalidTokenDecimals
        );

        let other_fee_basis_points_sum = self
            .l1_referral_fee_basis_points
            .safe_add(self.l2_referral_fee_basis_points)?
            .safe_add(self.l3_referral_fee_basis_points)?
            .safe_add(self.creator_fee_basis_points)?
            .safe_add(CASHBACK_CHAMPION_BPS)?; // assume max cashback fee bps
        require!(
            self.fee_basis_points > other_fee_basis_points_sum,
            AmmError::InvalidFeeBasisPoints
        );

        // validate referral fee hierarchy
        require!(
            self.l1_referral_fee_basis_points > self.l2_referral_fee_basis_points,
            AmmError::InvalidAmmConfig
        );
        require!(
            self.l2_referral_fee_basis_points > self.l3_referral_fee_basis_points,
            AmmError::InvalidAmmConfig
        );

        // validate creator trading fee percentage
        require!(
            self.creator_fee_basis_points <= 1000,
            AmmError::InvalidCreatorTradingFeePercentage
        );

        // fee basis points configurations
        require!(
            self.fee_basis_points <= MAX_FEE_BASIS_POINTS,
            AmmError::InvalidAmmConfig
        );

        require!(
            self.initial_virtual_quote_reserve > 0
                && self.initial_virtual_base_reserve > 0
                && self.migration_base_threshold > 0,
            AmmError::InvalidAmmConfig
        );

        Ok(())
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateConfigCtx<'info> {
    /// Initialize config state account to store protocol owner address and fee rates.
    #[account(
        init,
        signer,
        payer = payer,
        space = 8 + Config::INIT_SPACE,
    )]
    pub config: AccountLoader<'info, Config>,

    /// CHECK: fee_claimer
    /// fee claimer, doesn't have to be a signer
    pub fee_claimer: UncheckedAccount<'info>,

    /// fee claimer token account
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = fee_claimer,
        associated_token::token_program = token_program,
    )]
    pub fee_claimer_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    /// quote mint
    pub quote_mint: Box<InterfaceAccount<'info, MintInterface>>,

    /// only admin can create config
    #[account(
        mut,
        constraint = assert_eq_admin(payer.key()) @ AmmError::Unauthorized,
    )]
    pub payer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_config(
    ctx: Context<CreateConfigCtx>,
    config_params: ConfigParameters,
) -> Result<()> {
    config_params.validate(&ctx.accounts.quote_mint)?;

    let mut config = ctx.accounts.config.load_init()?;
    config.init(
        &ctx.accounts.quote_mint.key(),
        &ctx.accounts.fee_claimer.key(),
        /* Token configurations */
        config_params.base_token_flag,
        get_token_program_flags(&ctx.accounts.quote_mint).into(),
        config_params.base_decimal,
        ctx.accounts.quote_mint.decimals,
        /* Fee configurations */
        config_params.fee_basis_points,
        config_params.l1_referral_fee_basis_points,
        config_params.l2_referral_fee_basis_points,
        config_params.l3_referral_fee_basis_points,
        config_params.referee_discount_basis_points,
        config_params.creator_fee_basis_points,
        config_params.migration_fee_basis_points,
        /* Price configurations */
        config_params.migration_base_threshold,
        config_params.migration_quote_threshold,
        config_params.initial_virtual_quote_reserve,
        config_params.initial_virtual_base_reserve,
    );
    emit_cpi!(config.event(ctx.accounts.config.key()));
    Ok(())
}
