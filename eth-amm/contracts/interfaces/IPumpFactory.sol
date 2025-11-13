pragma solidity ^0.8.30;

/// @title The interface for the Pump Factory
/// @notice The Pump Factory facilitates creation of Pump bonding curves and control over the protocol fees
/// @dev Also manages cashback rewards and referral tracking
interface IPumpFactory {
    // ============ Structs ============

    /// @notice Configuration for protocol fees
    /// @param feeBasisPoints The total fee charged on swaps (in basis points, 100 = 1%)
    /// @param creatorFeeBasisPoints The fee paid to token creator (in basis points)
    /// @param l1ReferralFeeBasisPoints The fee paid to L1 referrer (in basis points)
    /// @param l2ReferralFeeBasisPoints The fee paid to L2 referrer (in basis points)
    /// @param l3ReferralFeeBasisPoints The fee paid to L3 referrer (in basis points)
    /// @param refereeDiscountBasisPoints Discount given to users who have a referrer (in basis points)
    struct FeeConfig {
        uint16 feeBasisPoints;
        uint16 creatorFeeBasisPoints;
        uint16 l1ReferralFeeBasisPoints;
        uint16 l2ReferralFeeBasisPoints;
        uint16 l3ReferralFeeBasisPoints;
        uint16 refereeDiscountBasisPoints;
    }

    /// @notice User's cashback account data
    /// @param totalVolume Cumulative trading volume across all curves (in USDC, 6 decimals)
    /// @param accumulatedCashback USDC cashback rewards ready to claim
    /// @param accumulatedReferral USDC referral rewards ready to claim (from L1/L2/L3)
    /// @param lastClaimTimestamp Timestamp of last claim for cooldown tracking
    struct CashbackAccount {
        uint256 totalVolume;
        uint256 accumulatedCashback;
        uint256 accumulatedReferral;
        uint256 lastClaimTimestamp;
    }

    /// @notice Tier configuration
    /// @param volumeThreshold Minimum volume required for this tier (in USDC, 6 decimals)
    /// @param cashbackBasisPoints Cashback rate in basis points (e.g., 5 = 0.05%)
    struct Tier {
        uint256 volumeThreshold;
        uint16 cashbackBasisPoints;
    }

    // ============ Events ============

    // Factory Events
    /// @notice Emitted when a bonding curve is created
    /// @param creator The creator of the curve
    /// @param token0 The first token of the curve by address sort order
    /// @param token1 The second token of the curve by address sort order
    /// @param curve The address of the created curve
    event CurveCreated(address indexed creator, address indexed token0, address indexed token1, address curve);

    /// @notice Emitted when the curve graduates to DEX
    /// @param baseToken The base token of the graduated curve
    /// @param timestamp The timestamp when the curve graduated
    event CurveGraduated(address indexed baseToken, uint256 timestamp);

    /// @notice Emitted when the protocol fees are updated
    /// @param feeBasisPoints The new protocol fee in basis points
    /// @param creatorFeeBasisPoints The new creator fee in basis points
    /// @param l1ReferralFeeBasisPoints The new L1 referral fee in basis points
    /// @param l2ReferralFeeBasisPoints The new L2 referral fee in basis points
    /// @param l3ReferralFeeBasisPoints The new L3 referral fee in basis points
    /// @param refereeDiscountBasisPoints The new referee discount in basis points
    event FeesUpdated(
        uint16 feeBasisPoints,
        uint16 creatorFeeBasisPoints,
        uint16 l1ReferralFeeBasisPoints,
        uint16 l2ReferralFeeBasisPoints,
        uint16 l3ReferralFeeBasisPoints,
        uint16 refereeDiscountBasisPoints
    );

    // Cashback Events
    /// @notice Emitted when a user sets their referrer
    /// @param user The user who set the referrer
    /// @param referrer The referrer address
    event ReferralSet(address indexed user, address indexed referrer);

