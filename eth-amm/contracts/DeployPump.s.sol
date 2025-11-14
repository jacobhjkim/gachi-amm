pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PumpFactory} from "./PumpFactory.sol";
import {PumpReward} from "./PumpReward.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/**
 * @title Deploy
 * @notice Deployment script for Pump contracts to local Anvil network
 * @dev Run with: forge script script/DeployPump.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast -vvv
 */
contract Deploy is Script {
    // Deployment addresses
    address public usdc;
    address public uniswapV3Factory;
    address public factory;
    address public rewardContract;

    // Anvil default accounts
    address public deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Default Anvil account #0

    function run() external {
        // Get private key from environment or use Anvil's default
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80) // Anvil account #0
        );

        console2.log("\n=== Starting Pump Deployment ===");
        console2.log("Deployer:", deployer);

        // Check if addresses are provided via environment variables
        usdc = vm.envOr("USDC_ADDRESS", address(0));
        uniswapV3Factory = vm.envOr("UNISWAP_V3_FACTORY", address(0));

        require(uniswapV3Factory != address(0), "UNISWAP_V3_FACTORY not set. Deploy Uniswap V3 first.");

        vm.startBroadcast(deployerPrivateKey);

        if (usdc == address(0)) {
            console2.log("\n[1/3] Deploying MockUSDC...");
            usdc = address(new MockUSDC());
            console2.log("MockUSDC deployed at:", usdc);
        } else {
            console2.log("\n[1/3] Using existing USDC at:", usdc);
        }

        console2.log("Using UniswapV3Factory at:", uniswapV3Factory);

        // Deploy PumpReward (must be deployed before PumpFactory)
        console2.log("\n[2/3] Deploying PumpReward...");

        // Note: Because of circular dependency, we use a predicted address for the factory
        // Cleanest: Use vm.computeCreateAddress to predict addresses
        uint256 currentNonce = vm.getNonce(deployer);
        address predictedFactory = vm.computeCreateAddress(deployer, currentNonce + 1);

        rewardContract = address(new PumpReward(predictedFactory, usdc));
        console2.log("PumpReward deployed at:", rewardContract);

        // Deploy PumpFactory
        console2.log("\n[3/3] Deploying PumpFactory...");
        factory = address(new PumpFactory(usdc, uniswapV3Factory, rewardContract));
        console2.log("PumpFactory deployed at:", factory);

        vm.stopBroadcast();

        // Print deployment summary
        _printDeploymentSummary();

        // Export addresses to JSON
        _exportAddresses();
    }

    function _printDeploymentSummary() internal view {
        console2.log("\n=== Deployment Summary ===");
        console2.log("USDC:              ", usdc);
        console2.log("UniswapV3Factory:  ", uniswapV3Factory);
        console2.log("PumpReward:        ", rewardContract);
        console2.log("PumpFactory:       ", factory);
        console2.log("\n=== Deployment Complete! ===");
    }

    function _exportAddresses() internal {
        string memory json = string.concat(
            "{\n",
            '  "network": "anvil",\n',
            '  "chainId": 31337,\n',
            '  "deployer": "',
            vm.toString(deployer),
            '",\n',
            '  "contracts": {\n',
            '    "USDC": "',
            vm.toString(usdc),
            '",\n',
            '    "UniswapV3Factory": "',
            vm.toString(uniswapV3Factory),
            '",\n',
            '    "PumpReward": "',
            vm.toString(rewardContract),
            '",\n',
            '    "PumpFactory": "',
            vm.toString(factory),
            '"\n',
            "  }\n",
            "}"
        );

        vm.writeFile("deployments/anvil.json", json);
        console2.log("Deployment addresses exported to: deployments/anvil.json");
    }
}
