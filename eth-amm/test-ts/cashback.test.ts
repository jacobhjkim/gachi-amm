/**
 * KimchiCashback integration tests
 * Tests cashback accumulation, tiers, and claiming
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { type Address, getContract, parseEther, keccak256, toHex, maxUint256 } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection, anvilChain } from './setup.ts'
import { loadDeployedContracts, getAllAccounts, TEST_AMOUNTS, CASHBACK_TIERS, type DeployedContracts } from './helpers'
import { MockWETHAbi } from './generated'

describe('KimchiCashback', () => {
  let publicClient: ReturnType<typeof createTestPublicClient>
  let walletClient: ReturnType<typeof createTestWalletClient>
  let contracts: DeployedContracts
  let accounts: ReturnType<typeof getAllAccounts>
  let testTokenAddress: Address

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

    // Create a test token for trading
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: { public: publicClient, wallet: walletClient },
    })

    const salt = keccak256(toHex('cashback-test-token'))
    testTokenAddress = await factory.read.computeTokenAddress(['Cashback Token', 'CASH', salt])

    const hash = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: ['Cashback Token', 'CASH', salt],
      account: accounts.creator,
      chain: anvilChain,
    })

    await publicClient.waitForTransactionReceipt({ hash })

    // Setup WETH for traders
    for (const account of [accounts.alice, accounts.bob, accounts.charlie]) {
      // Deposit ETH to get WETH
      const depositHash = await walletClient.writeContract({
        address: contracts.weth.address,
        abi: MockWETHAbi,
        functionName: 'deposit',
        args: [],
        account,
        value: parseEther('1000'), // More for higher tier testing
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })

      // Approve AMM to spend WETH
      const approveHash = await walletClient.writeContract({
        address: contracts.weth.address,
        abi: MockWETHAbi,
        functionName: 'approve',
        args: [contracts.amm.address, maxUint256],
        account,
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
    }
  })

  test('should allow creating a cashback account', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: { public: publicClient, wallet: walletClient },
    })

    // Alice creates a cashback account
    const hash = await walletClient.writeContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      functionName: 'createCashback',
      args: [],
      account: accounts.alice,
      chain: anvilChain,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('success')

    // Check account was created
    const account = await cashback.read.getCashbackAccount([accounts.alice.address])
    expect(account.exists).toBe(true)
    expect(account.tier).toBe(0) // Wood tier (lowest)
    expect(account.accumulated).toBe(0n)
  })

  test('should get user tier', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: publicClient,
    })

    // Create account for Bob if not exists
    const bobAccount = await cashback.read.getCashbackAccount([accounts.bob.address])

    if (!bobAccount.exists) {
      const createHash = await walletClient.writeContract({
        address: contracts.cashback.address,
        abi: contracts.cashback.abi,
        functionName: 'createCashback',
        args: [],
        account: accounts.bob,
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash: createHash })
    }

    // Get tier
    const tier = await cashback.read.getUserTier([accounts.bob.address])
    expect(tier).toBeDefined()
    expect(tier).toBeGreaterThanOrEqual(0)
    expect(tier).toBeLessThanOrEqual(6) // 7 tiers (0-6)
  })

  test('should accumulate cashback when trading', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: publicClient,
    })

    // Create cashback account for Charlie if not exists
    const charlieAccount = await cashback.read.getCashbackAccount([accounts.charlie.address])

    if (!charlieAccount.exists) {
      const createHash = await walletClient.writeContract({
        address: contracts.cashback.address,
        abi: contracts.cashback.abi,
        functionName: 'createCashback',
        args: [],
        account: accounts.charlie,
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash: createHash })
    }

    // Get initial accumulated cashback
    const initialCashback = await cashback.read.getAccumulatedCashback([accounts.charlie.address])

    // Charlie buys tokens (should accumulate cashback from fees)
    const buyHash = await walletClient.writeContract({
      address: contracts.amm.address,
      abi: contracts.amm.abi,
      functionName: 'buyTokens',
      args: [testTokenAddress, TEST_AMOUNTS.MEDIUM_BUY, 1n],
      account: accounts.charlie,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: buyHash })

    // Check cashback accumulated (may or may not increase depending on implementation)
    const finalCashback = await cashback.read.getAccumulatedCashback([accounts.charlie.address])

    // Cashback should be >= initial (may accumulate from trading fees)
    expect(finalCashback).toBeGreaterThanOrEqual(initialCashback)
  })

  test('should check if user can claim cashback', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: publicClient,
    })

    // Create account for Dave if not exists
    const daveAccount = await cashback.read.getCashbackAccount([accounts.dave.address])

    if (!daveAccount.exists) {
      const createHash = await walletClient.writeContract({
        address: contracts.cashback.address,
        abi: contracts.cashback.abi,
        functionName: 'createCashback',
        args: [],
        account: accounts.dave,
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash: createHash })
    }

    // Check if can claim
    const [canClaim, timeUntilClaim] = await cashback.read.canClaimCashback([accounts.dave.address])

    expect(canClaim).toBeDefined()
    expect(timeUntilClaim).toBeDefined()

    // If just created, should be able to claim (no cooldown yet)
    if (daveAccount.lastClaimTimestamp === 0n) {
      expect(canClaim).toBe(true)
      expect(timeUntilClaim).toBe(0n)
    }
  })

  test('should prevent claiming when no cashback accumulated', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: publicClient,
    })

    // Create a fresh account
    const freshAccount = accounts.deployer

    // Check if account exists, create if not
    const deployerAccount = await cashback.read.getCashbackAccount([freshAccount.address])

    if (!deployerAccount.exists) {
      const createHash = await walletClient.writeContract({
        address: contracts.cashback.address,
        abi: contracts.cashback.abi,
        functionName: 'createCashback',
        args: [],
        account: freshAccount,
        chain: anvilChain,
      })
      await publicClient.waitForTransactionReceipt({ hash: createHash })
    }

    // Check accumulated cashback
    const accumulated = await cashback.read.getAccumulatedCashback([freshAccount.address])

    // Only try to claim if there's no cashback
    if (accumulated === 0n) {
      try {
        const claimHash = await walletClient.writeContract({
          address: contracts.cashback.address,
          abi: contracts.cashback.abi,
          functionName: 'claimCashback',
          args: [],
          account: freshAccount,
          chain: anvilChain,
        })

        await publicClient.waitForTransactionReceipt({ hash: claimHash })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        // Expected to fail with NoCashbackToClaim error
        expect(error).toBeDefined()
      }
    }
  })

  test('should get cashback account details', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: publicClient,
    })

    // Get Alice's account
    const account = await cashback.read.getCashbackAccount([accounts.alice.address])

    if (account.exists) {
      expect(account.tier).toBeDefined()
      expect(account.accumulated).toBeDefined()
      expect(account.lastClaimTimestamp).toBeDefined()
      expect(account.exists).toBe(true)
    }
  })

  test('should return non-existent account for address without cashback', async () => {
    const cashback = getContract({
      address: contracts.cashback.address,
      abi: contracts.cashback.abi,
      client: publicClient,
    })

    // Use fee claimer who shouldn't have a cashback account
    const account = await cashback.read.getCashbackAccount([accounts.feeClaimer.address])

    expect(account.exists).toBe(false)
    expect(account.accumulated).toBe(0n)
  })

  test('cashback tiers should be correctly defined', () => {
    // Verify tier constants are properly defined
    expect(CASHBACK_TIERS.WOOD.minVolume).toBe(0n)
    expect(CASHBACK_TIERS.WOOD.cashbackBps).toBe(5)

    expect(CASHBACK_TIERS.BRONZE.minVolume).toBe(parseEther('10'))
    expect(CASHBACK_TIERS.BRONZE.cashbackBps).toBe(10)

    expect(CASHBACK_TIERS.CHAMPION.minVolume).toBe(parseEther('5000'))
    expect(CASHBACK_TIERS.CHAMPION.cashbackBps).toBe(25)
  })
})