    /// @notice Emitted when cashback is added to a user's account
    /// @param user The user receiving cashback
    /// @param volume The trading volume that generated this cashback
    /// @param cashbackAmount The USDC cashback amount added
    /// @param newTier The user's tier after volume update
    event CashbackAdded(address indexed user, uint256 volume, uint256 cashbackAmount, uint8 newTier);

    /// @notice Emitted when referral rewards are distributed
    /// @param referrer The referrer receiving rewards
    /// @param level The referral level (1, 2, or 3)
    /// @param amount The USDC reward amount
    /// @param fromUser The user whose trade generated this reward
    event ReferralRewardAdded(address indexed referrer, uint8 level, uint256 amount, address indexed fromUser);

    /// @notice Emitted when a user claims cashback
    /// @param user The user claiming cashback
    /// @param amount The USDC amount claimed
    event CashbackClaimed(address indexed user, uint256 amount);

    /// @notice Emitted when a user claims referral rewards
    /// @param user The user claiming referral rewards
    /// @param amount The USDC amount claimed
    event ReferralClaimed(address indexed user, uint256 amount);

    /// @notice Emitted when protocol fees are claimed
    /// @param owner The protocol owner claiming fees
    /// @param amount The USDC amount claimed
    event ProtocolFeeClaimed(address indexed owner, uint256 amount);

    /// @notice Emitted when creator fees are claimed
    /// @param creator The creator claiming fees
    /// @param curve The curve address from which fees are claimed
    /// @param amount The USDC amount claimed
    event CreatorFeeClaimed(address indexed creator, address indexed curve, uint256 amount);

    // ============ Errors ============

    error ReferrerAlreadySet();
    error InvalidReferrer();
    error CircularReferral();
    error NothingToClaim();
    error InvalidTierConfiguration();

    // ============ Factory Functions ============

    /// @notice Returns the curve address for a given base token, or address 0 if it does not exist
    /// @param baseToken The contract address of the base token
    /// @return curve The curve address
    function getCurve(address baseToken) external view returns (address curve);

    /// @notice Mints an ERC20 token and creates a curve for the metadata
    /// @param name The name of the token
    /// @param symbol The symbol of the token
    /// @param requestId A unique identifier for this deployment (e.g., UUID from server)
    /// @dev The caller becomes the creator of the curve
    /// @dev The requestId is combined with msg.sender to create deterministic addresses via CREATE2
    /// @return token The address of the newly minted token
    /// @return curve The address of the newly created curve
    function mintTokenAndCreateCurve(string memory name, string memory symbol, bytes32 requestId)
        external
        returns (address token, address curve);

    /// @notice Returns the current fee configuration
    /// @return The current FeeConfig struct
    function feeConfig() external view returns (FeeConfig memory);

    /// @notice Updates the protocol fee configuration
    /// @dev Must be called by the current owner
    /// @param config The new fee configuration
    function setFeeConfig(FeeConfig calldata config) external;

    // ============ Cashback View Functions ============

    /// @notice Get a user's cashback account data
    /// @param user The user address
    /// @return account The user's CashbackAccount struct
    function getCashbackAccount(address user) external view returns (CashbackAccount memory account);

    /// @notice Get a user's direct referrer (L1)
    /// @param user The user address
    /// @return referrer The referrer address (address(0) if none)
    function getReferrer(address user) external view returns (address referrer);

    /// @notice Get all three levels of referrers for a user
    /// @param user The user address
    /// @return l1 The L1 (direct) referrer
    /// @return l2 The L2 (referrer's referrer)
    /// @return l3 The L3 (third level referrer)
    function getReferralChain(address user) external view returns (address l1, address l2, address l3);

    /// @notice Get tier configuration
    /// @param tierIndex The tier index (0-6)
    /// @return tier The Tier struct
    function getTier(uint8 tierIndex) external view returns (Tier memory tier);

