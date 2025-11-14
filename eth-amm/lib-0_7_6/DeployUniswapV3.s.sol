pragma solidity =0.7.6;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {UniswapV3Factory} from "@uniswap/v3-core/contracts/UniswapV3Factory.sol";
import {SwapRouter} from "@uniswap/v3-periphery/contracts/SwapRouter.sol";
import {MockWETH9} from "./MockWETH9.sol";

/**
 * @title DeployUniswapV3
 * @notice Deployment script for Uniswap V3 Factory, WETH9, and SwapRouter (requires solc 0.7.6)
 * @dev Run with: FOUNDRY_PROFILE=0_7_6 forge script lib-0_7_6/DeployUniswapV3.s.sol:DeployUniswapV3 --rpc-url http://localhost:8545 --broadcast --legacy -vvv
 */
contract DeployUniswapV3 is Script {
    // Deployment addresses
    address public uniswapV3Factory;
    address public weth9;
    address public swapRouter;

    // Anvil default accounts
    address public deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Default Anvil account #0

    function run() external {
        // Get private key from environment or use Anvil's default
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80) // Anvil account #0
        );

        console.log("\n=== Starting Uniswap V3 Deployment ===");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy UniswapV3Factory
        console.log("\n[1/3] Deploying UniswapV3Factory...");
        uniswapV3Factory = address(new UniswapV3Factory());
        console.log("UniswapV3Factory deployed at:", uniswapV3Factory);

        // Deploy WETH9
        console.log("\n[2/3] Deploying MockWETH9...");
        weth9 = address(new MockWETH9());
        console.log("MockWETH9 deployed at:", weth9);

        // Deploy SwapRouter
        console.log("\n[3/3] Deploying SwapRouter...");
        swapRouter = address(new SwapRouter(uniswapV3Factory, weth9));
        console.log("SwapRouter deployed at:", swapRouter);

        vm.stopBroadcast();

        // Print deployment summary
        _printDeploymentSummary();

        // Export addresses to JSON
        _exportAddresses();
    }

    function _printDeploymentSummary() internal view {
        console.log("\n=== Deployment Summary ===");
        console.log("UniswapV3Factory:  ", uniswapV3Factory);
        console.log("MockWETH9:         ", weth9);
        console.log("SwapRouter:        ", swapRouter);
        console.log("\n=== Uniswap V3 Deployment Complete! ===");
        console.log("\nTo deploy Pump contracts, run:");
        console.log("UNISWAP_V3_FACTORY=", uniswapV3Factory, " forge script contracts/DeployPump.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast");
    }

    function _exportAddresses() internal {
        string memory json = string(abi.encodePacked(
            "{\n",
            '  "network": "anvil",\n',
            '  "chainId": 31337,\n',
            '  "deployer": "',
            vm.toString(deployer),
            '",\n',
            '  "contracts": {\n',
            '    "UniswapV3Factory": "',
            vm.toString(uniswapV3Factory),
            '",\n',
            '    "WETH9": "',
            vm.toString(weth9),
            '",\n',
            '    "SwapRouter": "',
            vm.toString(swapRouter),
            '"\n',
            "  }\n",
            "}"
        ));

        vm.writeFile("deployments/uniswap-v3-anvil.json", json);
        console.log("\nDeployment addresses exported to: deployments/uniswap-v3-anvil.json");
    }
}
