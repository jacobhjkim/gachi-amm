// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockWETH} from "./MockWETH.sol";
import {KimchiFactory} from "../../src/KimchiFactory.sol";
import {KimchiAMM} from "../../src/KimchiAMM.sol";
import {KimchiCashback} from "../../src/KimchiCashback.sol";
import {KimchiToken} from "../../src/tokens/KimchiToken.sol";
import {BondingCurve, Config, CashbackTier} from "../../src/storage/AppStorage.sol";

/**
 * @title TestHelpers
 * @notice Common utilities and helpers for all tests
 */
abstract contract TestHelpers is Test {
    // Default test addresses
    address public constant ADMIN = address(0x1);
    address public constant FEE_CLAIMER = address(0x2);
    address public constant CREATOR = address(0x3);
    address public constant ALICE = address(0x4);
    address public constant BOB = address(0x5);
    address public constant CHARLIE = address(0x6);
    address public constant DAVE = address(0x7);

    // Default test amounts
    uint256 public constant INITIAL_WETH_BALANCE = 1000 ether;
    uint256 public constant DEFAULT_BUY_AMOUNT = 1 ether;
    uint256 public constant DEFAULT_SELL_AMOUNT = 1_000_000_000; // 1M tokens (6 decimals)

    /**
     * @notice Setup a user with WETH balance and approval
     */
    function setupUserWithWETH(
        address user,
        MockWETH weth,
        KimchiAMM amm,
        uint256 amount
    ) internal {
        vm.deal(user, amount);
        vm.startPrank(user);
        weth.deposit{value: amount}();
        weth.approve(address(amm), type(uint256).max);
        vm.stopPrank();
    }

    /**
     * @notice Setup multiple users with WETH
     */
    function setupUsersWithWETH(
        address[] memory users,
        MockWETH weth,
        KimchiAMM amm,
        uint256 amountEach
    ) internal {
        for (uint256 i = 0; i < users.length; i++) {
            setupUserWithWETH(users[i], weth, amm, amountEach);
        }
    }

    /**
     * @notice Create a referral chain: user -> l1 -> l2 -> l3
     */
    function setupReferralChain(
        KimchiAMM amm,
        address user,
        address l1,
        address l2,
        address l3
    ) internal {
        // L3 has no referrer
        // L2 refers to L3
        vm.prank(l2);
        amm.setReferrer(l3);

        // L1 refers to L2
        vm.prank(l1);
        amm.setReferrer(l2);

        // User refers to L1
        vm.prank(user);
        amm.setReferrer(l1);
    }

    /**
     * @notice Deploy and initialize the full protocol
     */
    function deployProtocol() internal returns (
        MockWETH weth,
        KimchiFactory factory,
        KimchiAMM amm,
        KimchiCashback cashback
    ) {
        // Deploy WETH
        weth = new MockWETH();

        // Deploy Factory (no constructor args, owner is msg.sender)
        factory = new KimchiFactory();

        // Deploy AMM (needs factory address)
        amm = new KimchiAMM(address(factory));

        // Deploy Cashback (needs quote token address)
        cashback = new KimchiCashback(address(weth));

        // Initialize Factory config
        factory.initializeConfig(FEE_CLAIMER, address(weth));

        // Link contracts
        factory.setCashbackContract(address(cashback));
        factory.setAmmContract(address(amm));
        cashback.setAmmContract(address(amm));

        return (weth, factory, amm, cashback);
    }

    /**
     * @notice Create a token and return its address
     */
    function createToken(
        KimchiFactory factory,
        string memory name,
        string memory symbol,
        bytes32 salt
    ) internal returns (address) {
        vm.prank(CREATOR);
        return factory.createCurve(name, symbol, salt);
    }

    /**
     * @notice Calculate expected buy output using bonding curve formula
     * @dev Uses the same logic as LibBondingCurve.calculateBuy
     */
    function calculateExpectedBuyOutput(
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve,
        uint256 amountIn
    ) internal pure returns (uint256) {
        uint256 k = virtualQuoteReserve * virtualBaseReserve * 1000;
        uint256 newVirtualQuoteReserve = virtualQuoteReserve + amountIn;
        uint256 newVirtualBaseReserveScaled = k / newVirtualQuoteReserve;
        uint256 newVirtualBaseReserve = newVirtualBaseReserveScaled / 1000;

        return virtualBaseReserve - newVirtualBaseReserve;
    }

    /**
     * @notice Calculate expected sell output using bonding curve formula
     * @dev Uses the same logic as LibBondingCurve.calculateSell
     */
    function calculateExpectedSellOutput(
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve,
        uint256 amountIn
    ) internal pure returns (uint256) {
        uint256 k = virtualQuoteReserve * virtualBaseReserve * 1000;
        uint256 newVirtualBaseReserveScaled = (virtualBaseReserve + amountIn) * 1000;
        uint256 newVirtualQuoteReserve = k / newVirtualBaseReserveScaled;

        return virtualQuoteReserve - newVirtualQuoteReserve;
    }

    /**
     * @notice Get current price from curve
     */
    function getCurrentPrice(
        uint256 virtualQuoteReserve,
        uint256 virtualBaseReserve
    ) internal pure returns (uint256) {
        return (virtualQuoteReserve * 1e18) / (virtualBaseReserve / 1000);
    }

    /**
     * @notice Check if curve has reached graduation threshold
     */
    function isCurveComplete(
        uint256 baseReserve,
        uint256 migrationThreshold
    ) internal pure returns (bool) {
        return baseReserve <= migrationThreshold;
    }

    // Note: assertApproxEqAbs is already provided by forge-std/Test.sol

    /**
     * @notice Get cashback basis points for a tier
     */
    function getCashbackBasisPoints(CashbackTier tier) internal pure returns (uint16) {
        if (tier == CashbackTier.Wood) return 50;
        if (tier == CashbackTier.Bronze) return 100;
        if (tier == CashbackTier.Silver) return 125;
        if (tier == CashbackTier.Gold) return 150;
        if (tier == CashbackTier.Platinum) return 175;
        if (tier == CashbackTier.Diamond) return 200;
        if (tier == CashbackTier.Champion) return 250;
        return 0;
    }

    /**
     * @notice Calculate total fee amount
     */
    function calculateTotalFee(
        uint256 amount,
        uint16 feeBasisPoints,
        bool hasReferrer,
        uint16 refereeDiscountBps
    ) internal pure returns (uint256) {
        uint256 effectiveFee = hasReferrer
            ? feeBasisPoints - refereeDiscountBps
            : feeBasisPoints;
        return (amount * effectiveFee) / 100_000;
    }

    /**
     * @notice Skip forward in time (for cooldowns)
     */
    function skipTime(uint256 duration) internal {
        vm.warp(block.timestamp + duration);
    }

    /**
     * @notice Skip forward in time by days
     */
    function skipDays(uint256 numDays) internal {
        skipTime(numDays * 1 days);
    }

    /**
     * @notice Helper to get curve data from factory
     */
    function getCurve(
        KimchiFactory factory,
        address token
    ) internal view returns (BondingCurve memory) {
        return factory.getCurve(token);
    }

    /**
     * @notice Helper to get config from factory
     */
    function getConfig(KimchiFactory factory) internal view returns (Config memory) {
        return factory.getConfig();
    }

    /**
     * @notice Calculate net amount after fees (for buy)
     */
    function calculateNetAmountForSwap(
        uint256 amountIn,
        uint256 totalFee
    ) internal pure returns (uint256) {
        return amountIn - totalFee;
    }

    /**
     * @notice Approve token for AMM
     */
    function approveToken(
        address user,
        address token,
        address spender,
        uint256 amount
    ) internal {
        vm.prank(user);
        KimchiToken(token).approve(spender, amount);
    }
}
