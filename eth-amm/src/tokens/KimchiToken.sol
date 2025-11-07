// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Constants} from "../storage/AppStorage.sol";

/**
 * @title KimchiToken
 * @notice ERC20 token template for bonding curve tokens with permit functionality
 * @dev Fixed supply of 1 billion tokens with 6 decimals, supports EIP-2612 permits for gasless approvals
 */
contract KimchiToken is ERC20, ERC20Permit {
    uint8 private constant DECIMALS = 6;

    /// @notice Create a new Kimchi token
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param recipient Address to receive the initial supply (KimchiAMM contract)
    constructor(string memory name, string memory symbol, address recipient)
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        // Mint total supply to recipient (KimchiAMM contract)
        _mint(recipient, Constants.TOKEN_TOTAL_SUPPLY);
    }

    /// @notice Returns 6 decimals
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
}
