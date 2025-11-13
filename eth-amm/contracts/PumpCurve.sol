pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPumpFactory} from "./interfaces/IPumpFactory.sol";
import {IPumpCurve} from "./interfaces/IPumpCurve.sol";
import {PumpToken} from "./PumpToken.sol";

/**
 * @title PumpCurve
 * @notice Bonding curve contract for trading tokens with virtual AMM reserves
 * @dev Each curve is deployed per token and manages the bonding curve trading logic
 */
contract PumpCurve is IPumpCurve, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Maximum basis points (100%)
    uint256 private constant MAX_BASIS_POINTS = 10_000;

    /// @notice Graduation threshold magic number for capping logic
    uint256 private constant GRADUATION_THRESHOLD = 17_250_803_836;

    // ============ Immutable Storage ============

    /// @inheritdoc IPumpCurve
    address public immutable override factory;

    /// @inheritdoc IPumpCurve
    address public immutable override baseToken;

    /// @inheritdoc IPumpCurve
    address public immutable override quoteToken;

    /// @inheritdoc IPumpCurve
    address public immutable override creator;

    // ============ Mutable Storage ============

    /// @inheritdoc IPumpCurve
    bool public override graduated;

    /// @dev Internal storage for curve state
    CurveState internal _state;

    /// @inheritdoc IPumpCurve
    function state() external view override returns (CurveState memory) {
        return _state;
    }

    // ============ Constructor ============

    constructor(address _baseToken, address _quoteToken, address _creator) {
        factory = msg.sender;
        baseToken = _baseToken;
        quoteToken = _quoteToken;
        creator = _creator;

        // Initialize state with default values
        // Virtual reserves can be set by factory after deployment
        _state = CurveState({
            virtualQuoteReserve: 4500 * 10 ** 6, // USDC has 6 decimals
            virtualBaseReserve: 1_073_000_000_000_000, // 1.073B tokens with 6 decimals
            baseReserve: 793_100_000_000_000 // Base reserve allocated to sell with our curve
        });

        emit CurveInitialized(_baseToken, _creator, _state.virtualQuoteReserve, _state.virtualBaseReserve);
    }

    // ============ Trading Functions ============

    /// @inheritdoc IPumpCurve
    function swap(address recipient, bool quoteToBase, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        // 1. Validation
        require(!graduated, "Curve has graduated");
        require(amountIn > 0, "Amount in must be positive");
        require(recipient != address(0), "Invalid recipient");

        // 2. Load state into memory (gas optimization)
        CurveState memory cache = _state;

        // 3. Calculate bonding curve output and fees
        uint256 newVirtualQuoteReserve;
        uint256 newVirtualBaseReserve;
        FeeBreakdown memory fees;
        uint256 actualAmountIn; // Amount used for swap calculation (after fee for buy)

        if (quoteToBase) {
            // Buying base tokens with quote tokens
            // Fees are deducted from INPUT quote before swap calculation
            // Get fees from factory (factory has all the logic)
            (
                fees.totalFee,
                fees.protocolFee,
                fees.creatorFee,
                fees.cashbackFee,
                fees.l1ReferralFee,
                fees.l2ReferralFee,
                fees.l3ReferralFee
            ) = IPumpFactory(factory).calculateFees(msg.sender, amountIn);

            actualAmountIn = amountIn - fees.totalFee;

            // Calculate output using amount after fees
            amountOut =
                _getSwapAmountFromQuoteToBase(cache.virtualQuoteReserve, cache.virtualBaseReserve, actualAmountIn);

            // Check graduation condition: trade would exhaust all remaining tokens
            if (amountOut >= cache.baseReserve) {
                // Cap output to all remaining tokens in the curve
                uint256 cappedAmountOut = cache.baseReserve;

                // Calculate new virtual base after capped trade
                uint256 newVirtualBase = cache.virtualBaseReserve - cappedAmountOut;

                // Reverse calculate: find exact input needed (after fees) to reach graduation threshold
                uint256 cappedActualAmountIn =
                    _getSwapAmountFromBaseToQuote(GRADUATION_THRESHOLD, newVirtualBase, cappedAmountOut);

                // Recalculate fees on the capped input (add fees back to get total user pays)
                // Get fee config to calculate total amount needed
                IPumpFactory.FeeConfig memory feeConfig = IPumpFactory(factory).feeConfig();
                uint256 effectiveFeeRate = fees.l1ReferralFee > 0 || fees.l2ReferralFee > 0 || fees.l3ReferralFee > 0
                    ? feeConfig.feeBasisPoints - feeConfig.refereeDiscountBasisPoints
                    : feeConfig.feeBasisPoints;

                // Round UP: user pays slightly more to ensure graduation threshold is reached (protocol favored)
                uint256 cappedTotalAmountIn = Math.mulDiv(
                    cappedActualAmountIn, MAX_BASIS_POINTS, MAX_BASIS_POINTS - effectiveFeeRate, Math.Rounding.Ceil
                );

                // Recalculate fees from factory
                (
                    fees.totalFee,
                    fees.protocolFee,
                    fees.creatorFee,
                    fees.cashbackFee,
                    fees.l1ReferralFee,
                    fees.l2ReferralFee,
                    fees.l3ReferralFee
                ) = IPumpFactory(factory).calculateFees(msg.sender, cappedTotalAmountIn);

                // Update amounts to use capped values
                amountIn = cappedTotalAmountIn;
                actualAmountIn = cappedActualAmountIn;
                amountOut = cappedAmountOut;
                newVirtualQuoteReserve = GRADUATION_THRESHOLD;
                newVirtualBaseReserve = newVirtualBase;

                // Mark as graduated and notify token
                graduated = true;
                PumpToken(baseToken).graduate();
            } else {
                // Normal trade: calculate new virtual reserves
                newVirtualQuoteReserve = cache.virtualQuoteReserve + actualAmountIn;
                newVirtualBaseReserve = cache.virtualBaseReserve - amountOut;
            }
        } else {
            // Selling base tokens for quote tokens
            // No fees on input, calculate full output first
            actualAmountIn = amountIn;

            amountOut = _getSwapAmountFromBaseToQuote(cache.virtualQuoteReserve, cache.virtualBaseReserve, amountIn);

            // Fees are deducted from OUTPUT quote after swap calculation
            // Get fees from factory (factory has all the logic)
            (
                fees.totalFee,
                fees.protocolFee,
                fees.creatorFee,
                fees.cashbackFee,
                fees.l1ReferralFee,
                fees.l2ReferralFee,
                fees.l3ReferralFee
            ) = IPumpFactory(factory).calculateFees(msg.sender, amountOut);

            amountOut -= fees.totalFee;

            // Update virtual reserves (use gross output for reserves)
            uint256 grossAmountOut = amountOut + fees.totalFee;
            newVirtualQuoteReserve = cache.virtualQuoteReserve - grossAmountOut;
            newVirtualBaseReserve = cache.virtualBaseReserve + amountIn;
        }

        require(amountOut >= minAmountOut, "Slippage too high");

        // 5. Update state (single SSTORE per slot for gas efficiency)
        _state.virtualQuoteReserve = newVirtualQuoteReserve;
        _state.virtualBaseReserve = newVirtualBaseReserve;

        if (quoteToBase) {
            // Buying: decrease actual base reserve by output amount
            _state.baseReserve = cache.baseReserve - amountOut;
        } else {
            // Selling: increase actual base reserve by input amount
            _state.baseReserve = cache.baseReserve + amountIn;
        }

        // 6. Execute token transfers
        if (quoteToBase) {
            // Transfer quote tokens from user to curve
            IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), amountIn);
            // Transfer base tokens from curve to recipient
            IERC20(baseToken).safeTransfer(recipient, amountOut);
        } else {
            // Transfer base tokens from user to curve
            IERC20(baseToken).safeTransferFrom(msg.sender, address(this), amountIn);
            // Transfer quote tokens from curve to recipient
            IERC20(quoteToken).safeTransfer(recipient, amountOut);
        }

        // 7. Transfer all fees to factory for distribution
        // Note: fees are always in quote tokens
        if (fees.totalFee > 0) {
            IERC20(quoteToken).safeTransfer(factory, fees.totalFee);
        }

        // 8. Track all fees in factory (single call for gas efficiency)
        // Volume should always be tracked in quote tokens
        uint256 quoteVolume = quoteToBase ? amountIn : (amountOut + fees.totalFee);
        IPumpFactory(factory).addFees(
            msg.sender,
            creator,
            quoteVolume,
            fees.protocolFee,
            fees.creatorFee,
            fees.cashbackFee,
            fees.l1ReferralFee,
            fees.l2ReferralFee,
            fees.l3ReferralFee
        );

        // 9. Emit swap event
        emit Swap(
            msg.sender,
            recipient,
            quoteToBase,
            amountIn,
            amountOut,
            fees.totalFee,
            fees.protocolFee,
            fees.creatorFee,
            fees.cashbackFee,
            fees.l1ReferralFee,
            fees.l2ReferralFee,
            fees.l3ReferralFee,
            newVirtualQuoteReserve,
            newVirtualBaseReserve
        );

        return amountOut;
    }

    /// @notice Calculate swap output without executing the trade (view function for testing)
    /// @param amountIn Amount of input tokens
    /// @param quoteToBase Direction: true for buy (quote -> base), false for sell (base -> quote)
    /// @return amountOut Amount of output tokens (before fees)
    function calculateSwapOutput(uint256 amountIn, bool quoteToBase) external view returns (uint256 amountOut) {
        if (quoteToBase) {
            // Buying: quote -> base
            return _getSwapAmountFromQuoteToBase(_state.virtualQuoteReserve, _state.virtualBaseReserve, amountIn);
        } else {
            // Selling: base -> quote
            return _getSwapAmountFromBaseToQuote(_state.virtualQuoteReserve, _state.virtualBaseReserve, amountIn);
        }
    }

    // ============ Internal Functions ============

    /// @notice Calculate base output amount when buying with quote tokens (quote -> base)
    /// @dev Implements constant product formula: x * y = k
    /// @param virtualQuote Current virtual quote reserve
    /// @param virtualBase Current virtual base reserve
    /// @param amountIn Quote tokens being swapped in
    /// @return baseOut Base tokens to be received
    function _getSwapAmountFromQuoteToBase(uint256 virtualQuote, uint256 virtualBase, uint256 amountIn)
        internal
        pure
        returns (uint256 baseOut)
    {
        // New virtual quote after adding input
        uint256 newVirtualQuote = virtualQuote + amountIn;

        // Calculate new virtual base maintaining k = virtualQuote * virtualBase
        // Use mulDiv to prevent overflow in k calculation and preserve precision
        // Round UP: makes newVirtualBase larger → user receives less tokens (protocol favored, k preserved)
        uint256 newVirtualBase = Math.mulDiv(virtualQuote, virtualBase, newVirtualQuote, Math.Rounding.Ceil);

        // Output is the difference
        baseOut = virtualBase - newVirtualBase;

        return baseOut;
    }

    /// @notice Calculate quote output amount when selling base tokens (base -> quote)
    /// @dev Implements constant product formula: x * y = k
    /// @param virtualQuote Current virtual quote reserve
    /// @param virtualBase Current virtual base reserve
    /// @param amountIn Base tokens being swapped in
    /// @return quoteOut Quote tokens to be received
    function _getSwapAmountFromBaseToQuote(uint256 virtualQuote, uint256 virtualBase, uint256 amountIn)
        internal
        pure
        returns (uint256 quoteOut)
    {
        // New virtual base after adding input
        uint256 newVirtualBase = virtualBase + amountIn;

        // Calculate new virtual quote maintaining k = virtualQuote * virtualBase
        // Use mulDiv to prevent overflow in k calculation and preserve precision
        // Round UP: makes newVirtualQuote larger → user receives less tokens (protocol favored, k preserved)
        uint256 newVirtualQuote = Math.mulDiv(virtualQuote, virtualBase, newVirtualBase, Math.Rounding.Ceil);

        // Output is the difference
        quoteOut = virtualQuote - newVirtualQuote;

        return quoteOut;
    }
}
