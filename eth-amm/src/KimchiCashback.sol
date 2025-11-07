// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CashbackAccount, CashbackTier, Constants} from "./storage/AppStorage.sol";

/**
 * @title KimchiCashback
 * @notice Cashback management contract for the Kimchi AMM
 * @dev Handles cashback account creation, claiming, and tier updates
 */
contract KimchiCashback is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Storage ============

    /// @notice Cashback accounts: user => CashbackAccount
    mapping(address => CashbackAccount) public cashbacks;

    /// @notice AMM contract address (authorized to add cashback)
    address public ammContract;

    /// @notice Quote token (WETH) address
    address public quoteToken;

    // ============ Events ============

    event CashbackAccountCreated(address indexed user, CashbackTier tier);
    event CashbackAdded(address indexed user, uint256 amount);
    event CashbackClaimed(address indexed user, uint256 amount);
    event CashbackTierUpdated(address indexed user, CashbackTier oldTier, CashbackTier newTier);
    event InactiveCashbackReclaimed(address indexed user, uint256 amount);
    event AMMContractSet(address ammContract);

    // ============ Errors ============

    error AccountAlreadyExists();
    error AccountNotFound();
    error ClaimCooldownNotMet();
    error NoCashbackToClaim();
    error AccountNotInactive();
    error NotAMMContract();
    error InvalidAddress();

    // ============ Constructor ============

    constructor(address _quoteToken) Ownable(msg.sender) {
        if (_quoteToken == address(0)) revert InvalidAddress();
        quoteToken = _quoteToken;
    }

    // ============ Modifiers ============

    modifier onlyAmm() {
        if (msg.sender != ammContract) revert NotAMMContract();
        _;
    }

    // ============ Configuration Functions ============

    /// @notice Set the AMM contract address (owner only)
    /// @param _ammContract Address of the AMM contract
    function setAmmContract(address _ammContract) external onlyOwner {
        if (_ammContract == address(0)) revert InvalidAddress();
        ammContract = _ammContract;
        emit AMMContractSet(_ammContract);
    }

    // ============ Cashback Functions ============

    /// @notice Create a cashback account for the caller
    function createCashback() external {
        if (cashbacks[msg.sender].exists) revert AccountAlreadyExists();

        // Initialize with Wood tier
        cashbacks[msg.sender] = CashbackAccount({
            tier: CashbackTier.Wood,
            accumulated: 0,
            lastClaimTimestamp: uint64(block.timestamp),
            exists: true
        });

        emit CashbackAccountCreated(msg.sender, CashbackTier.Wood);
    }

    /// @notice Add cashback for a user (only callable by AMM contract)
    /// @param user User address
    /// @param amount Cashback amount to add
    function addCashback(address user, uint256 amount) external onlyAmm {
        // Create account if doesn't exist
        if (!cashbacks[user].exists) {
            cashbacks[user] = CashbackAccount({
                tier: CashbackTier.Wood,
                accumulated: 0,
                lastClaimTimestamp: uint64(block.timestamp),
                exists: true
            });
            emit CashbackAccountCreated(user, CashbackTier.Wood);
        }

        // Add to accumulated
        cashbacks[user].accumulated += amount;
        emit CashbackAdded(user, amount);
    }

    /// @notice Claim accumulated cashback rewards
    function claimCashback() external nonReentrant {
        CashbackAccount storage account = cashbacks[msg.sender];

        if (!account.exists) revert AccountNotFound();

        // Check cooldown (7 days)
        if (block.timestamp < account.lastClaimTimestamp + Constants.CASHBACK_CLAIM_COOLDOWN) {
            revert ClaimCooldownNotMet();
        }

        uint256 claimAmount = account.accumulated;
        if (claimAmount == 0) revert NoCashbackToClaim();

        // Reset accumulated and update timestamp
        account.accumulated = 0;
        account.lastClaimTimestamp = uint64(block.timestamp);

        // Transfer cashback
        IERC20(quoteToken).safeTransfer(msg.sender, claimAmount);

        emit CashbackClaimed(msg.sender, claimAmount);
    }

    /// @notice Update a user's cashback tier (owner only)
    /// @param user User address
    /// @param newTier New cashback tier
    function updateCashbackTier(address user, CashbackTier newTier) external onlyOwner {
        CashbackAccount storage account = cashbacks[user];
        if (!account.exists) revert AccountNotFound();

        CashbackTier oldTier = account.tier;
        account.tier = newTier;

        emit CashbackTierUpdated(user, oldTier, newTier);
    }

    /// @notice Reclaim cashback from inactive accounts (owner only, 365 days inactive)
    /// @param user User address
    function reclaimInactiveCashback(address user) external nonReentrant onlyOwner {
        CashbackAccount storage account = cashbacks[user];
        if (!account.exists) revert AccountNotFound();

        // Check if account is inactive (365 days)
        if (block.timestamp < account.lastClaimTimestamp + Constants.CASHBACK_INACTIVE_PERIOD) {
            revert AccountNotInactive();
        }

        uint256 reclaimAmount = account.accumulated;
        if (reclaimAmount == 0) revert NoCashbackToClaim();

        // Reset accumulated
        account.accumulated = 0;

        // Transfer to owner
        IERC20(quoteToken).safeTransfer(msg.sender, reclaimAmount);

        emit InactiveCashbackReclaimed(user, reclaimAmount);
    }

    // ============ View Functions ============

    /// @notice Get cashback account information
    /// @param user User address
    /// @return account Cashback account data
    function getCashbackAccount(address user) external view returns (CashbackAccount memory account) {
        account = cashbacks[user];
    }

    /// @notice Get user's cashback tier
    /// @param user User address
    /// @return tier User's cashback tier
    function getUserTier(address user) external view returns (CashbackTier tier) {
        if (!cashbacks[user].exists) {
            return CashbackTier.Wood; // Default tier
        }
        tier = cashbacks[user].tier;
    }

    /// @notice Get accumulated cashback for a user
    /// @param user User address
    /// @return accumulated Accumulated cashback amount
    function getAccumulatedCashback(address user) external view returns (uint256 accumulated) {
        if (!cashbacks[user].exists) return 0;
        accumulated = cashbacks[user].accumulated;
    }

    /// @notice Check if a user can claim cashback
    /// @param user User address
    /// @return canClaim True if user can claim
    /// @return timeUntilClaim Seconds until next claim (0 if can claim)
    function canClaimCashback(address user) external view returns (bool canClaim, uint256 timeUntilClaim) {
        if (!cashbacks[user].exists || cashbacks[user].accumulated == 0) {
            return (false, 0);
        }

        uint64 nextClaimTime = cashbacks[user].lastClaimTimestamp + uint64(Constants.CASHBACK_CLAIM_COOLDOWN);

        if (block.timestamp >= nextClaimTime) {
            return (true, 0);
        } else {
            return (false, nextClaimTime - block.timestamp);
        }
    }
}
