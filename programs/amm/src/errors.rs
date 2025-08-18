use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq)]
pub enum AmmError {
    #[msg("Unauthorized operation")]
    Unauthorized,

    #[msg("Invalid amm config")]
    InvalidAmmConfig,

    #[msg("Invalid token name: must be 1-32 characters")]
    InvalidTokenName,

    #[msg("Invalid token symbol: must be 1-10 characters")]
    InvalidTokenSymbol,

    #[msg("Invalid token URI: must be 1-200 characters")]
    InvalidTokenUri,

    #[msg("Claim cooldown period not met")]
    ClaimCooldownNotMet,

    #[msg("No cashback available to claim")]
    NoCashbackToClaim,

    #[msg("Account is not inactive for required period")]
    AccountNotInactive,

    #[msg("Invalid cashback tier")]
    InvalidCashbackTier,

    // Math and type conversion errors
    #[msg("Math operation overflow")]
    MathOverflow,

    #[msg("Type cast error")]
    TypeCastFailed,

    // Swap and trading errors
    #[msg("Amount is zero")]
    AmountIsZero,

    #[msg("Exceeded slippage tolerance")]
    ExceededSlippage,

    #[msg("Pool is completed")]
    PoolIsCompleted,

    #[msg("Pool is incompleted")]
    PoolIsIncompleted,

    #[msg("Swap amount is over a threshold")]
    SwapAmountIsOverAThreshold,

    #[msg("Not enough liquidity")]
    NotEnoughLiquidity,

    #[msg("Insufficient liquidity for migration")]
    InsufficientLiquidityForMigration,

    #[msg("Invalid migration calculation")]
    InvalidMigrationCalculation,

    // Account validation errors
    #[msg("Invalid cashback token account")]
    InvalidCashbackTokenAccount,

    #[msg("Invalid account for the instruction")]
    InvalidAccount,

    #[msg("Invalid config account")]
    InvalidConfigAccount,

    // Config and parameter validation errors
    #[msg("Invalid token type")]
    InvalidTokenType,

    #[msg("Invalid token decimals")]
    InvalidTokenDecimals,

    #[msg("Invalid fee basis points")]
    InvalidFeeBasisPoints,

    #[msg("Invalid quote mint")]
    InvalidQuoteMint,

    #[msg("Invalid quote threshold")]
    InvalidQuoteThreshold,

    #[msg("Invalid curve")]
    InvalidCurve,

    #[msg("Invalid creator trading fee percentage")]
    InvalidCreatorTradingFeePercentage,

    /// Permission errors
    #[msg("Not permit to do this action")]
    NotPermitToDoThisAction,

    /// Migration specific errors
    #[msg("Missing pool config in remaining account")]
    MissingPoolConfigInRemainingAccount,

    /// Token 2022 specific errors
    #[msg("Unsupport native mint token 2022")]
    UnsupportNativeMintToken2022,

    /// Claim errors
    #[msg("Nothing to claim")]
    NothingToClaim,

    /// Invalid fee_type, only supports 0, 1, and 2.
    #[msg("Invalid fee type")]
    InvalidFeeType,

    #[msg("setting the same fee type")]
    FeeTypeAlreadySet,

    // TODO: delete
    #[msg("Invalid base vault amount")]
    InvalidBaseVaultAmount,
}
