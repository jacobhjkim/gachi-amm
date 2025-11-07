#!/usr/bin/env bun
/**
 * Load deployed contract addresses from deployments/anvil.json
 * Usage: bun script/load-addresses.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export interface DeploymentAddresses {
  network: string
  chainId: number
  deployer: string
  feeClaimer: string
  contracts: {
    MockWETH: string
    KimchiFactory: string
    KimchiCashback: string
    KimchiAMM: string
    KimchiMigration: string
  }
}

export function loadDeployedAddresses(network: string = 'anvil'): DeploymentAddresses {
  const deploymentPath = resolve(`deployments/${network}.json`)

  if (!existsSync(deploymentPath)) {
    throw new Error(
      `Deployment file not found: ${deploymentPath}\n` + `Please deploy contracts first: ./script/deploy-local.sh`,
    )
  }

  const deployment = JSON.parse(readFileSync(deploymentPath, 'utf-8'))
  return deployment as DeploymentAddresses
}

// CLI usage
if (import.meta.main) {
  try {
    const addresses = loadDeployedAddresses()

    console.log('\n📋 Deployed Contract Addresses')
    console.log('================================')
    console.log(`Network:        ${addresses.network} (chainId: ${addresses.chainId})`)
    console.log(`Deployer:       ${addresses.deployer}`)
    console.log(`Fee Claimer:    ${addresses.feeClaimer}`)
    console.log('\n🔗 Contracts:')
    console.log(`MockWETH:       ${addresses.contracts.MockWETH}`)
    console.log(`KimchiFactory:  ${addresses.contracts.KimchiFactory}`)
    console.log(`KimchiCashback: ${addresses.contracts.KimchiCashback}`)
    console.log(`KimchiAMM:      ${addresses.contracts.KimchiAMM}`)
    console.log(`KimchiMigration: ${addresses.contracts.KimchiMigration}`)
    console.log('')
  } catch (error) {
    console.error('❌ Error:', (error as Error).message)
    process.exit(1)
  }
}
