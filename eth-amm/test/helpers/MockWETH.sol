// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockWETH
 * @notice Simple WETH implementation for testing
 * @dev Simulates Wrapped ETH with deposit/withdraw functionality
 */
contract MockWETH is ERC20 {
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    constructor() ERC20("Wrapped Ether", "WETH") {}

    /**
     * @notice Get token decimals (18 for WETH)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /**
     * @notice Deposit ETH and receive WETH
     */
    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw WETH and receive ETH
     */
    function withdraw(uint256 wad) public {
        require(balanceOf(msg.sender) >= wad, "Insufficient balance");
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    /**
     * @notice Mint WETH directly (for testing convenience)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {
        deposit();
    }
}
