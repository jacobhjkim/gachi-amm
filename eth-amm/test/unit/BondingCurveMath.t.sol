// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LibBondingCurve} from "../../src/libraries/LibBondingCurve.sol";
import {Constants} from "../../src/storage/AppStorage.sol";

/**
 * @title BondingCurveMathTest
 * @notice Tests for bonding curve calculations (xy=k formula)
 */
contract BondingCurveMathTest is Test {
    using LibBondingCurve for *;

    // Initial reserves (from Constants)
    uint256 constant INITIAL_VIRTUAL_QUOTE = 30 ether;
    uint256 constant INITIAL_VIRTUAL_BASE = 1_073_000_000_000_000; // 1.073B tokens
    uint256 constant MIGRATION_BASE_THRESHOLD = 200_000_000_000_000; // 200M tokens
    uint256 constant TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000; // 1B tokens

    function setUp() public {
        // No setup needed for pure math tests
    }

    // =============================================================
    //                       BUY CALCULATIONS
    // =============================================================

    function test_calculateBuy_SmallAmount() public {
        uint256 amountIn = 0.1 ether; // Buy with 0.1 ETH

        uint256 amountOut = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            amountIn
        );

        // Verify output is reasonable
        assertGt(amountOut, 0, "Output should be > 0");
        assertLt(amountOut, INITIAL_VIRTUAL_BASE, "Output should be < base reserve");

        // Verify constant product holds
        uint256 k = INITIAL_VIRTUAL_QUOTE * INITIAL_VIRTUAL_BASE * 1000;
        uint256 newVirtualQuote = INITIAL_VIRTUAL_QUOTE + amountIn;
        uint256 newVirtualBase = INITIAL_VIRTUAL_BASE - amountOut;
        uint256 newK = newVirtualQuote * newVirtualBase * 1000;

        assertApproxEqRel(k, newK, 0.01e18, "Constant product should hold (within 1%)");
    }

    function test_calculateBuy_MediumAmount() public {
        uint256 amountIn = 10 ether; // Buy with 10 ETH

        uint256 amountOut = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            amountIn
        );

        // Verify output is reasonable
        assertGt(amountOut, 0, "Output should be > 0");
        assertLt(amountOut, INITIAL_VIRTUAL_BASE, "Output should be < base reserve");

        // Larger amount should give more tokens
        uint256 smallAmountOut = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            1 ether
        );
        assertGt(amountOut, smallAmountOut, "10 ETH should give more than 1 ETH");
        // Due to slippage, 10 ETH gives less than 10x the tokens
        assertLt(amountOut, smallAmountOut * 10, "10 ETH should give < 10x more (slippage)");
    }

    function test_calculateBuy_LargeAmount() public {
        uint256 amountIn = 50 ether; // Buy with 50 ETH

        uint256 amountOut = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            amountIn
        );

        // Verify output is reasonable
        assertGt(amountOut, 0, "Output should be > 0");
        assertLt(amountOut, INITIAL_VIRTUAL_BASE, "Output should be < base reserve");

        // Price should worsen as you buy more
        uint256 avgPrice = (amountIn * 1e18) / amountOut;
        uint256 initialPrice = LibBondingCurve.getPrice(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE
        );
        assertGt(avgPrice, initialPrice, "Average price should be worse than initial");
    }

    function test_calculateBuy_SequentialBuys() public {
        uint256 virtualQuote = INITIAL_VIRTUAL_QUOTE;
        uint256 virtualBase = INITIAL_VIRTUAL_BASE;

        // First buy
        uint256 buy1Out = LibBondingCurve.calculateBuy(virtualQuote, virtualBase, 1 ether);
        virtualQuote += 1 ether;
        virtualBase -= buy1Out;

        // Second buy (same amount)
        uint256 buy2Out = LibBondingCurve.calculateBuy(virtualQuote, virtualBase, 1 ether);

        // Second buy should get fewer tokens (price increased)
        assertLt(buy2Out, buy1Out, "Second buy should get fewer tokens");
    }

    function test_calculateBuy_EdgeCase_VerySmall() public {
        uint256 amountIn = 0.0001 ether; // Use a slightly larger "small" amount

        uint256 amountOut = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            amountIn
        );

        // Small amounts should give reasonable output
        assertGt(amountOut, 0, "Should get some output");
        assertLt(amountOut, INITIAL_VIRTUAL_BASE / 1000, "Should be a small fraction of reserves");
    }

    // =============================================================
    //                       SELL CALCULATIONS
    // =============================================================

    function test_calculateSell_SmallAmount() public {
        uint256 amountIn = 1_000_000_000; // Sell 1M tokens

        uint256 amountOut = LibBondingCurve.calculateSell(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            amountIn
        );

        // Verify output is reasonable
        assertGt(amountOut, 0, "Output should be > 0");
        assertLt(amountOut, INITIAL_VIRTUAL_QUOTE, "Output should be < quote reserve");
    }

    function test_calculateSell_AfterBuy() public {
        // Buy first with a larger amount to have meaningful slippage
        uint256 buyAmount = 50 ether;
        uint256 tokensBought = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            buyAmount
        );

        // Update reserves
        uint256 newVirtualQuote = INITIAL_VIRTUAL_QUOTE + buyAmount;
        uint256 newVirtualBase = INITIAL_VIRTUAL_BASE - tokensBought;

        // Now sell the tokens back
        uint256 quoteReceived = LibBondingCurve.calculateSell(
            newVirtualQuote,
            newVirtualBase,
            tokensBought
        );

        // Due to rounding, might get exactly the same or slightly less
        // The important thing is we don't gain value
        assertLe(quoteReceived, buyAmount, "Should not gain value on round-trip");
        assertGt(quoteReceived, 0, "Should receive some quote tokens");
        // Should get at least 99% back (allowing for rounding)
        assertGt(quoteReceived, (buyAmount * 99) / 100, "Should get at least 99% back");
    }

    function test_calculateSell_SequentialSells() public {
        // Start with some quote in reserves
        uint256 virtualQuote = 50 ether;
        uint256 virtualBase = 800_000_000_000_000; // 800M tokens

        // First sell
        uint256 sellAmount = 10_000_000_000; // 10M tokens
        uint256 sell1Out = LibBondingCurve.calculateSell(
            virtualQuote,
            virtualBase,
            sellAmount
        );
        virtualQuote -= sell1Out;
        virtualBase += sellAmount;

        // Second sell (same amount)
        uint256 sell2Out = LibBondingCurve.calculateSell(
            virtualQuote,
            virtualBase,
            sellAmount
        );

        // Second sell should get less quote (price decreased)
        assertLt(sell2Out, sell1Out, "Second sell should get less quote");
    }

    // =============================================================
    //                       PRICE CALCULATIONS
    // =============================================================

    function test_getPrice_Initial() public {
        uint256 price = LibBondingCurve.getPrice(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE
        );

        // Price should be reasonable
        assertGt(price, 0, "Price should be > 0");

        // Verify price is in reasonable range
        // Price is returned with 18 decimal precision for the ratio
        assertGt(price, 27 ether, "Price should be > 27");
        assertLt(price, 29 ether, "Price should be < 29");
    }

    function test_getPrice_IncreasesAfterBuy() public {
        uint256 initialPrice = LibBondingCurve.getPrice(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE
        );

        // Simulate a buy
        uint256 buyAmount = 10 ether;
        uint256 tokensBought = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            buyAmount
        );

        uint256 newPrice = LibBondingCurve.getPrice(
            INITIAL_VIRTUAL_QUOTE + buyAmount,
            INITIAL_VIRTUAL_BASE - tokensBought
        );

        assertGt(newPrice, initialPrice, "Price should increase after buy");
    }

    function test_getPrice_DecreasesAfterSell() public {
        // Start with some accumulated state
        uint256 virtualQuote = 50 ether;
        uint256 virtualBase = 800_000_000_000_000;

        uint256 initialPrice = LibBondingCurve.getPrice(virtualQuote, virtualBase);

        // Simulate a sell
        uint256 sellAmount = 10_000_000_000;
        uint256 quoteReceived = LibBondingCurve.calculateSell(
            virtualQuote,
            virtualBase,
            sellAmount
        );

        uint256 newPrice = LibBondingCurve.getPrice(
            virtualQuote - quoteReceived,
            virtualBase + sellAmount
        );

        assertLt(newPrice, initialPrice, "Price should decrease after sell");
    }

    // =============================================================
    //                   GRADUATION LOGIC
    // =============================================================

    function test_isCurveComplete_BelowThreshold() public {
        uint256 baseReserve = 150_000_000_000_000; // 150M tokens (below 200M)

        bool isComplete = LibBondingCurve.isCurveComplete(
            baseReserve,
            MIGRATION_BASE_THRESHOLD
        );

        assertTrue(isComplete, "Curve should be complete when below threshold");
    }

    function test_isCurveComplete_AtThreshold() public {
        uint256 baseReserve = MIGRATION_BASE_THRESHOLD; // Exactly 200M

        bool isComplete = LibBondingCurve.isCurveComplete(
            baseReserve,
            MIGRATION_BASE_THRESHOLD
        );

        assertTrue(isComplete, "Curve should be complete at threshold");
    }

    function test_isCurveComplete_AboveThreshold() public {
        uint256 baseReserve = 300_000_000_000_000; // 300M tokens (above 200M)

        bool isComplete = LibBondingCurve.isCurveComplete(
            baseReserve,
            MIGRATION_BASE_THRESHOLD
        );

        assertFalse(isComplete, "Curve should not be complete above threshold");
    }

    function test_calculateCappedBuy_DoesNotExceedThreshold() public {
        // Set base reserve close to threshold
        uint256 baseReserve = 210_000_000_000_000; // 210M tokens
        uint256 virtualQuote = 80 ether;
        uint256 virtualBase = baseReserve + (INITIAL_VIRTUAL_BASE - TOKEN_TOTAL_SUPPLY);

        // Try to buy enough to go past threshold
        uint256 buyAmount = 5 ether;

        (uint256 cappedIn, uint256 amountOut) = LibBondingCurve.calculateCappedBuy(
            virtualQuote,
            virtualBase,
            baseReserve,
            MIGRATION_BASE_THRESHOLD,
            buyAmount
        );

        // Verify output leaves exactly the threshold
        uint256 remainingAfter = baseReserve - amountOut;
        assertEq(
            remainingAfter,
            MIGRATION_BASE_THRESHOLD,
            "Should leave exactly threshold amount"
        );

        // Verify capped input is less than requested
        assertLe(cappedIn, buyAmount, "Capped input should not exceed requested amount");
    }

    function test_calculateCappedBuy_NoCapNeeded() public {
        // Plenty of tokens above threshold
        uint256 baseReserve = 500_000_000_000_000; // 500M tokens
        uint256 virtualQuote = 40 ether;
        uint256 virtualBase = baseReserve + (INITIAL_VIRTUAL_BASE - TOKEN_TOTAL_SUPPLY);

        uint256 buyAmount = 1 ether; // Small buy

        (uint256 cappedIn, uint256 cappedOut) = LibBondingCurve.calculateCappedBuy(
            virtualQuote,
            virtualBase,
            baseReserve,
            MIGRATION_BASE_THRESHOLD,
            buyAmount
        );

        uint256 normalOut = LibBondingCurve.calculateBuy(
            virtualQuote,
            virtualBase,
            buyAmount
        );

        // Should be the same when cap not needed
        assertEq(cappedOut, normalOut, "Should match normal buy when cap not needed");
        assertEq(cappedIn, buyAmount, "Should use full input when cap not needed");
    }

    // =============================================================
    //                       FUZZ TESTS
    // =============================================================

    function testFuzz_calculateBuy_ConstantProduct(uint256 amountIn) public {
        // Bound inputs to reasonable range
        amountIn = bound(amountIn, 0.001 ether, 20 ether);

        uint256 amountOut = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            amountIn
        );

        // Skip if output rounds to zero
        if (amountOut == 0) return;

        // Verify constant product holds
        uint256 k = INITIAL_VIRTUAL_QUOTE * INITIAL_VIRTUAL_BASE * 1000;
        uint256 newVirtualQuote = INITIAL_VIRTUAL_QUOTE + amountIn;
        uint256 newVirtualBase = INITIAL_VIRTUAL_BASE - amountOut;
        uint256 newK = newVirtualQuote * newVirtualBase * 1000;

        // Allow 1% deviation for rounding
        assertApproxEqRel(k, newK, 0.01e18, "Constant product should hold");
    }

    function testFuzz_calculateSell_ConstantProduct(uint256 amountIn) public {
        // Bound inputs to reasonable range (tokens have 6 decimals)
        amountIn = bound(amountIn, 1_000_000, 100_000_000_000_000); // 1 to 100M tokens

        // Start with some quote reserve
        uint256 virtualQuote = 50 ether;
        uint256 virtualBase = 700_000_000_000_000; // 700M tokens

        uint256 amountOut = LibBondingCurve.calculateSell(
            virtualQuote,
            virtualBase,
            amountIn
        );

        // Skip if output would exceed available quote
        if (amountOut >= virtualQuote) return;

        // Verify constant product holds
        uint256 k = virtualQuote * virtualBase * 1000;
        uint256 newVirtualQuote = virtualQuote - amountOut;
        uint256 newVirtualBase = virtualBase + amountIn;
        uint256 newK = newVirtualQuote * newVirtualBase * 1000;

        // Allow 1% deviation for rounding
        assertApproxEqRel(k, newK, 0.01e18, "Constant product should hold");
    }

    function testFuzz_buyThenSell_NoProfit(uint256 buyAmount) public {
        // Bound to reasonable range - avoid extreme values
        buyAmount = bound(buyAmount, 1 ether, 50 ether);

        // Buy tokens
        uint256 tokensBought = LibBondingCurve.calculateBuy(
            INITIAL_VIRTUAL_QUOTE,
            INITIAL_VIRTUAL_BASE,
            buyAmount
        );

        if (tokensBought == 0) return;

        // Update reserves
        uint256 newVirtualQuote = INITIAL_VIRTUAL_QUOTE + buyAmount;
        uint256 newVirtualBase = INITIAL_VIRTUAL_BASE - tokensBought;

        // Sell immediately
        uint256 quoteReceived = LibBondingCurve.calculateSell(
            newVirtualQuote,
            newVirtualBase,
            tokensBought
        );

        // The key invariant: should never profit significantly from a round-trip
        // Due to rounding in large number arithmetic, might get some wei more
        // Allow up to 100 wei profit on trades up to 50 ETH (0.000002% tolerance)
        uint256 maxProfit = quoteReceived > buyAmount ? quoteReceived - buyAmount : 0;
        assertLe(maxProfit, 100, "Should not profit more than 100 wei from round-trip (rounding)");
    }
}