    /// @notice Get the total number of tiers
    /// @return count The number of tiers
    function getTierCount() external view returns (uint256 count);

    /// @notice Get a user's current tier based on their volume
    /// @param user The user address
    /// @return tierIndex The user's current tier (0-6)
    function getCurrentTier(address user) external view returns (uint8 tierIndex);

    // ============ Cashback User Functions ============

    /// @notice Set the caller's referrer (can only be set once)
    /// @param referrer The referrer address
    function setReferrer(address referrer) external;

    /// @notice Claim accumulated cashback rewards
    /// @return amount The USDC amount claimed
    function claimCashback() external returns (uint256 amount);

    /// @notice Claim accumulated referral rewards
    /// @return amount The USDC amount claimed
    function claimReferral() external returns (uint256 amount);

    /// @notice Claim both cashback and referral rewards
    /// @return cashbackAmount The cashback USDC amount claimed
    /// @return referralAmount The referral USDC amount claimed
    function claimAll() external returns (uint256 cashbackAmount, uint256 referralAmount);

    /// @notice Claim accumulated protocol fees (owner only)
    /// @return amount The USDC amount claimed
    function claimProtocolFee() external returns (uint256 amount);

    /// @notice Claim accumulated creator fees from a specific curve
    /// @param curve The curve address to claim fees from
    /// @return amount The USDC amount claimed
    function claimCreatorFee(address curve) external returns (uint256 amount);

    // ============ Cashback Curve Functions ============

    /// @notice Calculate all fees for a trade
    /// @dev View function that calculates fee breakdown based on user's tier and referral status
    /// @param user The trader address
    /// @param tradeAmount The trade amount to calculate fees from (in quote tokens, USDC 6 decimals)
    /// @return totalFee The total fee to charge (with referee discount if applicable)
    /// @return protocolFee The protocol fee portion
    /// @return creatorFee The creator fee portion
    /// @return cashbackFee The cashback fee portion (based on user's tier)
    /// @return l1ReferralFee The L1 referral fee portion
    /// @return l2ReferralFee The L2 referral fee portion
    /// @return l3ReferralFee The L3 referral fee portion
    function calculateFees(address user, uint256 tradeAmount)
        external
        view
        returns (
            uint256 totalFee,
            uint256 protocolFee,
            uint256 creatorFee,
            uint256 cashbackFee,
            uint256 l1ReferralFee,
            uint256 l2ReferralFee,
            uint256 l3ReferralFee
        );

    /// @notice Record fees from a trade and distribute to appropriate parties
    /// @dev Callable by authorized curves only. Handles volume tracking, cashback, protocol/creator fees, and referrals.
    /// @param user The trader address
    /// @param volume The trade volume in quote token (USDC, 6 decimals)
    /// @param protocolFee The protocol fee amount from this trade (USDC, 6 decimals)
    /// @param creatorFee The creator fee amount from this trade (USDC, 6 decimals)
    /// @param cashbackFee The cashback fee amount from this trade (USDC, 6 decimals)
    /// @param l1ReferralFee The L1 referral fee amount (USDC, 6 decimals)
    /// @param l2ReferralFee The L2 referral fee amount (USDC, 6 decimals)
    /// @param l3ReferralFee The L3 referral fee amount (USDC, 6 decimals)
    function addFees(
        address user,
        uint256 volume,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 cashbackFee,
        uint256 l1ReferralFee,
        uint256 l2ReferralFee,
        uint256 l3ReferralFee
    ) external;

    // ============ Cashback Admin Functions ============

    /// @notice Update tier configuration
    /// @param tierIndex The tier index to update (0-6)
    /// @param volumeThreshold The minimum volume for this tier (in USDC, 6 decimals)
    /// @param cashbackBasisPoints The cashback rate in basis points (e.g., 5 = 0.05%)
    function updateTier(uint8 tierIndex, uint256 volumeThreshold, uint16 cashbackBasisPoints) external;
}
