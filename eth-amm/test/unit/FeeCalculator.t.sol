// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LibFeeCalculator} from "../../src/libraries/LibFeeCalculator.sol";
import {LibCashback} from "../../src/libraries/LibCashback.sol";
import {FeeConfig, FeeBreakdown, CashbackTier, Constants} from "../../src/storage/AppStorage.sol";

/**
 * @title FeeCalculatorTest
 * @notice Tests for fee distribution calculations
 */
contract FeeCalculatorTest is Test {
    // Test addresses
    address constant L1_REFERRER = address(0x1);
    address constant L2_REFERRER = address(0x2);
    address constant L3_REFERRER = address(0x3);
    address constant ZERO_ADDRESS = address(0);

    // Default fee config (matching protocol defaults)
    FeeConfig defaultConfig;

    function setUp() public {
        // Initialize with protocol defaults (from README)
        defaultConfig = FeeConfig({
            feeBasisPoints: 1500,              // 1.5%
            l1ReferralFeeBasisPoints: 300,     // 0.3%
            l2ReferralFeeBasisPoints: 30,      // 0.03%
            l3ReferralFeeBasisPoints: 20,      // 0.02%
            refereeDiscountBasisPoints: 100,   // 0.1%
            creatorFeeBasisPoints: 500         // 0.5%
        });
    }

    // =============================================================
    //                  BASIC FEE CALCULATIONS
    // =============================================================

    function test_calculateFees_NoReferral() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        // Total fee: 1.5% (no discount without referral)
        assertEq(breakdown.totalFee, (amount * 1500) / 100_000, "Total fee should be 1.5%");

        // No referral fees
        assertEq(breakdown.l1ReferralFee, 0, "No L1 referral fee");
        assertEq(breakdown.l2ReferralFee, 0, "No L2 referral fee");
        assertEq(breakdown.l3ReferralFee, 0, "No L3 referral fee");

        // Cashback: 0.05% (Wood tier)
        assertEq(breakdown.cashbackFee, (amount * 50) / 100_000, "Cashback should be 0.05%");

        // Creator fee: 0.5%
        assertEq(breakdown.creatorFee, (amount * 500) / 100_000, "Creator fee should be 0.5%");

        // Protocol fee: remainder
        uint256 expectedProtocol = breakdown.totalFee - breakdown.cashbackFee - breakdown.creatorFee;
        assertEq(breakdown.protocolFee, expectedProtocol, "Protocol fee should be remainder");

        // Net amount
        assertEq(breakdown.netAmount, amount - breakdown.totalFee, "Net amount should be after fees");
    }

    function test_calculateFees_WithL1Referral() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        // Total fee: 1.4% (with 0.1% discount)
        assertEq(breakdown.totalFee, (amount * 1400) / 100_000, "Total fee should be 1.4% with discount");

        // L1 referral fee: 0.3%
        assertEq(breakdown.l1ReferralFee, (amount * 300) / 100_000, "L1 referral fee should be 0.3%");
        assertEq(breakdown.l2ReferralFee, 0, "No L2 referral fee");
        assertEq(breakdown.l3ReferralFee, 0, "No L3 referral fee");

        // Cashback: 0.05% (Wood tier)
        assertEq(breakdown.cashbackFee, (amount * 50) / 100_000, "Cashback should be 0.05%");

        // Creator fee: 0.5%
        assertEq(breakdown.creatorFee, (amount * 500) / 100_000, "Creator fee should be 0.5%");

        // Protocol fee: remainder
        uint256 expectedProtocol = breakdown.totalFee
            - breakdown.l1ReferralFee
            - breakdown.cashbackFee
            - breakdown.creatorFee;
        assertEq(breakdown.protocolFee, expectedProtocol, "Protocol fee should be remainder");
    }

    function test_calculateFees_WithL1L2Referrals() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            L2_REFERRER,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        // Total fee: 1.4% (with discount)
        assertEq(breakdown.totalFee, (amount * 1400) / 100_000, "Total fee should be 1.4%");

        // Referral fees
        assertEq(breakdown.l1ReferralFee, (amount * 300) / 100_000, "L1 fee should be 0.3%");
        assertEq(breakdown.l2ReferralFee, (amount * 30) / 100_000, "L2 fee should be 0.03%");
        assertEq(breakdown.l3ReferralFee, 0, "No L3 referral fee");

        // Protocol fee: remainder
        uint256 expectedProtocol = breakdown.totalFee
            - breakdown.l1ReferralFee
            - breakdown.l2ReferralFee
            - breakdown.cashbackFee
            - breakdown.creatorFee;
        assertEq(breakdown.protocolFee, expectedProtocol, "Protocol fee should be remainder");
    }

    function test_calculateFees_WithAllReferrals() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            L2_REFERRER,
            L3_REFERRER,
            CashbackTier.Wood
        );

        // Total fee: 1.4% (with discount)
        assertEq(breakdown.totalFee, (amount * 1400) / 100_000, "Total fee should be 1.4%");

        // All referral fees
        assertEq(breakdown.l1ReferralFee, (amount * 300) / 100_000, "L1 fee should be 0.3%");
        assertEq(breakdown.l2ReferralFee, (amount * 30) / 100_000, "L2 fee should be 0.03%");
        assertEq(breakdown.l3ReferralFee, (amount * 20) / 100_000, "L3 fee should be 0.02%");

        // Protocol fee: remainder
        uint256 expectedProtocol = breakdown.totalFee
            - breakdown.l1ReferralFee
            - breakdown.l2ReferralFee
            - breakdown.l3ReferralFee
            - breakdown.cashbackFee
            - breakdown.creatorFee;
        assertEq(breakdown.protocolFee, expectedProtocol, "Protocol fee should be remainder");
    }

    // =============================================================
    //                  CASHBACK TIER TESTS
    // =============================================================

    function test_calculateFees_WoodTier() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        // Wood: 0.05% (50 bps)
        assertEq(breakdown.cashbackFee, (amount * 50) / 100_000, "Wood cashback should be 0.05%");
    }

    function test_calculateFees_BronzeTier() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Bronze
        );

        // Bronze: 0.10% (100 bps)
        assertEq(breakdown.cashbackFee, (amount * 100) / 100_000, "Bronze cashback should be 0.10%");
    }

    function test_calculateFees_ChampionTier() public {
        uint256 amount = 1 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Champion
        );

        // Champion: 0.25% (250 bps)
        assertEq(breakdown.cashbackFee, (amount * 250) / 100_000, "Champion cashback should be 0.25%");
    }

    // =============================================================
    //                  BUY/SELL FUNCTIONS
    // =============================================================

    function test_calculateBuyFees() public {
        uint256 quoteAmountIn = 10 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateBuyFees(
            defaultConfig,
            quoteAmountIn,
            L1_REFERRER,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Silver
        );

        // Should match regular fee calculation
        assertEq(breakdown.totalFee, (quoteAmountIn * 1400) / 100_000, "Buy fees should match");
        assertEq(breakdown.netAmount, quoteAmountIn - breakdown.totalFee, "Net amount correct");
    }

    function test_calculateSellFees() public {
        uint256 quoteAmountOut = 5 ether;

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateSellFees(
            defaultConfig,
            quoteAmountOut,
            L1_REFERRER,
            L2_REFERRER,
            ZERO_ADDRESS,
            CashbackTier.Gold
        );

        // Should match regular fee calculation
        assertEq(breakdown.totalFee, (quoteAmountOut * 1400) / 100_000, "Sell fees should match");
        assertEq(breakdown.netAmount, quoteAmountOut - breakdown.totalFee, "Net amount correct");
    }

    // =============================================================
    //                  FEE VALIDATION
    // =============================================================

    function test_validateFeeConfig_Valid() public {
        // Default config should be valid
        LibFeeCalculator.validateFeeConfig(defaultConfig);
        // If it doesn't revert, it's valid
        assertTrue(true, "Default config should be valid");
    }

    // Note: Validation tests removed as they're tested in integration tests
    // The validation function will be called during protocol initialization

    // =============================================================
    //                  EDGE CASES
    // =============================================================

    function test_calculateFees_ZeroAmount() public {
        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            0,
            L1_REFERRER,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        assertEq(breakdown.totalFee, 0, "Total fee should be 0");
        assertEq(breakdown.l1ReferralFee, 0, "L1 fee should be 0");
        assertEq(breakdown.cashbackFee, 0, "Cashback should be 0");
        assertEq(breakdown.creatorFee, 0, "Creator fee should be 0");
        assertEq(breakdown.protocolFee, 0, "Protocol fee should be 0");
        assertEq(breakdown.netAmount, 0, "Net amount should be 0");
    }

    function test_calculateFees_VerySmallAmount() public {
        uint256 amount = 1000 wei;  // Very small

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        // Should still calculate fees (might round to 0 for some components)
        assertGe(breakdown.netAmount, 0, "Net amount should be >= 0");
        assertLe(breakdown.netAmount, amount, "Net amount should be <= original");
    }

    function test_calculateFees_LargeAmount() public {
        uint256 amount = 1000 ether;  // Large trade

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            L2_REFERRER,
            L3_REFERRER,
            CashbackTier.Champion
        );

        // Total fee: 1.4%
        assertEq(breakdown.totalFee, (amount * 1400) / 100_000, "Total fee should be 1.4%");

        // Verify all fees sum correctly
        uint256 sumOfFees = breakdown.l1ReferralFee
            + breakdown.l2ReferralFee
            + breakdown.l3ReferralFee
            + breakdown.cashbackFee
            + breakdown.creatorFee
            + breakdown.protocolFee;

        assertEq(sumOfFees, breakdown.totalFee, "Sum of fees should equal total");
    }

    // =============================================================
    //                  FUZZ TESTS
    // =============================================================

    function testFuzz_calculateFees_SumCorrect(uint256 amount, uint8 tierIndex) public {
        // Bound inputs
        amount = bound(amount, 0.001 ether, 1000 ether);
        tierIndex = uint8(bound(tierIndex, 0, 6));  // 7 tiers (0-6)

        CashbackTier tier = CashbackTier(tierIndex);

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            L1_REFERRER,
            L2_REFERRER,
            L3_REFERRER,
            tier
        );

        // Verify sum of distributed fees equals total fee
        uint256 sumOfFees = breakdown.l1ReferralFee
            + breakdown.l2ReferralFee
            + breakdown.l3ReferralFee
            + breakdown.cashbackFee
            + breakdown.creatorFee
            + breakdown.protocolFee;

        assertEq(sumOfFees, breakdown.totalFee, "Sum of fees must equal total");

        // Verify net amount
        assertEq(breakdown.netAmount, amount - breakdown.totalFee, "Net amount must be correct");
    }

    function testFuzz_calculateFees_NoReferral(uint256 amount) public {
        amount = bound(amount, 0.001 ether, 1000 ether);

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            CashbackTier.Wood
        );

        // No referral fees
        assertEq(breakdown.l1ReferralFee, 0, "Should have no L1 fee");
        assertEq(breakdown.l2ReferralFee, 0, "Should have no L2 fee");
        assertEq(breakdown.l3ReferralFee, 0, "Should have no L3 fee");

        // Total fee should be 1.5% (no discount)
        uint256 expectedTotal = (amount * 1500) / 100_000;
        assertEq(breakdown.totalFee, expectedTotal, "Total fee should be 1.5%");
    }

    function testFuzz_calculateFees_ProtocolFeeNeverNegative(
        uint256 amount,
        bool hasL1,
        bool hasL2,
        bool hasL3,
        uint8 tierIndex
    ) public {
        amount = bound(amount, 0.001 ether, 1000 ether);
        tierIndex = uint8(bound(tierIndex, 0, 6));

        CashbackTier tier = CashbackTier(tierIndex);

        FeeBreakdown memory breakdown = LibFeeCalculator.calculateFees(
            defaultConfig,
            amount,
            hasL1 ? L1_REFERRER : ZERO_ADDRESS,
            hasL2 ? L2_REFERRER : ZERO_ADDRESS,
            hasL3 ? L3_REFERRER : ZERO_ADDRESS,
            tier
        );

        // Protocol fee should never be negative (would underflow)
        // If this doesn't revert, it means protocol fee is >= 0
        assertGe(breakdown.protocolFee, 0, "Protocol fee should never be negative");

        // Verify it's part of the total
        assertLe(breakdown.protocolFee, breakdown.totalFee, "Protocol fee should be <= total");
    }
}
