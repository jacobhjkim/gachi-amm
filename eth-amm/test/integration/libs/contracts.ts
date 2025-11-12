/**
 * Load deployed contract addresses from deployments/anvil.json
 */

import { type Address, type Hex } from 'viem'
import {
	PumpFactoryAbi,
	MockUSDCAbi,
	PumpTokenAbi,
	PumpCurveAbi,
	PumpTokenBytecode,
	PumpCurveBytecode,
} from '../../../types'
import { join } from 'path'

export interface DeployedContracts {
	factory: {
		address: Address
		abi: typeof PumpFactoryAbi
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
}

interface DeploymentData {
	network: string
	chainId: number
	deployer: Address
	feeClaimer?: Address
	contracts: {
		PumpFactory: Address
		USDC: Address
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

	let deployment: DeploymentData

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

	// Validate required fields
	if (!deployment.contracts) {
		throw new Error('Invalid deployment file: missing contracts field')
	}

	const { contracts } = deployment

	if (!contracts.PumpFactory || !contracts.USDC) {
		throw new Error('Invalid deployment file: missing required contract addresses')
	}

	console.log('📋 Loaded deployed contracts from deployments/anvil.json')
	console.log(`  MockUSDC: ${contracts.USDC}`)
	console.log(`  PumpFactory: ${contracts.PumpFactory}`)
	console.log()

	return {
		factory: {
			address: contracts.PumpFactory,
			abi: PumpFactoryAbi,
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
	}
}
