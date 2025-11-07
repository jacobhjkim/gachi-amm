// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AppStorage
 * @notice Shared storage structures and types for the Kimchi AMM
 * @dev Defines common data structures used across multiple contracts
 */

/// @notice Cashback tier levels determining reward percentages
enum CashbackTier {
    Wood,       // 0: 50 bps (0.05%)
    Bronze,     // 1: 100 bps (0.10%)
    Silver,     // 2: 125 bps (0.125%)
    Gold,       // 3: 150 bps (0.15%)
    Platinum,   // 4: 175 bps (0.175%)
    Diamond,    // 5: 200 bps (0.20%)
    Champion    // 6: 250 bps (0.25%)
}

/// @notice Migration status for bonding curve lifecycle
enum MigrationStatus {
    PreBondingCurve,   // 0: Trading active
    PostBondingCurve,  // 1: Curve completed, ready for migration
    CreatedPool        // 2: Migrated to Uniswap V3
}

/// @notice Global protocol configuration
struct Config {
    // Core addresses
    address quoteToken;           // WETH on Optimism
    address feeClaimer;          // Protocol fee recipient

    // Token configuration
    uint8 baseTokenDecimals;     // 6 decimals for base tokens
    uint8 quoteTokenDecimals;    // 18 decimals for WETH

    // Fee structure (basis points, denominator = 100,000)
    uint16 feeBasisPoints;                    // 1500 = 1.5% total fee
    uint16 l1ReferralFeeBasisPoints;         // 300 = 0.3% for L1 referrer
    uint16 l2ReferralFeeBasisPoints;         // 30 = 0.03% for L2 referrer
    uint16 l3ReferralFeeBasisPoints;         // 20 = 0.02% for L3 referrer
    uint16 refereeDiscountBasisPoints;       // 100 = 0.1% discount for referee
    uint16 creatorFeeBasisPoints;            // 500 = 0.5% to token creator
    uint16 migrationFeeBasisPoints;          // 5000 = 5% migration fee

    // Migration thresholds
    uint256 migrationBaseThreshold;          // 200M tokens (20% remaining triggers graduation)
    uint256 migrationQuoteThreshold;         // ~115 ETH virtual quote at graduation

    // Initial reserves
    uint256 initialVirtualQuoteReserve;      // 30 ETH virtual quote
    uint256 initialVirtualBaseReserve;       // 1.073B tokens virtual base

    // Initialized flag
    bool isInitialized;
}

/// @notice Bonding curve state for each token
struct BondingCurve {
    // Core addresses
    address creator;             // Token creator (receives creator fees)
    address baseToken;           // ERC20 token address

    // Reserves (actual balances)
    uint256 baseReserve;         // Actual token balance in contract
    uint256 quoteReserve;        // Actual WETH balance in contract

    // Virtual reserves (for pricing with initial liquidity)
    uint256 virtualBaseReserve;  // Virtual token reserve
    uint256 virtualQuoteReserve; // Virtual WETH reserve

    // Accumulated fees
    uint256 protocolFee;         // Unclaimed protocol fees
    uint256 creatorFee;          // Unclaimed creator fees

    // Migration state
    MigrationStatus migrationStatus;
    uint64 curveFinishTimestamp; // When curve completed

    // Uniswap V3 pool (after migration)
    address uniswapV3Pool;       // Pool address
    uint256 nftTokenId;          // LP NFT token ID
}

/// @notice User cashback account
struct CashbackAccount {
    CashbackTier tier;           // Current tier
    uint256 accumulated;         // Accumulated cashback (in WETH)
    uint64 lastClaimTimestamp;   // Last claim time
    bool exists;                 // Account initialized flag
}

/// @notice Simplified fee configuration for stack optimization
struct FeeConfig {
    uint16 feeBasisPoints;                // Total fee
    uint16 l1ReferralFeeBasisPoints;      // L1 referrer fee
    uint16 l2ReferralFeeBasisPoints;      // L2 referrer fee
    uint16 l3ReferralFeeBasisPoints;      // L3 referrer fee
    uint16 refereeDiscountBasisPoints;    // Referee discount
    uint16 creatorFeeBasisPoints;         // Creator fee
}

/// @notice Fee breakdown structure for internal calculations
struct FeeBreakdown {
    uint256 totalFee;            // Total fee charged
    uint256 l1ReferralFee;       // L1 referrer fee
    uint256 l2ReferralFee;       // L2 referrer fee
    uint256 l3ReferralFee;       // L3 referrer fee
    uint256 cashbackFee;         // Cashback reward
    uint256 creatorFee;          // Creator fee
    uint256 protocolFee;         // Protocol fee
    uint256 netAmount;           // Amount after fees
}

/// @notice Main application storage
struct AppStorage {
    // Global configuration
    Config config;

    // Bonding curves: baseToken => BondingCurve
    mapping(address => BondingCurve) curves;

    // Cashback accounts: user => CashbackAccount
    mapping(address => CashbackAccount) cashbacks;

    // Referral links: user => referrer
    // Supports up to 3 levels (L1 -> L2 -> L3)
    mapping(address => address) referrals;

    // Track if a curve exists
    mapping(address => bool) curveExists;

    // Admin address (for privileged operations)
    address admin;
}

/// @notice Constants for the protocol
library Constants {
    /// @notice Total supply for each token: 1 billion with 6 decimals
    uint256 constant TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000; // 1B * 10^6

    /// @notice Initial real token reserves: ~793M tokens
    uint256 constant INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;

    /// @notice Fee denominator for basis points calculation
    uint256 constant FEE_DENOMINATOR = 100_000;

    /// @notice Decimal scaling factor (quote 18 decimals / base 6 decimals = 10^12)
    uint256 constant DECIMAL_SCALE = 1000; // Used in bonding curve math

    /// @notice Cashback claim cooldown: 7 days
    uint64 constant CASHBACK_CLAIM_COOLDOWN = 7 days;

    /// @notice Cashback inactive period: 365 days
    uint64 constant CASHBACK_INACTIVE_PERIOD = 365 days;

    /// @notice WETH address on Optimism
    address constant WETH_OPTIMISM = 0x4200000000000000000000000000000000000006;
}
