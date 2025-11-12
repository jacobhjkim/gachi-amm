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
 */
contract PumpToken is ERC20, ERC20Permit, ERC20Burnable {
    /// @notice Total supply of tokens (1 billion with 6 decimals)
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 6;

    /// @notice Create a new ERC20 token with fixed supply
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param recipient Address to receive the initial supply (PumpCurve contract)
    constructor(string memory name, string memory symbol, address recipient) ERC20(name, symbol) ERC20Permit(name) {
        // Mint total supply to recipient
        // No minting function exists, so this is the only time tokens are created
        _mint(recipient, TOTAL_SUPPLY);
    }

    /// @notice Returns 6 decimals
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
