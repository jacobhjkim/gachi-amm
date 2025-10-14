use {
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{Mint, MintTo, Token, TokenAccount},
        token_2022::spl_token_2022::instruction::AuthorityType,
        token_interface::{
            Mint as MintInterface, TokenAccount as TokenAccountInterface, TokenInterface,
        },
    },
    std::cmp::{max, min},
};

use crate::{
    const_pda,
    constants::{
        seeds::{CURVE_PREFIX, TOKEN_VAULT_PREFIX},
        MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH, MAX_URI_LENGTH, TOKEN_TOTAL_SUPPLY,
    },
    errors::AmmError,
    states::{BondingCurve, Config, CurveType, TokenType},
    utils::{process_create_token_metadata, ProcessCreateTokenMetadataParams},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateCurveParams {
    /// Name of the token to be created
    pub name: String,
    /// Symbol (ticker) of the token to be created
    pub symbol: String,
    /// URI for the token metadata
    pub uri: String,
}

impl CreateCurveParams {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.name.len() <= MAX_NAME_LENGTH && !self.name.is_empty(),
            AmmError::InvalidTokenName
        );
        require!(
            self.symbol.len() <= MAX_SYMBOL_LENGTH && !self.symbol.is_empty(),
            AmmError::InvalidTokenSymbol
        );
        require!(
            self.uri.len() <= MAX_URI_LENGTH && !self.uri.is_empty(),
            AmmError::InvalidTokenUri
        );
        Ok(())
    }
}

// To fix IDL generation: https://github.com/coral-xyz/anchor/issues/3209
pub fn max_key(left: &Pubkey, right: &Pubkey) -> [u8; 32] {
    max(left, right).to_bytes()
}

pub fn min_key(left: &Pubkey, right: &Pubkey) -> [u8; 32] {
    min(left, right).to_bytes()
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateCurveCtx<'info> {
    /// Address paying for the bonding curve creation
    #[account(mut)]
    pub creator: Signer<'info>,

    /// config the boding curve belongs to
    pub config: AccountLoader<'info, Config>,

    /// CHECK: curve authority
    #[account(
        address = const_pda::curve_authority::ID
    )]
    pub curve_authority: AccountInfo<'info>,

    #[account(
        init,
        signer,
        payer = creator,
        mint::decimals = config.load()?.base_decimal,
        mint::authority = curve_authority,
        mint::token_program = token_program,
    )]
    pub base_mint: Box<Account<'info, Mint>>,

    #[account(
        mint::token_program = token_quote_program,
    )]
    pub quote_mint: Box<InterfaceAccount<'info, MintInterface>>,

    /// Bonding curve PDA
    #[account(
        init,
        payer = creator,
        seeds = [
            CURVE_PREFIX.as_ref(),
            config.key().as_ref(),
            &max_key(&base_mint.key(), &quote_mint.key()),
            &min_key(&base_mint.key(), &quote_mint.key()),
        ],
        bump,
        space = 8 + BondingCurve::INIT_SPACE,
    )]
    pub curve: AccountLoader<'info, BondingCurve>,

    /// Base token vault for the curve
    #[account(
        init,
        seeds = [
            TOKEN_VAULT_PREFIX.as_ref(),
            base_mint.key().as_ref(),
            curve.key().as_ref(),
        ],
        token::mint = base_mint,
        token::authority = curve_authority,
        token::token_program = token_program,
        payer = creator,
        bump,
    )]
    pub base_vault: Box<Account<'info, TokenAccount>>,

    /// Quote token vault for the curve
    #[account(
        init,
        seeds = [
            TOKEN_VAULT_PREFIX.as_ref(),
            quote_mint.key().as_ref(),
            curve.key().as_ref(),
        ],
        token::mint = quote_mint,
        token::authority = curve_authority,
        token::token_program = token_quote_program,
        payer = creator,
        bump,
    )]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccountInterface>>,

    /// CHECK: Metadata account PDA
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Metadata program
    #[account(address = mpl_token_metadata::ID)]
    pub metadata_program: UncheckedAccount<'info>,

    /// Program to create mint account and mint tokens
    pub token_quote_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_curve_spl_token(
    ctx: Context<CreateCurveCtx>,
    params: CreateCurveParams,
) -> Result<()> {
    let config = ctx.accounts.config.load()?;
    let initial_base_supply = TOKEN_TOTAL_SUPPLY;

    let token_type =
        TokenType::try_from(config.base_token_flag).map_err(|_| AmmError::InvalidTokenType)?;
    require!(
        token_type == TokenType::SplToken,
        AmmError::InvalidTokenType
    );

    // Validate input parameters
    params.validate()?;

    // don't run this yet
    // Validate vanity address ends with "kfun"
    // let mint_key = ctx.accounts.mint.key();
    // let mint_str = mint_key.to_string();
    // require!(
    //     mint_str.ends_with("kfun"),
    //     AmmError::InvalidTokenMint
    // );

    process_create_token_metadata(ProcessCreateTokenMetadataParams {
        system_program: ctx.accounts.system_program.to_account_info(),
        payer: ctx.accounts.creator.to_account_info(),
        curve_authority: ctx.accounts.curve_authority.to_account_info(),
        mint: ctx.accounts.base_mint.to_account_info(),
        metadata_program: ctx.accounts.metadata_program.to_account_info(),
        mint_metadata: ctx.accounts.metadata.to_account_info(),
        creator: ctx.accounts.creator.to_account_info(),
        name: &params.name,
        symbol: &params.symbol,
        uri: &params.uri,
        curve_authority_bump: const_pda::curve_authority::BUMP,
        partner: config.fee_claimer,
    })?;

    // mint token
    let seeds = curve_authority_seeds!(const_pda::curve_authority::BUMP);
    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.base_mint.to_account_info(),
                to: ctx.accounts.base_vault.to_account_info(),
                authority: ctx.accounts.curve_authority.to_account_info(),
            },
            &[&seeds[..]],
        ),
        initial_base_supply,
    )?;

    // update mint authority
    anchor_spl::token_interface::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::SetAuthority {
                current_authority: ctx.accounts.curve_authority.to_account_info(),
                account_or_mint: ctx.accounts.base_mint.to_account_info(),
            },
            &[&seeds[..]],
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    // init curve
    let mut curve = ctx.accounts.curve.load_init()?;

    curve.init(
        ctx.accounts.config.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.base_mint.key(),
        ctx.accounts.base_vault.key(),
        ctx.accounts.quote_vault.key(),
        CurveType::SplToken.into(),
        initial_base_supply,
        config.initial_virtual_quote_reserve,
        config.initial_virtual_base_reserve,
    );

    emit_cpi!(curve.event(
        ctx.accounts.curve.key(),
        ctx.accounts.quote_mint.key(),
        params.name,
        params.symbol,
        params.uri,
        config.initial_virtual_quote_reserve,
        config.initial_virtual_base_reserve,
    ));
    Ok(())
}
