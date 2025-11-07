// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MigrationStatus} from "./storage/AppStorage.sol";

// TODO: Add Uniswap V3 contract imports when implementing:
// - INonfungiblePositionManager from uniswap/v3-periphery
// - IUniswapV3Factory from uniswap/v3-core
// - IUniswapV3Pool from uniswap/v3-core

/**
 * @title KimchiMigration
 * @notice Migration contract for graduating tokens to Uniswap V3
 * @dev Creates Uniswap V3 pools and locks liquidity permanently
 * @dev This is a stub implementation - full Uniswap V3 integration pending
 */
contract KimchiMigration is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Storage ============

    /// @notice AMM contract reference
    address public ammContract;

    // TODO: Add Uniswap V3 contract addresses for Optimism
    // address public constant UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    // address public constant NONFUNGIBLE_POSITION_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    // uint24 public constant DEFAULT_POOL_FEE = 3000; // 0.3%

    // ============ Events ============

    event TokenMigrated(
        address indexed baseToken,
        address indexed uniswapV3Pool,
        uint256 nftTokenId,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 migrationFee
    );

    event AMMContractSet(address ammContract);

    // ============ Errors ============

    error CurveNotFound();
    error CurveNotCompleted();
    error AlreadyMigrated();
    error InsufficientReserves();
    error InvalidAddress();
    error NotImplemented();

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {
        // Owner is set to msg.sender by Ownable constructor
    }

    // ============ Configuration Functions ============

    /// @notice Set the AMM contract address (owner only)
    /// @param _ammContract Address of the KimchiAMM contract
    function setAmmContract(address _ammContract) external onlyOwner {
        if (_ammContract == address(0)) revert InvalidAddress();
        ammContract = _ammContract;
        emit AMMContractSet(_ammContract);
    }

    // ============ Migration Functions ============

    /// @notice Migrate a completed bonding curve to Uniswap V3
    /// @param baseToken Token address to migrate
    /// @dev This function should be called after curve graduation (80% sold)
    /// @dev TODO: Implement full Uniswap V3 integration
    function migrateToUniswapV3(address baseToken) external nonReentrant {
        // TODO: Implement full migration logic
        // Steps:
        // 1. Verify curve is completed via AMM contract
        // 2. Calculate migration fee (5%)
        // 3. Approve tokens for NonfungiblePositionManager
        // 4. Create pool if it doesn't exist (via factory.createPool)
        // 5. Initialize pool with price from bonding curve
        // 6. Add liquidity via mint() on NonfungiblePositionManager
        // 7. Store the NFT token ID (represents LP position)
        // 8. Lock the NFT permanently (transfer to 0xdead or burn)
        // 9. Update curve status in AMM contract

        revert NotImplemented();
    }

    /// @notice Check if a curve is ready for migration
    /// @param baseToken Token address
    /// @return ready True if ready for migration
    /// @return baseReserve Current base reserve
    /// @return threshold Migration threshold
    function isMigrationReady(address baseToken)
        external
        view
        returns (bool ready, uint256 baseReserve, uint256 threshold)
    {
        // TODO: Query AMM contract for curve status
        return (false, 0, 0);
    }

    /// @notice Get migration info for a curve
    /// @param baseToken Token address
    /// @return migrationStatus Current migration status
    /// @return uniswapV3Pool Pool address (if migrated)
    /// @return nftTokenId NFT token ID (if migrated)
    function getMigrationInfo(address baseToken)
        external
        view
        returns (MigrationStatus migrationStatus, address uniswapV3Pool, uint256 nftTokenId)
    {
        // TODO: Query AMM contract for migration info
        return (MigrationStatus.PreBondingCurve, address(0), 0);
    }
}
