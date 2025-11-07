// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LibBondingCurve} from "./libraries/LibBondingCurve.sol";
import {LibFeeCalculator} from "./libraries/LibFeeCalculator.sol";
import {KimchiFactory} from "./KimchiFactory.sol";
import {
    Config,
    BondingCurve,
    FeeConfig,
    FeeBreakdown,
    CashbackTier
} from "./storage/AppStorage.sol";

/**
 * @title KimchiAMM
 * @notice AMM contract for trading tokens on bonding curves
 * @dev Handles buy/sell operations, referrals, and fee claiming
 */
contract KimchiAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Storage ============

    /// @notice Factory contract reference
    KimchiFactory public immutable FACTORY;

    /// @notice Referral links: user => referrer
    mapping(address => address) public referrals;

    // ============ Events ============

    event TokensPurchased(
        address indexed buyer,
        address indexed baseToken,
        uint256 quoteAmountIn,
        uint256 baseAmountOut,
        uint256 protocolFee,
        uint256 creatorFee,
        bool curveCompleted
    );

    event TokensSold(
        address indexed seller,
        address indexed baseToken,
        uint256 baseAmountIn,
        uint256 quoteAmountOut,
        uint256 protocolFee,
        uint256 creatorFee
    );

    event ReferrerSet(address indexed user, address indexed referrer);
    event ProtocolFeeClaimed(address indexed baseToken, address indexed claimer, uint256 amount);
    event CreatorFeeClaimed(address indexed baseToken, address indexed creator, uint256 amount);

    // ============ Errors ============

    error CurveNotFound();
    error InsufficientOutput();
    error InvalidAmount();
    error NotFeeClaimer();
    error NotCreator();
    error NoFeesToClaim();
    error ReferrerAlreadySet();
    error CannotReferSelf();
    error InvalidReferrer();

    // ============ Constructor ============

    constructor(address _factory) {
        FACTORY = KimchiFactory(_factory);
    }

    // ============ Helper Functions ============

    /// @notice Helper to get only required buy parameters
    function _getBuyParams(address baseToken)
        internal
        view
        returns (
            uint256 virtualQuoteReserve,
            uint256 virtualBaseReserve,
            uint256 baseReserve,
            uint256 migrationBaseThreshold,
            address quoteToken,
            FeeConfig memory feeConfig
        )
    {
        BondingCurve memory curve = FACTORY.getCurve(baseToken);
        LibBondingCurve.enforceNotCompleted(curve.migrationStatus);
        Config memory config = FACTORY.getConfig();

        feeConfig = FeeConfig({
            feeBasisPoints: config.feeBasisPoints,
            l1ReferralFeeBasisPoints: config.l1ReferralFeeBasisPoints,
            l2ReferralFeeBasisPoints: config.l2ReferralFeeBasisPoints,
            l3ReferralFeeBasisPoints: config.l3ReferralFeeBasisPoints,
            refereeDiscountBasisPoints: config.refereeDiscountBasisPoints,
            creatorFeeBasisPoints: config.creatorFeeBasisPoints
        });

        return (
            curve.virtualQuoteReserve,
            curve.virtualBaseReserve,
            curve.baseReserve,
            config.migrationBaseThreshold,
            config.quoteToken,
            feeConfig
        );
    }

    /// @notice Helper to get only required sell parameters
    function _getSellParams(address baseToken)
        internal
        view
        returns (
            uint256 virtualQuoteReserve,
            uint256 virtualBaseReserve,
            address quoteToken,
            FeeConfig memory feeConfig
        )
    {
        BondingCurve memory curve = FACTORY.getCurve(baseToken);
        LibBondingCurve.enforceNotCompleted(curve.migrationStatus);
        Config memory config = FACTORY.getConfig();

        feeConfig = FeeConfig({
            feeBasisPoints: config.feeBasisPoints,
            l1ReferralFeeBasisPoints: config.l1ReferralFeeBasisPoints,
            l2ReferralFeeBasisPoints: config.l2ReferralFeeBasisPoints,
            l3ReferralFeeBasisPoints: config.l3ReferralFeeBasisPoints,
            refereeDiscountBasisPoints: config.refereeDiscountBasisPoints,
            creatorFeeBasisPoints: config.creatorFeeBasisPoints
        });

        return (
            curve.virtualQuoteReserve,
            curve.virtualBaseReserve,
            config.quoteToken,
            feeConfig
        );
    }

    // ============ Swap Functions ============

    /// @notice Buy tokens with WETH
    function buyTokens(address baseToken, uint256 quoteAmountIn, uint256 minBaseAmountOut)
        external
        nonReentrant
        returns (uint256 baseAmountOut)
    {
        if (quoteAmountIn == 0) revert InvalidAmount();
        if (!FACTORY.curveExists(baseToken)) revert CurveNotFound();

        // Get only the required parameters
        (
            uint256 virtualQuoteReserve,
            uint256 virtualBaseReserve,
            uint256 baseReserve,
            uint256 migrationBaseThreshold,
            address quoteToken,
            FeeConfig memory feeConfig
        ) = _getBuyParams(baseToken);

        (address l1, address l2, address l3) = getReferralChain(msg.sender);

        // Calculate fees using the simplified fee config
        FeeBreakdown memory fees = LibFeeCalculator.calculateBuyFees(feeConfig, quoteAmountIn, l1, l2, l3, CashbackTier.Wood);

        uint256 swapOutput = LibBondingCurve.calculateBuy(virtualQuoteReserve, virtualBaseReserve, fees.netAmount);

        bool willComplete = LibBondingCurve.isCurveComplete(baseReserve - swapOutput, migrationBaseThreshold);

        uint256 actualQuoteIn = quoteAmountIn;
        if (willComplete) {
            (actualQuoteIn, baseAmountOut) = LibBondingCurve.calculateCappedBuy(
                virtualQuoteReserve,
                virtualBaseReserve,
                baseReserve,
                migrationBaseThreshold,
                fees.netAmount
            );
            FACTORY.graduateCurve(baseToken);
        } else {
            baseAmountOut = swapOutput;
        }

        if (baseAmountOut < minBaseAmountOut) revert InsufficientOutput();

        IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), actualQuoteIn);
        _distributeFees(fees, l1, l2, l3, quoteToken);

        FACTORY.updateCurveAfterBuy(baseToken, [fees.netAmount, baseAmountOut, fees.protocolFee, fees.creatorFee]);
        IERC20(baseToken).safeTransfer(msg.sender, baseAmountOut);

        emit TokensPurchased(msg.sender, baseToken, actualQuoteIn, baseAmountOut, fees.protocolFee, fees.creatorFee, willComplete);
    }

    /// @notice Sell tokens for WETH
    function sellTokens(address baseToken, uint256 baseAmountIn, uint256 minQuoteAmountOut)
        external
        nonReentrant
        returns (uint256 quoteAmountOut)
    {
        if (baseAmountIn == 0) revert InvalidAmount();
        if (!FACTORY.curveExists(baseToken)) revert CurveNotFound();

        // Get only the required parameters
        (
            uint256 virtualQuoteReserve,
            uint256 virtualBaseReserve,
            address quoteToken,
            FeeConfig memory feeConfig
        ) = _getSellParams(baseToken);

        (address l1, address l2, address l3) = getReferralChain(msg.sender);

        uint256 quoteBeforeFees = LibBondingCurve.calculateSell(virtualQuoteReserve, virtualBaseReserve, baseAmountIn);

        // Calculate fees using the simplified fee config
        FeeBreakdown memory fees = LibFeeCalculator.calculateSellFees(feeConfig, quoteBeforeFees, l1, l2, l3, CashbackTier.Wood);

        quoteAmountOut = fees.netAmount;
        if (quoteAmountOut < minQuoteAmountOut) revert InsufficientOutput();

        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), baseAmountIn);
        _distributeFees(fees, l1, l2, l3, quoteToken);

        FACTORY.updateCurveAfterSell(baseToken, [baseAmountIn, quoteBeforeFees, fees.protocolFee, fees.creatorFee]);
        IERC20(quoteToken).safeTransfer(msg.sender, quoteAmountOut);

        emit TokensSold(msg.sender, baseToken, baseAmountIn, quoteAmountOut, fees.protocolFee, fees.creatorFee);
    }

    // ============ Referral Functions ============

    function setReferrer(address referrer) external {
        if (referrals[msg.sender] != address(0)) revert ReferrerAlreadySet();
        if (referrer == msg.sender) revert CannotReferSelf();
        if (referrer == address(0)) revert InvalidReferrer();

        referrals[msg.sender] = referrer;
        emit ReferrerSet(msg.sender, referrer);
    }

    function getReferrer(address user) external view returns (address) {
        return referrals[user];
    }

    function getReferralChain(address user) public view returns (address l1, address l2, address l3) {
        l1 = referrals[user];
        if (l1 != address(0)) {
            l2 = referrals[l1];
            if (l2 != address(0)) {
                l3 = referrals[l2];
            }
        }
    }

    // ============ Fee Functions ============

    function claimProtocolFee(address baseToken) external nonReentrant {
        Config memory config = FACTORY.getConfig();
        if (msg.sender != config.feeClaimer) revert NotFeeClaimer();
        if (!FACTORY.curveExists(baseToken)) revert CurveNotFound();

        BondingCurve memory curve = FACTORY.getCurve(baseToken);
        uint256 feeAmount = curve.protocolFee;
        if (feeAmount == 0) revert NoFeesToClaim();

        FACTORY.resetProtocolFee(baseToken);
        IERC20(config.quoteToken).safeTransfer(msg.sender, feeAmount);

        emit ProtocolFeeClaimed(baseToken, msg.sender, feeAmount);
    }

    function claimCreatorFee(address baseToken) external nonReentrant {
        if (!FACTORY.curveExists(baseToken)) revert CurveNotFound();

        BondingCurve memory curve = FACTORY.getCurve(baseToken);
        if (msg.sender != curve.creator) revert NotCreator();

        uint256 feeAmount = curve.creatorFee;
        if (feeAmount == 0) revert NoFeesToClaim();

        Config memory config = FACTORY.getConfig();
        FACTORY.resetCreatorFee(baseToken);
        IERC20(config.quoteToken).safeTransfer(msg.sender, feeAmount);

        emit CreatorFeeClaimed(baseToken, msg.sender, feeAmount);
    }

    // ============ Internal Functions ============

    function _distributeFees(
        FeeBreakdown memory fees,
        address l1,
        address l2,
        address l3,
        address quoteToken
    ) internal {
        IERC20 token = IERC20(quoteToken);

        if (l1 != address(0) && fees.l1ReferralFee > 0) token.safeTransfer(l1, fees.l1ReferralFee);
        if (l2 != address(0) && fees.l2ReferralFee > 0) token.safeTransfer(l2, fees.l2ReferralFee);
        if (l3 != address(0) && fees.l3ReferralFee > 0) token.safeTransfer(l3, fees.l3ReferralFee);

        if (fees.cashbackFee > 0) {
            address cashback = FACTORY.cashbackContract();
            if (cashback != address(0)) token.safeTransfer(cashback, fees.cashbackFee);
        }
    }
}
