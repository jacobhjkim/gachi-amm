// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "./v3-core/contracts/UniswapV3Pool.sol";

contract ComputePoolHash is Script {
    function run() external view {
        bytes32 poolInitCodeHash = keccak256(abi.encodePacked(type(UniswapV3Pool).creationCode));
        console.log("POOL_INIT_CODE_HASH:");
        console.logBytes32(poolInitCodeHash);
    }
}
