pragma solidity ^0.8.30;

/// @title The interface for a Pump Bonding Curve
/// @notice The Pump Curve manages bonding curve trading logic with virtual AMM reserves
/// @dev Each curve is deployed per token by the Pump Factory
interface IPumpCurve {
    // ============ Structs ============

    /// @notice Mutable state for the bonding curve
    /// @param virtualQuoteReserve Virtual quote token reserves for bonding curve calculations
    /// @param virtualBaseReserve Virtual base token reserves for bonding curve calculations
    /// @param baseReserve Actual base token reserves held by the curve
    /// @param protocolFee Accumulated protocol fees
    /// @param creatorFee Accumulated creator fees
    struct CurveState {
        uint256 virtualQuoteReserve;
        uint256 virtualBaseReserve;
        uint256 baseReserve;
        uint256 protocolFee;
        uint256 creatorFee;
    }

    /// @notice Fee breakdown for swap calculations
    struct FeeBreakdown {
        uint256 totalFee;
        uint256 protocolFee;
        uint256 creatorFee;
        uint256 cashbackFee;
        uint256 l1ReferralFee;
        uint256 l2ReferralFee;
        uint256 l3ReferralFee;
    }

    // ============ Events ============

    /// @notice Emitted when the bonding curve is initialized
    /// @param baseToken The base token address
    /// @param creator The creator of the curve
    /// @param virtualQuoteReserve The initial virtual quote reserve
    /// @param virtualBaseReserve The initial virtual base reserve
    event CurveInitialized(
        address indexed baseToken, address indexed creator, uint256 virtualQuoteReserve, uint256 virtualBaseReserve
    );

    /// @notice Emitted when a swap occurs
    /// @param user The user initiating the swap
    /// @param recipient The recipient of the output tokens
    /// @param quoteToBase True if swapping quote for base (buy), false otherwise (sell)
    /// @param amountIn The amount of input tokens
    /// @param amountOut The amount of output tokens
    /// @param tradingFee The total trading fee charged
    /// @param protocolFee The protocol fee portion
    /// @param creatorFee The creator fee portion
    /// @param cashbackFee The cashback fee portion
    /// @param l1ReferralFee The L1 referral fee portion
    /// @param l2ReferralFee The L2 referral fee portion
    /// @param l3ReferralFee The L3 referral fee portion
    /// @param virtualQuoteReserve The new virtual quote reserve after swap
    /// @param virtualBaseReserve The new virtual base reserve after swap
    event Swap(
        address indexed user,
        address indexed recipient,
        bool quoteToBase,
        uint256 amountIn,
        uint256 amountOut,
        uint256 tradingFee,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 cashbackFee,
        uint256 l1ReferralFee,
        uint256 l2ReferralFee,
        uint256 l3ReferralFee,
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve
    );

    /// @notice Emitted when the curve graduates to DEX
    /// @param timestamp The graduation timestamp
    /// @param baseReserve The final base token reserve
    /// @param quoteReserve The final quote token reserve
    event CurveGraduated(uint256 timestamp, uint256 baseReserve, uint256 quoteReserve);

    // ============ View Functions ============

    /// @notice Returns the factory that deployed this curve
    /// @return The factory address
    function factory() external view returns (address);

    /// @notice Returns the base token being traded on this curve
    /// @return The base token address
    function baseToken() external view returns (address);

    /// @notice Returns the quote token (USDC) used for trading
    /// @return The quote token address
    function quoteToken() external view returns (address);

    /// @notice Returns the creator of this curve
    /// @return The creator address
    function creator() external view returns (address);

    /// @notice Returns the current state of the bonding curve
    /// @return The current CurveState struct
    function state() external view returns (CurveState memory);

    /// @notice Returns whether the curve has graduated to DEX
    /// @return True if graduated, false otherwise
    function graduated() external view returns (bool);

    // ============ Trading Functions ============

    /// @notice Execute a token swap on the bonding curve
    /// @param recipient The address to receive the output tokens
    /// @param quoteToBase True to buy base tokens (quote to base), false to sell (base to quote)
    /// @param amountIn The amount of input tokens
    /// @param minAmountOut The minimum amount of output tokens (slippage protection)
    /// @return amountOut The actual amount of output tokens received
    function swap(address recipient, bool quoteToBase, uint256 amountIn, uint256 minAmountOut)
        external
        returns (uint256 amountOut);
}
