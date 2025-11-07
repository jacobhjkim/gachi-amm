#!/usr/bin/env bun
/**
 * Interact with deployed Kimchi contracts
 * Usage: bun script/interact.ts
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther, type Address } from 'viem'
import { anvil } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { loadDeployedAddresses } from './load-addresses'

// Anvil default accounts
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const USER1_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

async function main() {
  console.log('\n🎮 Kimchi Contract Interaction Demo\n')

  // Load deployed addresses
  const deployment = loadDeployedAddresses()
  const { contracts } = deployment

  // Setup clients
  const publicClient = createPublicClient({
    chain: anvil,
    transport: http('http://localhost:8545'),
  })

  const deployerAccount = privateKeyToAccount(DEPLOYER_KEY as Address)
  const user1Account = privateKeyToAccount(USER1_KEY as Address)

  const deployerClient = createWalletClient({
    account: deployerAccount,
    chain: anvil,
    transport: http('http://localhost:8545'),
  })

  const user1Client = createWalletClient({
    account: user1Account,
    chain: anvil,
    transport: http('http://localhost:8545'),
  })

  console.log('📍 Using contracts:')
  console.log(`   MockWETH:      ${contracts.MockWETH}`)
  console.log(`   KimchiFactory: ${contracts.KimchiFactory}`)
  console.log(`   KimchiAMM:     ${contracts.KimchiAMM}\n`)

  // 1. Mint WETH for user1
  console.log('1️⃣  Minting 100 WETH for User1...')
  const mintHash = await deployerClient.writeContract({
    address: contracts.MockWETH as Address,
    abi: [
      {
        name: 'mint',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
      },
    ],
    functionName: 'mint',
    args: [user1Account.address, parseEther('100')],
  })
  await publicClient.waitForTransactionReceipt({ hash: mintHash })
  console.log('   ✅ Minted 100 WETH\n')

  // 2. Check WETH balance
  console.log('2️⃣  Checking User1 WETH balance...')
  const balance = await publicClient.readContract({
    address: contracts.MockWETH as Address,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: [user1Account.address],
  })
  console.log(`   Balance: ${formatEther(balance as bigint)} WETH\n`)

  // 3. Check Factory config
  console.log('3️⃣  Checking Factory configuration...')
  const config = await publicClient.readContract({
    address: contracts.KimchiFactory as Address,
    abi: [
      {
        name: 'getConfig',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
          {
            name: '',
            type: 'tuple',
            components: [
              { name: 'isInitialized', type: 'bool' },
              { name: 'quoteToken', type: 'address' },
              { name: 'feeClaimer', type: 'address' },
              { name: 'baseTokenDecimals', type: 'uint8' },
              { name: 'quoteTokenDecimals', type: 'uint8' },
              { name: 'feeBasisPoints', type: 'uint16' },
              { name: 'l1ReferralFeeBasisPoints', type: 'uint16' },
              { name: 'l2ReferralFeeBasisPoints', type: 'uint16' },
              { name: 'l3ReferralFeeBasisPoints', type: 'uint16' },
              { name: 'refereeDiscountBasisPoints', type: 'uint16' },
              { name: 'creatorFeeBasisPoints', type: 'uint16' },
              { name: 'migrationFeeBasisPoints', type: 'uint16' },
              { name: 'migrationBaseThreshold', type: 'uint256' },
              { name: 'migrationQuoteThreshold', type: 'uint256' },
              { name: 'initialVirtualQuoteReserve', type: 'uint256' },
              { name: 'initialVirtualBaseReserve', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    functionName: 'getConfig',
  })

  const configData = config as any
  console.log(`   Initialized: ${configData.isInitialized}`)
  console.log(`   Quote Token: ${configData.quoteToken}`)
  console.log(`   Fee Claimer: ${configData.feeClaimer}`)
  console.log(`   Trading Fee: ${configData.feeBasisPoints / 100}%\n`)

  console.log('✅ Interaction demo complete!\n')
  console.log('💡 You can now use these contracts in your tests or create tokens via the factory.\n')
}

main().catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
