pragma solidity ^0.8.30;

import {IPumpReward} from "./interfaces/IPumpReward.sol";
import {IPumpFactory} from "./interfaces/IPumpFactory.sol";
import {PumpCurve} from "./PumpCurve.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract PumpReward is IPumpReward, Ownable2Step, ReentrancyGuard {
    // ============ Constants ============

    /// @notice Maximum basis points (100%)
    uint256 private constant MAX_BASIS_POINTS = 10_000;

    /// @notice Cooldown period for claiming rewards (1 week)
    uint256 private constant CLAIM_COOLDOWN = 1 weeks;

    // ============ Storage ============

    /// @notice The factory that deployed this reward contract
    address public immutable factory;

    /// @notice The quote token used for all trading pairs (USDC)
    address public immutable quoteToken;

    /// @notice Internal storage for fee configuration
    FeeConfig private _feeConfig;

    /// @notice User reward accounts
    mapping(address => UserReward) private accounts;

    /// @notice Referral links: user => referrer (L1)
    mapping(address => address) public referrals;

    /// @notice Tier configurations (7 tiers: Wood to Champion)
    Tier[] private tiers;

    /// @notice Accumulated protocol fees (in quote tokens)
    uint256 private _accumulatedProtocolFees;

    constructor(address _factory, address _quoteToken) Ownable(msg.sender) {
        require(_factory != address(0), "Invalid factory");
        require(_quoteToken != address(0), "Invalid quote token");
        factory = _factory;
        quoteToken = _quoteToken;

        // Initialize default fees
        // Total fee: 1.5%, Creator: 0.5%, L1: 0.3%, L2: 0.03%, L3: 0.02%, Referee discount: 0.1%
        _feeConfig = FeeConfig({
            feeBasisPoints: 150, // 1.5%
            creatorFeeBasisPoints: 50, // 0.5%
            l1ReferralFeeBasisPoints: 30, // 0.3%
            l2ReferralFeeBasisPoints: 3, // 0.03%
            l3ReferralFeeBasisPoints: 2, // 0.02%
            refereeDiscountBasisPoints: 10 // 0.1%
        });

        emit FeesUpdated(
            _feeConfig.feeBasisPoints,
            _feeConfig.creatorFeeBasisPoints,
            _feeConfig.l1ReferralFeeBasisPoints,
            _feeConfig.l2ReferralFeeBasisPoints,
            _feeConfig.l3ReferralFeeBasisPoints,
            _feeConfig.refereeDiscountBasisPoints
        );

        // Initialize 7-tier cashback system with USDC amounts (6 decimals)
        // Tier 0: Wood - 0 volume, 0.05% cashback
        tiers.push(Tier({volumeThreshold: 0, cashbackBasisPoints: 5}));

        // Tier 1: Bronze - 10,000 USDC, 0.08% cashback
        tiers.push(Tier({volumeThreshold: 10_000 * 10 ** 6, cashbackBasisPoints: 8}));

        // Tier 2: Silver - 50,000 USDC, 0.12% cashback
        tiers.push(Tier({volumeThreshold: 50_000 * 10 ** 6, cashbackBasisPoints: 12}));

        // Tier 3: Gold - 250,000 USDC, 0.15% cashback
        tiers.push(Tier({volumeThreshold: 250_000 * 10 ** 6, cashbackBasisPoints: 15}));

        // Tier 4: Platinum - 1,000,000 USDC, 0.18% cashback
        tiers.push(Tier({volumeThreshold: 1_000_000 * 10 ** 6, cashbackBasisPoints: 18}));

        // Tier 5: Diamond - 5,000,000 USDC, 0.22% cashback
        tiers.push(Tier({volumeThreshold: 5_000_000 * 10 ** 6, cashbackBasisPoints: 22}));

        // Tier 6: Champion - 25,000,000 USDC, 0.25% cashback
        tiers.push(Tier({volumeThreshold: 25_000_000 * 10 ** 6, cashbackBasisPoints: 25}));
    }

    // ============ View Functions ============

    /// @inheritdoc IPumpReward
    function feeConfig() external view override returns (FeeConfig memory) {
        return _feeConfig;
    }

    /// @inheritdoc IPumpReward
    function getUserReward(address user) external view returns (UserReward memory) {
        return accounts[user];
    }

    /// @inheritdoc IPumpReward
    function getReferrer(address user) external view returns (address) {
        return referrals[user];
    }

    /// @inheritdoc IPumpReward
    function getReferralChain(address user) external view returns (address l1, address l2, address l3) {
        l1 = referrals[user];
        if (l1 != address(0)) {
            l2 = referrals[l1];
            if (l2 != address(0)) {
                l3 = referrals[l2];
            }
        }
        return (l1, l2, l3);
    }

    /// @inheritdoc IPumpReward
    function getTier(uint8 tierIndex) external view returns (Tier memory) {
        require(tierIndex < tiers.length, "Invalid tier index");
        return tiers[tierIndex];
    }

    /// @inheritdoc IPumpReward
    function getTierCount() external view returns (uint256) {
        return tiers.length;
    }

    /// @inheritdoc IPumpReward
    function getCurrentTier(address user) external view returns (uint8) {
        return _calculateTier(accounts[user].totalVolume);
    }

    /// @inheritdoc IPumpReward
    function accumulatedProtocolFees() external view returns (uint256) {
        return _accumulatedProtocolFees;
    }

    // ============ User Functions ============

    /// @inheritdoc IPumpReward
    function setReferrer(address referrer) external {
        // Cannot set referrer to self
        if (referrer == msg.sender) revert InvalidReferrer();

        // Cannot set referrer to zero address
        if (referrer == address(0)) revert InvalidReferrer();

        // Can only set referrer once
        if (referrals[msg.sender] != address(0)) revert ReferrerAlreadySet();

        // Check for circular referral (prevent msg.sender from being in referrer's chain)
        address current = referrer;
        for (uint256 i = 0; i < 3; i++) {
            if (current == address(0)) break;
            if (current == msg.sender) revert CircularReferral();
            current = referrals[current];
        }

        referrals[msg.sender] = referrer;
        emit ReferralSet(msg.sender, referrer);
    }

    /// @inheritdoc IPumpReward
    function claimCashback() external nonReentrant returns (uint256 amount) {
        UserReward storage account = accounts[msg.sender];

        // Check cooldown
        if (block.timestamp < account.lastClaimTimestamp + CLAIM_COOLDOWN) {
            revert ClaimCooldownActive();
        }

        amount = account.accumulatedCashback;

        if (amount == 0) revert NothingToClaim();

        account.accumulatedCashback = 0;
        account.lastClaimTimestamp = block.timestamp;

        require(IERC20(quoteToken).transfer(msg.sender, amount), "USDC transfer failed");

        emit CashbackClaimed(msg.sender, amount);
        return amount;
    }

    /// @inheritdoc IPumpReward
    function claimReferral() external nonReentrant returns (uint256 amount) {
        UserReward storage account = accounts[msg.sender];

        // Check cooldown
        if (block.timestamp < account.lastClaimTimestamp + CLAIM_COOLDOWN) {
            revert ClaimCooldownActive();
        }

        amount = account.accumulatedReferral;

        if (amount == 0) revert NothingToClaim();

        account.accumulatedReferral = 0;
        account.lastClaimTimestamp = block.timestamp;

        require(IERC20(quoteToken).transfer(msg.sender, amount), "USDC transfer failed");

        emit ReferralClaimed(msg.sender, amount);
        return amount;
    }

    /// @inheritdoc IPumpReward
    function claimCreatorFeeCashbackAndReferral()
        external
        nonReentrant
        returns (uint256 creatorFeeAmount, uint256 cashbackAmount, uint256 referralAmount)
    {
        UserReward storage account = accounts[msg.sender];

        // Check cooldown
        if (block.timestamp < account.lastClaimTimestamp + CLAIM_COOLDOWN) {
            revert ClaimCooldownActive();
        }

        creatorFeeAmount = account.accumulatedCreatorFee;
        cashbackAmount = account.accumulatedCashback;
        referralAmount = account.accumulatedReferral;

        if (creatorFeeAmount == 0 && cashbackAmount == 0 && referralAmount == 0) {
            revert NothingToClaim();
        }

        account.accumulatedCreatorFee = 0;
        account.accumulatedCashback = 0;
        account.accumulatedReferral = 0;
        account.lastClaimTimestamp = block.timestamp;

        uint256 totalAmount = creatorFeeAmount + cashbackAmount + referralAmount;
        require(IERC20(quoteToken).transfer(msg.sender, totalAmount), "USDC transfer failed");

        if (creatorFeeAmount > 0) {
            emit CreatorFeeClaimed(msg.sender, creatorFeeAmount);
        }
        if (cashbackAmount > 0) {
            emit CashbackClaimed(msg.sender, cashbackAmount);
        }
        if (referralAmount > 0) {
            emit ReferralClaimed(msg.sender, referralAmount);
        }

        return (creatorFeeAmount, cashbackAmount, referralAmount);
    }

    // ============ Curve Functions ============

    /// @inheritdoc IPumpReward
    function calculateFees(address user, uint256 tradeAmount)
        external
        view
        override
        returns (
            uint256 totalFee,
            uint256 protocolFee,
            uint256 creatorFee,
            uint256 cashbackFee,
            uint256 l1ReferralFee,
            uint256 l2ReferralFee,
            uint256 l3ReferralFee
        )
    {
        // Get referral chain to determine if user has referrals (affects total fee via discount)
        (address l1, address l2, address l3) = this.getReferralChain(user);
        bool hasReferral = l1 != address(0);

        // Calculate total fee first with referee discount if applicable
        // Round UP: user pays slightly more (protocol favored)
        uint256 effectiveFeeRate =
            hasReferral ? _feeConfig.feeBasisPoints - _feeConfig.refereeDiscountBasisPoints : _feeConfig.feeBasisPoints;

        totalFee = Math.mulDiv(tradeAmount, effectiveFeeRate, MAX_BASIS_POINTS, Math.Rounding.Ceil);

        // Calculate individual fee components as percentages of totalFee
        // Round DOWN: ensures sum of components won't exceed totalFee
        l1ReferralFee = l1 != address(0)
            ? Math.mulDiv(totalFee, _feeConfig.l1ReferralFeeBasisPoints, _feeConfig.feeBasisPoints, Math.Rounding.Floor)
            : 0;
        l2ReferralFee = l2 != address(0)
            ? Math.mulDiv(totalFee, _feeConfig.l2ReferralFeeBasisPoints, _feeConfig.feeBasisPoints, Math.Rounding.Floor)
            : 0;
        l3ReferralFee = l3 != address(0)
            ? Math.mulDiv(totalFee, _feeConfig.l3ReferralFeeBasisPoints, _feeConfig.feeBasisPoints, Math.Rounding.Floor)
            : 0;

        // Get user's cashback tier and calculate cashback as percentage of totalFee
        // Round DOWN: user receives slightly less cashback (protocol favored)
        uint8 userTier = _calculateTier(accounts[user].totalVolume);
        cashbackFee =
            Math.mulDiv(totalFee, tiers[userTier].cashbackBasisPoints, _feeConfig.feeBasisPoints, Math.Rounding.Floor);

        // Creator fee as percentage of totalFee
        // Round DOWN: creator receives slightly less (protocol favored)
        creatorFee =
            Math.mulDiv(totalFee, _feeConfig.creatorFeeBasisPoints, _feeConfig.feeBasisPoints, Math.Rounding.Floor);

        // Protocol fee is the remainder after all other fees
        // This absorbs any rounding dust and ensures sum equals totalFee
        uint256 sumOfComponentFees = l1ReferralFee + l2ReferralFee + l3ReferralFee + creatorFee + cashbackFee;

        // Invariant: sum of components must not exceed total (should never fail with Floor rounding)
        require(sumOfComponentFees <= totalFee, "Fee invariant violated");

        protocolFee = totalFee - sumOfComponentFees;

        return (totalFee, protocolFee, creatorFee, cashbackFee, l1ReferralFee, l2ReferralFee, l3ReferralFee);
    }

    /// @inheritdoc IPumpReward
    function addFees(
        address user,
        address creator,
        uint256 volume,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 cashbackFee,
        uint256 l1ReferralFee,
        uint256 l2ReferralFee,
        uint256 l3ReferralFee
    ) external nonReentrant {
        // Verify caller is a legitimate curve deployed by the factory
        address baseToken = PumpCurve(msg.sender).baseToken();
        require(IPumpFactory(factory).getCurve(baseToken) == msg.sender, "Unauthorized: not a factory curve");

        UserReward storage account = accounts[user];

        // Calculate total fee amount for cashback/referral calculations
        uint256 totalFeeAmount = protocolFee + creatorFee + cashbackFee + l1ReferralFee + l2ReferralFee + l3ReferralFee;

        // 1. Update user's total volume
        account.totalVolume += volume;

        // 2. Calculate and add user's cashback based on their current tier
        // Cashback is calculated as a percentage of the TOTAL FEE (not the trade amount)
        uint8 currentTier = _calculateTier(account.totalVolume);
        uint256 userCashback = (totalFeeAmount * tiers[currentTier].cashbackBasisPoints) / MAX_BASIS_POINTS;
        if (userCashback > 0) {
            account.accumulatedCashback += userCashback;
            emit CashbackAdded(user, volume, userCashback, currentTier);
        }

        // 3. Track protocol and creator fees
        if (protocolFee > 0) {
            _accumulatedProtocolFees += protocolFee;
        }
        if (creatorFee > 0) {
            accounts[creator].accumulatedCreatorFee += creatorFee;
            emit CreatorFeeAdded(creator, creatorFee, msg.sender);
        }

        // 4. Distribute referral rewards (L1, L2, L3)
        // Referrals are calculated as a percentage of the TOTAL FEE (not the trade amount)
        (address l1, address l2, address l3) = this.getReferralChain(user);

        if (l1 != address(0)) {
            uint256 l1Reward = (totalFeeAmount * _feeConfig.l1ReferralFeeBasisPoints) / MAX_BASIS_POINTS;
            if (l1Reward > 0) {
                accounts[l1].accumulatedReferral += l1Reward;
                emit ReferralRewardAdded(l1, 1, l1Reward, user);
            }
        }

        if (l2 != address(0)) {
            uint256 l2Reward = (totalFeeAmount * _feeConfig.l2ReferralFeeBasisPoints) / MAX_BASIS_POINTS;
            if (l2Reward > 0) {
                accounts[l2].accumulatedReferral += l2Reward;
                emit ReferralRewardAdded(l2, 2, l2Reward, user);
            }
        }

        if (l3 != address(0)) {
            uint256 l3Reward = (totalFeeAmount * _feeConfig.l3ReferralFeeBasisPoints) / MAX_BASIS_POINTS;
            if (l3Reward > 0) {
                accounts[l3].accumulatedReferral += l3Reward;
                emit ReferralRewardAdded(l3, 3, l3Reward, user);
            }
        }
    }

    /// @inheritdoc IPumpReward
    function addProtocolFee(uint256 amount) external nonReentrant {
        // Verify caller is a legitimate curve deployed by the factory
        address baseToken = PumpCurve(msg.sender).baseToken();
        require(IPumpFactory(factory).getCurve(baseToken) == msg.sender, "Unauthorized: not a factory curve");

        // Add to accumulated protocol fees
        if (amount > 0) {
            _accumulatedProtocolFees += amount;
            emit ProtocolFeeAdded(msg.sender, amount);
        }
    }

    // ============ Admin Functions ============

    /// @inheritdoc IPumpReward
    function setFeeConfig(FeeConfig calldata config) external override onlyOwner {
        // Validate fee configuration
        require(config.feeBasisPoints <= 10000, "Fee too high"); // Max 100%

        // Ensure referral fees are in descending order
        require(config.l1ReferralFeeBasisPoints >= config.l2ReferralFeeBasisPoints, "L1 must be >= L2");
        require(config.l2ReferralFeeBasisPoints >= config.l3ReferralFeeBasisPoints, "L2 must be >= L3");

        // Ensure total doesn't exceed main fee
        uint256 totalReferralAndCreator = uint256(config.creatorFeeBasisPoints)
            + uint256(config.l1ReferralFeeBasisPoints) + uint256(config.l2ReferralFeeBasisPoints)
            + uint256(config.l3ReferralFeeBasisPoints);

        require(totalReferralAndCreator <= config.feeBasisPoints, "Fees exceed total");

        _feeConfig = config;

        emit FeesUpdated(
            config.feeBasisPoints,
            config.creatorFeeBasisPoints,
            config.l1ReferralFeeBasisPoints,
            config.l2ReferralFeeBasisPoints,
            config.l3ReferralFeeBasisPoints,
            config.refereeDiscountBasisPoints
        );
    }

    /// @inheritdoc IPumpReward
    function claimProtocolFee() external onlyOwner nonReentrant returns (uint256 amount) {
        amount = _accumulatedProtocolFees;

        if (amount == 0) revert NothingToClaim();

        _accumulatedProtocolFees = 0;

        require(IERC20(quoteToken).transfer(msg.sender, amount), "USDC transfer failed");

        emit ProtocolFeeClaimed(msg.sender, amount);
        return amount;
    }

    /// @inheritdoc IPumpReward
    function updateTier(uint8 tierIndex, uint256 volumeThreshold, uint16 cashbackBasisPoints) external onlyOwner {
        require(tierIndex < tiers.length, "Invalid tier index");
        require(cashbackBasisPoints <= MAX_BASIS_POINTS, "Cashback too high");

        // Validate tier ordering: higher tiers must have higher thresholds and cashback
        if (tierIndex > 0) {
            require(volumeThreshold >= tiers[tierIndex - 1].volumeThreshold, "Threshold must increase");
            require(cashbackBasisPoints >= tiers[tierIndex - 1].cashbackBasisPoints, "Cashback must increase");
        }
        if (tierIndex < tiers.length - 1) {
            require(volumeThreshold <= tiers[tierIndex + 1].volumeThreshold, "Threshold must increase");
            require(cashbackBasisPoints <= tiers[tierIndex + 1].cashbackBasisPoints, "Cashback must increase");
        }

        tiers[tierIndex] = Tier({volumeThreshold: volumeThreshold, cashbackBasisPoints: cashbackBasisPoints});
    }

    // ============ Internal Functions ============

    /// @notice Calculate the appropriate tier for a given volume
    /// @param volume The user's total trading volume
    /// @return tierIndex The tier index (0-6)
    function _calculateTier(uint256 volume) internal view returns (uint8 tierIndex) {
        // Start from highest tier and work down
        for (uint256 i = tiers.length; i > 0; i--) {
            if (volume >= tiers[i - 1].volumeThreshold) {
                return uint8(i - 1);
            }
        }
        return 0; // Default to lowest tier (Wood)
    }
}
