/**
 * Load deployed contract addresses from deployments/anvil.json
 */

import { type Address, type Hex } from 'viem'
import {
	PumpFactoryAbi,
	PumpRewardAbi,
	MockUSDCAbi,
	PumpTokenAbi,
	PumpCurveAbi,
	PumpTokenBytecode,
	PumpCurveBytecode,
} from '../../../types'
import { join } from 'path'

// Minimal SwapRouter ABI for testing (only exactInputSingle function)
const SwapRouterAbi = [
	{
		inputs: [
			{
				components: [
					{ internalType: 'address', name: 'tokenIn', type: 'address' },
					{ internalType: 'address', name: 'tokenOut', type: 'address' },
					{ internalType: 'uint24', name: 'fee', type: 'uint24' },
					{ internalType: 'address', name: 'recipient', type: 'address' },
					{ internalType: 'uint256', name: 'deadline', type: 'uint256' },
					{ internalType: 'uint256', name: 'amountIn', type: 'uint256' },
					{ internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
					{ internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
				],
				internalType: 'struct ISwapRouter.ExactInputSingleParams',
				name: 'params',
				type: 'tuple',
			},
		],
		name: 'exactInputSingle',
		outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
		stateMutability: 'payable',
		type: 'function',
	},
] as const

export interface DeployedContracts {
	factory: {
		address: Address
		abi: typeof PumpFactoryAbi
	}
	reward: {
		address: Address
		abi: typeof PumpRewardAbi
	}
	curve: {
		abi: typeof PumpCurveAbi
		bytecode: Hex
	}
	usdc: {
		address: Address
		abi: typeof MockUSDCAbi
	}
	token: {
		abi: typeof PumpTokenAbi
		bytecode: Hex
	}
	uniswapV3Factory: {
		address: Address
	}
	uniswapV3Router: {
		address: Address
		abi: any // We'll use the SwapRouter ABI
	}
}

interface DeploymentData {
	network: string
	chainId: number
	deployer: Address
	feeClaimer?: Address
	contracts: {
		PumpFactory: Address
		PumpReward: Address
		USDC: Address
		UniswapV3Factory: Address
	}
}

/**
 * Load deployed contract addresses from deployments/anvil.json
 *
 * Make sure to run the deployment script first:
 * ```bash
 * ./script/deploy-local.sh
 * ```
 */
export async function loadDeployedContracts(): Promise<DeployedContracts> {
	const deploymentPath = join(import.meta.dir, '../../../deployments/anvil.json')
	const uniswapDeploymentPath = join(import.meta.dir, '../../../deployments/uniswap-v3-anvil.json')

	let deployment: DeploymentData
	let uniswapDeployment: any

	try {
		const file = Bun.file(deploymentPath)
		deployment = await file.json()
	} catch (error) {
		throw new Error(
			`Failed to load deployment file at ${deploymentPath}.\n` +
				`Make sure to run: ./script/deploy-local.sh\n` +
				`Error: ${error}`,
		)
	}

	try {
		const uniswapFile = Bun.file(uniswapDeploymentPath)
		uniswapDeployment = await uniswapFile.json()
	} catch (error) {
		throw new Error(
			`Failed to load Uniswap deployment file at ${uniswapDeploymentPath}.\n` +
				`Make sure to run: ./script/deploy-local.sh\n` +
				`Error: ${error}`,
		)
	}

	// Validate required fields
	if (!deployment.contracts) {
		throw new Error('Invalid deployment file: missing contracts field')
	}

	const { contracts } = deployment
	const uniswapContracts = uniswapDeployment.contracts

	if (!contracts.PumpFactory || !contracts.PumpReward || !contracts.USDC || !contracts.UniswapV3Factory) {
		throw new Error('Invalid deployment file: missing required contract addresses')
	}

	if (!uniswapContracts.SwapRouter) {
		throw new Error('Invalid Uniswap deployment file: missing SwapRouter address')
	}

	console.log('📋 Loaded deployed contracts from deployments/anvil.json')
	console.log(`  MockUSDC: ${contracts.USDC}`)
	console.log(`  PumpReward: ${contracts.PumpReward}`)
	console.log(`  PumpFactory: ${contracts.PumpFactory}`)
	console.log()

	return {
		factory: {
			address: contracts.PumpFactory,
			abi: PumpFactoryAbi,
		},
		reward: {
			address: contracts.PumpReward,
			abi: PumpRewardAbi,
		},
		curve: {
			abi: PumpCurveAbi,
			bytecode: PumpCurveBytecode,
		},
		usdc: {
			address: contracts.USDC,
			abi: MockUSDCAbi,
		},
		token: {
			abi: PumpTokenAbi,
			bytecode: PumpTokenBytecode,
		},
		uniswapV3Factory: {
			address: contracts.UniswapV3Factory,
		},
		uniswapV3Router: {
			address: uniswapContracts.SwapRouter as Address,
			abi: SwapRouterAbi,
		},
	}
}
