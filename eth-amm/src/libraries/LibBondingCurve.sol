// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BondingCurve, MigrationStatus, Constants} from "../storage/AppStorage.sol";

/**
 * @title LibBondingCurve
 * @notice Library for bonding curve calculations using constant product formula (x * y = k)
 * @dev Implements the same logic as the Solana program with decimal scaling
 */
library LibBondingCurve {
    error InsufficientLiquidity();
    error InvalidAmount();
    error CurveCompleted();
    error InsufficientOutput();

    /// @notice Calculate output amount for buying tokens with quote (WETH -> Tokens)
    /// @param virtualQuoteReserve Virtual quote reserve (WETH, 18 decimals)
    /// @param virtualBaseReserve Virtual base reserve (Tokens, 6 decimals)
    /// @param amountIn Amount of quote token input (WETH)
    /// @return amountOut Amount of base tokens to receive
    function calculateBuy(
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve,
        uint256 amountIn
    ) internal pure returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        if (virtualQuoteReserve == 0 || virtualBaseReserve == 0) revert InsufficientLiquidity();

        // Scale base tokens to match quote decimal precision
        // Quote: 18 decimals, Base: 6 decimals
        // Scale factor: 1000 (10^12 / 10^9 for intermediate precision)
        uint256 virtualBaseScaled = virtualBaseReserve * Constants.DECIMAL_SCALE;

        // Constant product: k = virtualQuote * virtualBaseScaled
        uint256 k = virtualQuoteReserve * virtualBaseScaled;

        // New quote reserve after adding input
        uint256 newVirtualQuote = virtualQuoteReserve + amountIn;

        // Calculate new base reserve: newBaseScaled = k / newQuote
        uint256 newVirtualBaseScaled = k / newVirtualQuote;

        // Output is the difference, scaled back down
        uint256 baseOutScaled = virtualBaseScaled - newVirtualBaseScaled;
        amountOut = baseOutScaled / Constants.DECIMAL_SCALE;

        if (amountOut == 0) revert InsufficientOutput();
    }

    /// @notice Calculate output amount for selling tokens for quote (Tokens -> WETH)
    /// @param virtualQuoteReserve Virtual quote reserve (WETH, 18 decimals)
    /// @param virtualBaseReserve Virtual base reserve (Tokens, 6 decimals)
    /// @param amountIn Amount of base tokens input
    /// @return amountOut Amount of quote tokens (WETH) to receive
    function calculateSell(
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve,
        uint256 amountIn
    ) internal pure returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        if (virtualQuoteReserve == 0 || virtualBaseReserve == 0) revert InsufficientLiquidity();

        // Scale base tokens to match quote decimal precision
        uint256 virtualBaseScaled = virtualBaseReserve * Constants.DECIMAL_SCALE;
        uint256 amountInScaled = amountIn * Constants.DECIMAL_SCALE;

        // New base reserve after adding input
        uint256 newVirtualBaseScaled = virtualBaseScaled + amountInScaled;

        // Constant product: k = virtualBaseScaled * virtualQuote
        uint256 k = virtualBaseScaled * virtualQuoteReserve;

        // Calculate new quote reserve: newQuote = k / newBaseScaled
        uint256 newVirtualQuote = k / newVirtualBaseScaled;

        // Output is the difference
        amountOut = virtualQuoteReserve - newVirtualQuote;

        if (amountOut == 0) revert InsufficientOutput();
    }

    /// @notice Get the current price (quote per base token)
    /// @param virtualQuoteReserve Virtual quote reserve (WETH)
    /// @param virtualBaseReserve Virtual base reserve (Tokens)
    /// @return price Price in quote per base token (scaled by 10^18)
    function getPrice(uint256 virtualQuoteReserve, uint256 virtualBaseReserve)
        internal
        pure
        returns (uint256 price)
    {
        if (virtualBaseReserve == 0) revert InsufficientLiquidity();

        // Price = virtualQuote / (virtualBase * DECIMAL_SCALE)
        // Multiply by 10^18 to maintain precision in the result
        uint256 virtualBaseScaled = virtualBaseReserve * Constants.DECIMAL_SCALE;
        price = (virtualQuoteReserve * 1e18) / virtualBaseScaled;
    }

    /// @notice Check if the curve has completed (ready for graduation)
    /// @param baseReserve Current base token reserve
    /// @param migrationThreshold Threshold for graduation (200M tokens)
    /// @return True if curve is complete
    function isCurveComplete(uint256 baseReserve, uint256 migrationThreshold) internal pure returns (bool) {
        return baseReserve <= migrationThreshold;
    }

    /// @notice Calculate capped buy to avoid exceeding graduation threshold
    /// @param virtualQuoteReserve Virtual quote reserve
    /// @param virtualBaseReserve Virtual base reserve
    /// @param baseReserve Actual base reserve
    /// @param migrationThreshold Migration threshold (200M tokens)
    /// @param amountIn Desired quote input amount
    /// @return cappedAmountIn Capped input amount that leaves exactly migrationThreshold tokens
    /// @return cappedAmountOut Capped output amount (tokens)
    function calculateCappedBuy(
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve,
        uint256 baseReserve,
        uint256 migrationThreshold,
        uint256 amountIn
    ) internal pure returns (uint256 cappedAmountIn, uint256 cappedAmountOut) {
        // Maximum tokens we can sell
        uint256 maxTokensOut = baseReserve - migrationThreshold;

        // Calculate how much quote is needed for maxTokensOut
        // Using reverse calculation: given output, find input
        uint256 virtualBaseScaled = virtualBaseReserve * Constants.DECIMAL_SCALE;
        uint256 maxTokensOutScaled = maxTokensOut * Constants.DECIMAL_SCALE;

        // newBaseScaled = virtualBaseScaled - maxTokensOutScaled
        uint256 newVirtualBaseScaled = virtualBaseScaled - maxTokensOutScaled;

        // k = virtualQuote * virtualBaseScaled
        uint256 k = virtualQuoteReserve * virtualBaseScaled;

        // newQuote = k / newBaseScaled
        uint256 newVirtualQuote = k / newVirtualBaseScaled;

        // cappedAmountIn = newQuote - virtualQuote
        cappedAmountIn = newVirtualQuote - virtualQuoteReserve;

        // If the desired amount is less than or equal to the cap, use it
        if (amountIn <= cappedAmountIn) {
            cappedAmountIn = amountIn;
            cappedAmountOut = calculateBuy(virtualQuoteReserve, virtualBaseReserve, amountIn);
        } else {
            cappedAmountOut = maxTokensOut;
        }
    }

    /// @notice Validate that curve is not completed
    /// @param status Migration status
    function enforceNotCompleted(MigrationStatus status) internal pure {
        if (status != MigrationStatus.PreBondingCurve) revert CurveCompleted();
    }

    /// @notice Update reserves after a buy operation
    /// @param curve The bonding curve struct
    /// @param quoteIn Amount of quote added
    /// @param baseOut Amount of base removed
    function updateReservesAfterBuy(BondingCurve storage curve, uint256 quoteIn, uint256 baseOut) internal {
        curve.quoteReserve += quoteIn;
        curve.virtualQuoteReserve += quoteIn;
        curve.baseReserve -= baseOut;
        curve.virtualBaseReserve -= baseOut;
    }

    /// @notice Update reserves after a sell operation
    /// @param curve The bonding curve struct
    /// @param baseIn Amount of base added
    /// @param quoteOut Amount of quote removed
    function updateReservesAfterSell(BondingCurve storage curve, uint256 baseIn, uint256 quoteOut) internal {
        curve.baseReserve += baseIn;
        curve.virtualBaseReserve += baseIn;
        curve.quoteReserve -= quoteOut;
        curve.virtualQuoteReserve -= quoteOut;
    }
}
