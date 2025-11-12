pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPumpFactory} from "./interfaces/IPumpFactory.sol";
import {IPumpCurve} from "./interfaces/IPumpCurve.sol";

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
            baseReserve: 793_100_000_000_000, // Base reserve allocated to sell with our curve
            protocolFee: 0,
            creatorFee: 0
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

        // 2. Load state and config into memory (gas optimization)
        CurveState memory cache = _state;
        IPumpFactory.FeeConfig memory feeConfig = IPumpFactory(factory).feeConfig();

        // 3. Get referral chain from factory
        (address l1, address l2, address l3) = IPumpFactory(factory).getReferralChain(msg.sender);

        // 4. Calculate bonding curve output and fees
        uint256 newVirtualQuoteReserve;
        uint256 newVirtualBaseReserve;
        FeeBreakdown memory fees;
        uint256 actualAmountIn; // Amount used for swap calculation (after fee for buy)

        if (quoteToBase) {
            // Buying base tokens with quote tokens
            // Fees are deducted from INPUT quote before swap calculation
            fees = _calculateFees(amountIn, feeConfig, l1, l2, l3);
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
                uint256 cappedTotalAmountIn =
                    (cappedActualAmountIn * MAX_BASIS_POINTS) / (MAX_BASIS_POINTS - feeConfig.feeBasisPoints);
                fees = _calculateFees(cappedTotalAmountIn, feeConfig, l1, l2, l3);

                // Update amounts to use capped values
                amountIn = cappedTotalAmountIn;
                actualAmountIn = cappedActualAmountIn;
                amountOut = cappedAmountOut;
                newVirtualQuoteReserve = GRADUATION_THRESHOLD;
                newVirtualBaseReserve = newVirtualBase;

                // Mark as graduated
                graduated = true;
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
            fees = _calculateFees(amountOut, feeConfig, l1, l2, l3);
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

        // Accumulate fees for protocol and creator (stored for withdrawal)
        // Note: fees are always in quote tokens
        _state.protocolFee = cache.protocolFee + fees.protocolFee;
        _state.creatorFee = cache.creatorFee + fees.creatorFee;

        // 7. Execute token transfers
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

        // 6. Add cashback and referral rewards
        // Volume should always be tracked in quote tokens
        uint256 quoteVolume = quoteToBase ? amountIn : (amountOut + fees.totalFee);
        if (fees.cashbackFee > 0) {
            IPumpFactory(factory).addCashback(msg.sender, quoteVolume, fees.totalFee);
        }
        if (fees.l1ReferralFee + fees.l2ReferralFee + fees.l3ReferralFee > 0) {
            IPumpFactory(factory).addReferral(msg.sender, fees.totalFee);
        }

        // 7. Emit swap event
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
        // k = x * y (constant product)
        uint256 k = virtualQuote * virtualBase;

        // New virtual quote after adding input
        uint256 newVirtualQuote = virtualQuote + amountIn;

        // Calculate new virtual base maintaining k
        uint256 newVirtualBase = k / newVirtualQuote;

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

        // k = x * y (constant product)
        uint256 k = virtualQuote * virtualBase;

        // Calculate new virtual quote maintaining k
        uint256 newVirtualQuote = k / newVirtualBase;

        // Output is the difference
        quoteOut = virtualQuote - newVirtualQuote;

        return quoteOut;
    }

    /// @notice Calculate fee breakdown following Solana logic
    /// @param amountOut The output amount before fees
    /// @param feeConfig The fee configuration from factory
    /// @param l1 L1 referrer address
    /// @param l2 L2 referrer address
    /// @param l3 L3 referrer address
    /// @return fees The calculated fee breakdown
    function _calculateFees(
        uint256 amountOut,
        IPumpFactory.FeeConfig memory feeConfig,
        address l1,
        address l2,
        address l3
    ) internal view returns (FeeBreakdown memory fees) {
        bool hasReferral = l1 != address(0);

        // Calculate individual fees from output amount
        fees.l1ReferralFee = l1 != address(0) ? (amountOut * feeConfig.l1ReferralFeeBasisPoints) / MAX_BASIS_POINTS : 0;
        fees.l2ReferralFee = l2 != address(0) ? (amountOut * feeConfig.l2ReferralFeeBasisPoints) / MAX_BASIS_POINTS : 0;
        fees.l3ReferralFee = l3 != address(0) ? (amountOut * feeConfig.l3ReferralFeeBasisPoints) / MAX_BASIS_POINTS : 0;

        // Get user's cashback tier and calculate cashback
        uint8 userTier = IPumpFactory(factory).getCurrentTier(msg.sender);
        IPumpFactory.Tier memory tier = IPumpFactory(factory).getTier(userTier);
        fees.cashbackFee = (amountOut * tier.cashbackBasisPoints) / MAX_BASIS_POINTS;

        // Creator fee
        fees.creatorFee = (amountOut * feeConfig.creatorFeeBasisPoints) / MAX_BASIS_POINTS;

        // Calculate total fee with referee discount if applicable
        uint256 effectiveFeeRate =
            hasReferral ? feeConfig.feeBasisPoints - feeConfig.refereeDiscountBasisPoints : feeConfig.feeBasisPoints;

        fees.totalFee = (amountOut * effectiveFeeRate) / MAX_BASIS_POINTS;

        // Protocol fee is the remainder after all other fees
        fees.protocolFee = fees.totalFee - fees.l1ReferralFee - fees.l2ReferralFee - fees.l3ReferralFee
            - fees.creatorFee - fees.cashbackFee;

        return fees;
    }
}
