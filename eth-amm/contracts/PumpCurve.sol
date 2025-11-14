pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPumpFactory} from "./interfaces/IPumpFactory.sol";
import {IPumpReward} from "./interfaces/IPumpReward.sol";
import {IPumpCurve} from "./interfaces/IPumpCurve.sol";
import {PumpToken} from "./PumpToken.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IUniswapV3MintCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import {TickMath} from "./libraries/TickMath.sol";
import {LiquidityAmounts} from "./libraries/LiquidityAmounts.sol";

/**
 * @title PumpCurve
 * @notice Bonding curve contract for trading tokens with virtual AMM reserves
 * @dev Each curve is deployed per token and manages the bonding curve trading logic
 */
contract PumpCurve is IPumpCurve, IUniswapV3MintCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Maximum basis points (100%)
    uint256 private constant MAX_BASIS_POINTS = 10_000;

    /// @notice Graduation threshold magic number for capping logic
    uint256 private constant GRADUATION_THRESHOLD = 17_250_803_836;

    /// @notice Migration fee percentage (5% in basis points)
    uint256 private constant MIGRATION_FEE_BASIS_POINTS = 500;

    /// @notice Uniswap v3 pool fee tier (1%)
    uint24 private constant UNISWAP_POOL_FEE = 10000;

    /// @notice Full range tick bounds for Uniswap v3
    /// @dev For 1% fee tier, tick spacing is 200, so ticks must be multiples of 200
    /// @dev TickMath.MIN_TICK and TickMath.MAX_TICK are -887272 and 887272
    /// @dev We use -887200 and 887200 (multiples of 200) for full range
    int24 private constant FULL_RANGE_MIN_TICK = -887200;
    int24 private constant FULL_RANGE_MAX_TICK = -FULL_RANGE_MIN_TICK;

    // ============ Immutable Storage ============

    /// @inheritdoc IPumpCurve
    address public immutable override factory;

    /// @inheritdoc IPumpCurve
    address public immutable override baseToken;

    /// @inheritdoc IPumpCurve
    address public immutable override quoteToken;

    /// @inheritdoc IPumpCurve
    address public immutable override creator;

    /// @notice Uniswap v3 factory address for creating pools
    address public immutable uniswapV3Factory;

    /// @notice Reward contract address for fee calculations and distribution
    address public immutable rewardContract;

    // ============ Mutable Storage ============

    /// @inheritdoc IPumpCurve
    bool public override graduated;

    /// @notice Whether liquidity has been migrated to Uniswap v3
    bool public migrated;

    /// @notice Address of the created Uniswap v3 pool
    address public poolAddress;

    /// @dev Internal storage for curve state
    CurveState internal _state;

    /// @inheritdoc IPumpCurve
    function state() external view override returns (CurveState memory) {
        return _state;
    }

    // ============ Constructor ============

    constructor(
        address _baseToken,
        address _quoteToken,
        address _creator,
        address _uniswapV3Factory,
        address _rewardContract
    ) {
        factory = msg.sender;
        baseToken = _baseToken;
        quoteToken = _quoteToken;
        creator = _creator;
        uniswapV3Factory = _uniswapV3Factory;
        rewardContract = _rewardContract;

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
            // Get fees from reward contract (reward contract has all the logic)
            (
                fees.totalFee,
                fees.protocolFee,
                fees.creatorFee,
                fees.cashbackFee,
                fees.l1ReferralFee,
                fees.l2ReferralFee,
                fees.l3ReferralFee
            ) = IPumpReward(rewardContract).calculateFees(msg.sender, amountIn);

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
                IPumpReward.FeeConfig memory feeConfig = IPumpReward(rewardContract).feeConfig();
                uint256 effectiveFeeRate = fees.l1ReferralFee > 0 || fees.l2ReferralFee > 0 || fees.l3ReferralFee > 0
                    ? feeConfig.feeBasisPoints - feeConfig.refereeDiscountBasisPoints
                    : feeConfig.feeBasisPoints;

                // Round UP: user pays slightly more to ensure graduation threshold is reached (protocol favored)
                uint256 cappedTotalAmountIn = Math.mulDiv(
                    cappedActualAmountIn, MAX_BASIS_POINTS, MAX_BASIS_POINTS - effectiveFeeRate, Math.Rounding.Ceil
                );

                // Recalculate fees from reward contract
                (
                    fees.totalFee,
                    fees.protocolFee,
                    fees.creatorFee,
                    fees.cashbackFee,
                    fees.l1ReferralFee,
                    fees.l2ReferralFee,
                    fees.l3ReferralFee
                ) = IPumpReward(rewardContract).calculateFees(msg.sender, cappedTotalAmountIn);

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
            // Get fees from reward contract (reward contract has all the logic)
            (
                fees.totalFee,
                fees.protocolFee,
                fees.creatorFee,
                fees.cashbackFee,
                fees.l1ReferralFee,
                fees.l2ReferralFee,
                fees.l3ReferralFee
            ) = IPumpReward(rewardContract).calculateFees(msg.sender, amountOut);

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

        // 7. Transfer all fees to reward contract for distribution
        // Note: fees are always in quote tokens
        if (fees.totalFee > 0) {
            IERC20(quoteToken).safeTransfer(rewardContract, fees.totalFee);
        }

        // 8. Track all fees in reward contract (single call for gas efficiency)
        // Volume should always be tracked in quote tokens
        uint256 quoteVolume = quoteToBase ? amountIn : (amountOut + fees.totalFee);
        IPumpReward(rewardContract).addFees(
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

    // ============ Migration Functions ============

    /// @notice Migrate liquidity to Uniswap v3 after graduation
    /// @dev Can be called by anyone after graduation. Creates a Uniswap v3 pool and adds full-range liquidity
    function migrate() external nonReentrant {
        // 1. Validation
        require(graduated, "Curve must be graduated");
        require(!migrated, "Already migrated");

        // 2. Get actual token balances
        uint256 quoteBalance = IERC20(quoteToken).balanceOf(address(this));
        uint256 baseBalance = IERC20(baseToken).balanceOf(address(this));

        require(quoteBalance > 0 && baseBalance > 0, "Insufficient balances");

        // 3. Take 5% migration fee from quote tokens
        uint256 migrationFee = Math.mulDiv(quoteBalance, MIGRATION_FEE_BASIS_POINTS, MAX_BASIS_POINTS);
        uint256 quoteForLiquidity = quoteBalance - migrationFee;

        // Transfer fee to reward contract
        IERC20(quoteToken).safeTransfer(rewardContract, migrationFee);
        IPumpReward(rewardContract).addProtocolFee(migrationFee);

        // 4. Determine token0 and token1 (Uniswap v3 requires sorted order)
        (address token0, address token1) = baseToken < quoteToken ? (baseToken, quoteToken) : (quoteToken, baseToken);
        (uint256 amount0, uint256 amount1) =
            baseToken < quoteToken ? (baseBalance, quoteForLiquidity) : (quoteForLiquidity, baseBalance);

        // 5. Create Uniswap v3 pool
        address pool = IUniswapV3Factory(uniswapV3Factory).createPool(token0, token1, UNISWAP_POOL_FEE);
        poolAddress = pool;

        // 6. Calculate initial price (sqrtPriceX96)
        // Price = quoteReserve / baseReserve (in quote per base)
        // sqrtPriceX96 = sqrt(price) * 2^96
        // For token0/token1: if token0 = base, price = quote/base, sqrtPriceX96 = sqrt(quote/base) * 2^96
        // If token0 = quote, price = base/quote, sqrtPriceX96 = sqrt(base/quote) * 2^96
        uint160 sqrtPriceX96;
        if (token0 == baseToken) {
            // token0 = base, token1 = quote
            // Price (token1/token0) = quote/base
            // _calculateSqrtPriceX96(amount0, amount1) returns sqrt(amount1/amount0)
            // So pass (base, quote) to get sqrt(quote/base)
            sqrtPriceX96 = _calculateSqrtPriceX96(baseBalance, quoteForLiquidity);
        } else {
            // token0 = quote, token1 = base
            // Price (token1/token0) = base/quote
            // So pass (quote, base) to get sqrt(base/quote)
            sqrtPriceX96 = _calculateSqrtPriceX96(quoteForLiquidity, baseBalance);
        }

        // 7. Initialize pool with calculated price
        IUniswapV3Pool(pool).initialize(sqrtPriceX96);

        // 8. Add full-range liquidity
        // Calculate liquidity using Uniswap's formula
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(FULL_RANGE_MIN_TICK),
            TickMath.getSqrtRatioAtTick(FULL_RANGE_MAX_TICK),
            amount0,
            amount1
        );

        // Mint position to address(0) to burn it
        IUniswapV3Pool(pool).mint(
            address(0), // recipient - burn the position
            FULL_RANGE_MIN_TICK, // tickLower - full range
            FULL_RANGE_MAX_TICK, // tickUpper - full range
            liquidity, // liquidity amount
            "" // data - not needed
        );

        // 9. Mark as migrated
        migrated = true;

        // 10. Emit event
        emit Migrated(pool, baseBalance, quoteForLiquidity, migrationFee);
    }

    /// @inheritdoc IUniswapV3MintCallback
    /// @dev Called by Uniswap v3 pool during mint to transfer tokens
    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata) external override {
        // Verify caller is the pool we created
        require(msg.sender == poolAddress, "Invalid callback caller");

        // Transfer tokens to pool
        if (amount0Owed > 0) {
            (address token0,) = baseToken < quoteToken ? (baseToken, quoteToken) : (quoteToken, baseToken);
            IERC20(token0).safeTransfer(msg.sender, amount0Owed);
        }
        if (amount1Owed > 0) {
            (, address token1) = baseToken < quoteToken ? (baseToken, quoteToken) : (quoteToken, baseToken);
            IERC20(token1).safeTransfer(msg.sender, amount1Owed);
        }
    }

    /// @notice Calculate sqrtPriceX96 from token amounts
    /// @dev sqrtPriceX96 = sqrt(amount1 / amount0) * 2^96
    /// @param amount0 Amount of token0
    /// @param amount1 Amount of token1
    /// @return sqrtPriceX96 The sqrt price in Q64.96 format
    function _calculateSqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        // Calculate price ratio: amount1 / amount0
        // sqrtPrice = sqrt(amount1 / amount0) = sqrt(amount1) / sqrt(amount0)
        // sqrtPriceX96 = sqrtPrice * 2^96

        // Use Math.mulDiv for safe calculations
        // sqrtPriceX96 = sqrt(amount1) * 2^96 / sqrt(amount0)
        // To avoid precision loss, we calculate: sqrt(amount1 * 2^192 / amount0)

        uint256 ratioX192 = Math.mulDiv(amount1, 1 << 192, amount0);
        return uint160(_sqrt(ratioX192));
    }

    /// @notice Calculate square root using Babylonian method
    /// @param x The value to calculate square root of
    /// @return y The square root of x
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
