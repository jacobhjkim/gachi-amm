// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FeeConfig, FeeBreakdown, CashbackTier, Constants} from "../storage/AppStorage.sol";
import {LibCashback} from "./LibCashback.sol";

/**
 * @title LibFeeCalculator
 * @notice Library for calculating fee distribution
 * @dev Handles referral fees, cashback, creator fees, and protocol fees
 */
library LibFeeCalculator {
    /// @notice Calculate fee breakdown for a trade
    /// @param feeConfig Fee configuration
    /// @param amount The trade amount (quote token)
    /// @param l1Referrer Level 1 referrer address
    /// @param l2Referrer Level 2 referrer address
    /// @param l3Referrer Level 3 referrer address
    /// @param cashbackTier User's cashback tier
    /// @return breakdown Fee breakdown struct
    function calculateFees(
        FeeConfig memory feeConfig,
        uint256 amount,
        address l1Referrer,
        address l2Referrer,
        address l3Referrer,
        CashbackTier cashbackTier
    ) internal pure returns (FeeBreakdown memory breakdown) {
        // Check if user has any referral
        bool hasReferral = l1Referrer != address(0) || l2Referrer != address(0) || l3Referrer != address(0);

        // Calculate effective fee basis points (with discount if referred)
        uint16 effectiveFeeBps = hasReferral
            ? feeConfig.feeBasisPoints - feeConfig.refereeDiscountBasisPoints
            : feeConfig.feeBasisPoints;

        // Calculate total fee
        breakdown.totalFee = (amount * effectiveFeeBps) / Constants.FEE_DENOMINATOR;

        // Calculate referral fees (always based on original amount, not discounted)
        if (l1Referrer != address(0)) {
            breakdown.l1ReferralFee = (amount * feeConfig.l1ReferralFeeBasisPoints) / Constants.FEE_DENOMINATOR;
        }
        if (l2Referrer != address(0)) {
            breakdown.l2ReferralFee = (amount * feeConfig.l2ReferralFeeBasisPoints) / Constants.FEE_DENOMINATOR;
        }
        if (l3Referrer != address(0)) {
            breakdown.l3ReferralFee = (amount * feeConfig.l3ReferralFeeBasisPoints) / Constants.FEE_DENOMINATOR;
        }

        // Calculate cashback fee
        uint16 cashbackBps = LibCashback.getTierBasisPoints(cashbackTier);
        breakdown.cashbackFee = (amount * cashbackBps) / Constants.FEE_DENOMINATOR;

        // Calculate creator fee
        breakdown.creatorFee = (amount * feeConfig.creatorFeeBasisPoints) / Constants.FEE_DENOMINATOR;

        // Protocol fee is the remainder
        breakdown.protocolFee = breakdown.totalFee
            - (breakdown.l1ReferralFee + breakdown.l2ReferralFee + breakdown.l3ReferralFee)
            - breakdown.cashbackFee - breakdown.creatorFee;

        // Net amount after fees
        breakdown.netAmount = amount - breakdown.totalFee;
    }

    /// @notice Calculate fees for buy operations (fees taken from input quote)
    /// @param feeConfig Fee configuration
    /// @param quoteAmountIn Quote token input amount
    /// @param l1Referrer Level 1 referrer
    /// @param l2Referrer Level 2 referrer
    /// @param l3Referrer Level 3 referrer
    /// @param cashbackTier User's cashback tier
    /// @return breakdown Fee breakdown
    function calculateBuyFees(
        FeeConfig memory feeConfig,
        uint256 quoteAmountIn,
        address l1Referrer,
        address l2Referrer,
        address l3Referrer,
        CashbackTier cashbackTier
    ) internal pure returns (FeeBreakdown memory breakdown) {
        return calculateFees(feeConfig, quoteAmountIn, l1Referrer, l2Referrer, l3Referrer, cashbackTier);
    }

    /// @notice Calculate fees for sell operations (fees taken from output quote)
    /// @param feeConfig Fee configuration
    /// @param quoteAmountOut Quote token output amount (before fees)
    /// @param l1Referrer Level 1 referrer
    /// @param l2Referrer Level 2 referrer
    /// @param l3Referrer Level 3 referrer
    /// @param cashbackTier User's cashback tier
    /// @return breakdown Fee breakdown
    function calculateSellFees(
        FeeConfig memory feeConfig,
        uint256 quoteAmountOut,
        address l1Referrer,
        address l2Referrer,
        address l3Referrer,
        CashbackTier cashbackTier
    ) internal pure returns (FeeBreakdown memory breakdown) {
        return calculateFees(feeConfig, quoteAmountOut, l1Referrer, l2Referrer, l3Referrer, cashbackTier);
    }

    /// @notice Validate fee configuration
    /// @param feeConfig Fee configuration
    function validateFeeConfig(FeeConfig memory feeConfig) internal pure {
        // Ensure total referral fees + creator fee + max cashback < total fee
        uint256 maxDistributedFees = uint256(feeConfig.l1ReferralFeeBasisPoints)
            + uint256(feeConfig.l2ReferralFeeBasisPoints) + uint256(feeConfig.l3ReferralFeeBasisPoints)
            + uint256(feeConfig.creatorFeeBasisPoints) + uint256(LibCashback.getMaxCashbackBasisPoints());

        require(
            maxDistributedFees < feeConfig.feeBasisPoints,
            "LibFeeCalculator: Distributed fees exceed total fee"
        );

        // Ensure referral hierarchy: L1 > L2 > L3
        require(
            feeConfig.l1ReferralFeeBasisPoints > feeConfig.l2ReferralFeeBasisPoints,
            "LibFeeCalculator: L1 must be greater than L2"
        );
        require(
            feeConfig.l2ReferralFeeBasisPoints > feeConfig.l3ReferralFeeBasisPoints,
            "LibFeeCalculator: L2 must be greater than L3"
        );

        // Ensure creator fee is reasonable (≤ 1%)
        require(
            feeConfig.creatorFeeBasisPoints <= 1000,
            "LibFeeCalculator: Creator fee too high"
        );

        // Ensure discount is less than total fee
        require(
            feeConfig.refereeDiscountBasisPoints < feeConfig.feeBasisPoints,
            "LibFeeCalculator: Discount exceeds total fee"
        );
    }
}
