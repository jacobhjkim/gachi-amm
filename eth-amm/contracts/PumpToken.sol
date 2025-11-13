// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title PumpToken
 * @notice ERC20 token template for bonding curve tokens with permit and burn functionality
 * @dev Fixed supply of 1 billion tokens with 6 decimals, supports EIP-2612 permits for gasless approvals
 *      No minting function exists - supply is fixed at construction and cannot be changed
 *      Tokens can be burned by holders to reduce total supply
 *      Token is non-transferrable until the bonding curve graduates (prevents malicious DEX pool creation)
 */
contract PumpToken is ERC20, ERC20Permit, ERC20Burnable {
    /// @notice Total supply of tokens (1 billion with 6 decimals)
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 6;

    /// @notice Factory address that deployed this token
    address public immutable factory;

    /// @notice Bonding curve address for this token
    address public curve;

    /// @notice Whether the curve has graduated (enables free transfers)
    bool public graduated;

    /// @notice Create a new ERC20 token with fixed supply
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param recipient Address to receive the initial supply (factory temporarily, then curve)
    /// @param _factory Factory address that can set the curve
    constructor(string memory name, string memory symbol, address recipient, address _factory)
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        require(_factory != address(0), "Invalid factory");
        factory = _factory;

        // Mint total supply to recipient
        // No minting function exists, so this is the only time tokens are created
        _mint(recipient, TOTAL_SUPPLY);
    }

    /// @notice Set the bonding curve address (only callable by factory once)
    /// @param _curve The bonding curve address
    function setCurve(address _curve) external {
        require(msg.sender == factory, "Only factory");
        require(curve == address(0), "Curve already set");
        require(_curve != address(0), "Invalid curve");
        curve = _curve;
    }

    /// @notice Mark the token as graduated (called by curve when it graduates)
    /// @dev This enables free transfers of the token
    function graduate() external {
        require(msg.sender == curve, "Only curve");
        require(!graduated, "Already graduated");
        graduated = true;
    }

    /// @notice Returns 6 decimals
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Override _update to enforce transfer restrictions before graduation
    /// @dev Allows transfers only from/to the curve before graduation, or freely after graduation
    ///      Uses local graduated flag instead of external call for gas efficiency (inspired by ERC20Pausable)
    function _update(address from, address to, uint256 value) internal override {
        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        // If curve is not set yet, only allow factory transfers (during initialization)
        if (curve == address(0)) {
            require(from == factory || to == factory, "Transfers locked until curve is set");
            super._update(from, to, value);
            return;
        }

        // Before graduation: only allow transfers from/to the curve (for swaps)
        // This prevents malicious users from creating DEX pools before official graduation
        if (!graduated) {
            require(from == curve || to == curve, "Transfers locked until graduation");
        }

        // After graduation or if involving the curve, allow transfer
        super._update(from, to, value);
    }
}
