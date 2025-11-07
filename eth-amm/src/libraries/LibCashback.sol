// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CashbackTier} from "../storage/AppStorage.sol";

/**
 * @title LibCashback
 * @notice Library for cashback tier calculations
 * @dev Maps cashback tiers to their respective reward percentages
 */
library LibCashback {
    /// @notice Get the basis points for a given cashback tier
    /// @param tier The cashback tier
    /// @return Basis points (1 bp = 0.01%)
    function getTierBasisPoints(CashbackTier tier) internal pure returns (uint16) {
        if (tier == CashbackTier.Wood) return 50;        // 0.05%
        if (tier == CashbackTier.Bronze) return 100;     // 0.10%
        if (tier == CashbackTier.Silver) return 125;     // 0.125%
        if (tier == CashbackTier.Gold) return 150;       // 0.15%
        if (tier == CashbackTier.Platinum) return 175;   // 0.175%
        if (tier == CashbackTier.Diamond) return 200;    // 0.20%
        if (tier == CashbackTier.Champion) return 250;   // 0.25%
        return 0;
    }

    /// @notice Get the maximum cashback basis points across all tiers
    /// @return Maximum basis points (Champion tier: 250 bps = 0.25%)
    function getMaxCashbackBasisPoints() internal pure returns (uint16) {
        return 250;
    }
}
