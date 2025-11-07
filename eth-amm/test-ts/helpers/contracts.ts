/**
 * Load deployed contract addresses from deployments/anvil.json
 */

import { type Address } from 'viem'
import { KimchiFactoryAbi, KimchiAMMAbi, KimchiCashbackAbi, KimchiMigrationAbi, MockWETHAbi } from '../generated'
import { join } from 'path'

export interface DeployedContracts {
  factory: {
    address: Address
    abi: typeof KimchiFactoryAbi
  }
  amm: {
    address: Address
    abi: typeof KimchiAMMAbi
  }
  cashback: {
    address: Address
    abi: typeof KimchiCashbackAbi
  }
  migration: {
    address: Address
    abi: typeof KimchiMigrationAbi
  }
  weth: {
    address: Address
    abi: typeof MockWETHAbi
  }
}

interface DeploymentData {
  network: string
  chainId: number
  deployer: Address
  feeClaimer: Address
  contracts: {
    MockWETH: Address
    KimchiFactory: Address
    KimchiCashback: Address
    KimchiAMM: Address
    KimchiMigration: Address
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
  const deploymentPath = join(import.meta.dir, '../../deployments/anvil.json')

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

  if (
    !contracts.MockWETH ||
    !contracts.KimchiFactory ||
    !contracts.KimchiAMM ||
    !contracts.KimchiCashback ||
    !contracts.KimchiMigration
  ) {
    throw new Error('Invalid deployment file: missing required contract addresses')
  }

  console.log('📋 Loaded deployed contracts from deployments/anvil.json')
  console.log(`  MockWETH: ${contracts.MockWETH}`)
  console.log(`  KimchiFactory: ${contracts.KimchiFactory}`)
  console.log(`  KimchiAMM: ${contracts.KimchiAMM}`)
  console.log(`  KimchiCashback: ${contracts.KimchiCashback}`)
  console.log(`  KimchiMigration: ${contracts.KimchiMigration}`)
  console.log()

  return {
    weth: {
      address: contracts.MockWETH,
      abi: MockWETHAbi,
    },
    factory: {
      address: contracts.KimchiFactory,
      abi: KimchiFactoryAbi,
    },
    amm: {
      address: contracts.KimchiAMM,
      abi: KimchiAMMAbi,
    },
    cashback: {
      address: contracts.KimchiCashback,
      abi: KimchiCashbackAbi,
    },
    migration: {
      address: contracts.KimchiMigration,
      abi: KimchiMigrationAbi,
    },
  }
}
