/**
 * Test environment setup
 * Creates viem clients that connect to local anvil node
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Chain } from 'viem'
import { foundry } from 'viem/chains'
import { ANVIL_RPC_URL } from './helpers/constants'

/**
 * Anvil local testnet chain configuration
 */
export const anvilChain: Chain = {
  ...foundry,
  rpcUrls: {
    default: {
      http: [ANVIL_RPC_URL],
    },
    public: {
      http: [ANVIL_RPC_URL],
    },
  },
}

/**
 * Create a public client for reading blockchain state
 */
export function createTestPublicClient(): PublicClient {
  return createPublicClient({
    chain: anvilChain,
    transport: http(ANVIL_RPC_URL),
  })
}

/**
 * Create a wallet client for sending transactions
 */
export function createTestWalletClient(): WalletClient {
  return createWalletClient({
    chain: anvilChain,
    transport: http(ANVIL_RPC_URL),
  })
}

/**
 * Check if anvil is running and accessible
 */
export async function checkAnvilConnection(): Promise<boolean> {
  try {
    const client = createTestPublicClient()
    const blockNumber = await client.getBlockNumber()
    console.log(`Connected to anvil at ${ANVIL_RPC_URL} (block: ${blockNumber})`)
    return true
  } catch (error) {
    console.error(`Failed to connect to anvil at ${ANVIL_RPC_URL}`)
    console.error('Make sure anvil is running: anvil')
    return false
  }
}
