// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {KimchiFactory} from "../src/KimchiFactory.sol";
import {KimchiAMM} from "../src/KimchiAMM.sol";
import {KimchiCashback} from "../src/KimchiCashback.sol";
import {KimchiMigration} from "../src/KimchiMigration.sol";
import {MockWETH} from "../test/helpers/MockWETH.sol";

/**
 * @title Deploy
 * @notice Deployment script for Kimchi contracts to local Anvil network
 * @dev Run with: forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast -vvv
 */
contract Deploy is Script {
    // Deployment addresses
    address public weth;
    address public factory;
    address public cashback;
    address public amm;
    address public migration;

    // Anvil default accounts
    address public deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Default Anvil account #0

    function run() external {
        // Get private key from environment or use Anvil's default
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80) // Anvil account #0
        );

        console2.log("\n=== Starting Deployment ===");
        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockWETH (for local testing)
        console2.log("\n[1/5] Deploying MockWETH...");
        weth = address(new MockWETH());
        console2.log("MockWETH deployed at:", weth);

        // 2. Deploy KimchiFactory
        console2.log("\n[2/5] Deploying KimchiFactory...");
        factory = address(new KimchiFactory());
        console2.log("KimchiFactory deployed at:", factory);

        // 3. Deploy KimchiCashback
        console2.log("\n[3/5] Deploying KimchiCashback...");
        cashback = address(new KimchiCashback(weth));
        console2.log("KimchiCashback deployed at:", cashback);

        // 4. Deploy KimchiAMM
        console2.log("\n[4/5] Deploying KimchiAMM...");
        amm = address(new KimchiAMM(factory));
        console2.log("KimchiAMM deployed at:", amm);

        // 5. Deploy KimchiMigration (stub)
        console2.log("\n[5/5] Deploying KimchiMigration...");
        migration = address(new KimchiMigration());
        console2.log("KimchiMigration deployed at:", migration);

        vm.stopBroadcast();

        // Print deployment summary
        _printDeploymentSummary();

        // Export addresses to JSON
        _exportAddresses();
    }

    function _printDeploymentSummary() internal view {
        console2.log("\n=== Deployment Summary ===");
        console2.log("MockWETH:          ", weth);
        console2.log("KimchiFactory:     ", factory);
        console2.log("KimchiCashback:    ", cashback);
        console2.log("KimchiAMM:         ", amm);
        console2.log("KimchiMigration:   ", migration);
        console2.log("\n=== Deployment Complete! ===");
        console2.log("Run initialization: bun run script/initialize-contracts.ts\n");
    }

    function _exportAddresses() internal {
        string memory json = string.concat(
            '{\n',
            '  "network": "anvil",\n',
            '  "chainId": 31337,\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "contracts": {\n',
            '    "MockWETH": "', vm.toString(weth), '",\n',
            '    "KimchiFactory": "', vm.toString(factory), '",\n',
            '    "KimchiCashback": "', vm.toString(cashback), '",\n',
            '    "KimchiAMM": "', vm.toString(amm), '",\n',
            '    "KimchiMigration": "', vm.toString(migration), '"\n',
            '  }\n',
            '}'
        );

        vm.writeFile("deployments/anvil.json", json);
        console2.log("Deployment addresses exported to: deployments/anvil.json");
    }
}
