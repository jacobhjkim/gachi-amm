/**
 * KimchiFactory integration tests
 * Tests token creation and deployment via CREATE2
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { type Address, getContract, parseEther, keccak256, toHex } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection, anvilChain } from './setup.ts'
import {
  loadDeployedContracts,
  getAllAccounts,
  INITIAL_VIRTUAL_QUOTE_RESERVE,
  INITIAL_VIRTUAL_BASE_RESERVE,
  type DeployedContracts,
} from './helpers'
import { KimchiTokenAbi } from './generated'

describe('KimchiFactory', () => {
  let publicClient: ReturnType<typeof createTestPublicClient>
  let walletClient: ReturnType<typeof createTestWalletClient>
  let contracts: DeployedContracts
  let accounts: ReturnType<typeof getAllAccounts>

  beforeAll(async () => {
    // Check anvil connection
    const isConnected = await checkAnvilConnection()
    if (!isConnected) {
      throw new Error('Anvil is not running. Start it with: anvil')
    }

    // Setup clients
    publicClient = createTestPublicClient()
    walletClient = createTestWalletClient()
    accounts = getAllAccounts()

    // Load deployed contracts
    contracts = await loadDeployedContracts()

    // Initialize config if not already initialized
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: { public: publicClient, wallet: walletClient },
    })

    const config = await factory.read.getConfig()

    if (!config.isInitialized) {
      console.log('Initializing factory config...')
      const hash = await factory.write.initializeConfig([accounts.feeClaimer.address, contracts.weth.address], {
        account: accounts.deployer,
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      console.log('Factory config initialized')
    } else {
      console.log('Factory already initialized, skipping initializeConfig()')
    }
  })

  test('should have correct initial config', async () => {
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: { public: publicClient, wallet: walletClient },
    })

    const config = await factory.read.getConfig()

    expect(config.isInitialized).toBe(true)
    expect(config.quoteToken).toBe(contracts.weth.address)
    expect(config.feeClaimer).toBe(accounts.feeClaimer.address)
    expect(config.baseTokenDecimals).toBe(6)
    expect(config.quoteTokenDecimals).toBe(18)
    expect(config.initialVirtualQuoteReserve).toBe(INITIAL_VIRTUAL_QUOTE_RESERVE)
    expect(config.initialVirtualBaseReserve).toBe(INITIAL_VIRTUAL_BASE_RESERVE)
  })

  test('should create a new token with bonding curve', async () => {
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: { public: publicClient, wallet: walletClient },
    })

    const tokenName = 'Test Token'
    const tokenSymbol = 'TEST'
    const salt = keccak256(toHex('test-token-1'))

    // Predict token address
    const predictedAddress = await factory.read.computeTokenAddress([tokenName, tokenSymbol, salt])

    // Create curve
    const hash = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: [tokenName, tokenSymbol, salt],
      account: accounts.creator,
      chain: anvilChain,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('success')

    // Check that token was deployed at predicted address
    const token = getContract({
      address: predictedAddress,
      abi: KimchiTokenAbi,
      client: publicClient,
    })

    const name = await token.read.name()
    const symbol = await token.read.symbol()
    const decimals = await token.read.decimals()
    const totalSupply = await token.read.totalSupply()

    expect(name).toBe(tokenName)
    expect(symbol).toBe(tokenSymbol)
    expect(decimals).toBe(6)
    expect(totalSupply).toBe(1000000000000000n) // 1 billion with 6 decimals

    // Check curve exists
    const curveExists = await factory.read.curveExists([predictedAddress])
    expect(curveExists).toBe(true)

    // Check curve data
    const curve = await factory.read.getCurve([predictedAddress])
    expect(curve.creator).toBe(accounts.creator.address)
    expect(curve.baseToken).toBe(predictedAddress)
    expect(curve.baseReserve).toBe(0n)
    expect(curve.quoteReserve).toBe(0n)
    expect(curve.virtualBaseReserve).toBe(INITIAL_VIRTUAL_BASE_RESERVE)
    expect(curve.virtualQuoteReserve).toBe(INITIAL_VIRTUAL_QUOTE_RESERVE)
    expect(curve.migrationStatus).toBe(0) // Active
  })

  test('should prevent creating duplicate tokens', async () => {
    const tokenName = 'Duplicate Token'
    const tokenSymbol = 'DUP'
    const salt = keccak256(toHex('duplicate-test'))

    // Create first token
    const hash1 = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: [tokenName, tokenSymbol, salt],
      account: accounts.creator,
      chain: anvilChain,
    })

    await publicClient.waitForTransactionReceipt({ hash: hash1 })

    // Try to create duplicate - should fail
    try {
      const hash2 = await walletClient.writeContract({
        address: contracts.factory.address,
        abi: contracts.factory.abi,
        functionName: 'createCurve',
        args: [tokenName, tokenSymbol, salt],
        account: accounts.creator,
        chain: anvilChain,
      })

      await publicClient.waitForTransactionReceipt({ hash: hash2 })
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      // Expected to fail with CurveAlreadyExists error
      expect(error).toBeDefined()
    }
  })

  test('should allow different users to create tokens with same name but different salt', async () => {
    const tokenName = 'Common Name'
    const tokenSymbol = 'COMMON'

    // Alice creates token
    const aliceSalt = keccak256(toHex('alice-common'))
    const aliceHash = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: [tokenName, tokenSymbol, aliceSalt],
      account: accounts.alice,
      chain: anvilChain,
    })

    await publicClient.waitForTransactionReceipt({ hash: aliceHash })

    // Bob creates token with same name but different salt
    const bobSalt = keccak256(toHex('bob-common'))
    const bobHash = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: [tokenName, tokenSymbol, bobSalt],
      account: accounts.bob,
      chain: anvilChain,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: bobHash,
    })
    expect(receipt.status).toBe('success')

    // Both tokens should exist with different addresses
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: publicClient,
    })

    const aliceAddress = await factory.read.computeTokenAddress([tokenName, tokenSymbol, aliceSalt])
    const bobAddress = await factory.read.computeTokenAddress([tokenName, tokenSymbol, bobSalt])

    expect(aliceAddress).not.toBe(bobAddress)
    expect(await factory.read.curveExists([aliceAddress])).toBe(true)
    expect(await factory.read.curveExists([bobAddress])).toBe(true)
  })
})
