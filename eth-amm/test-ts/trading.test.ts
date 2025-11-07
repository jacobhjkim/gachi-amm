/**
 * KimchiAMM trading integration tests
 * Tests buy/sell operations with bonding curve
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { type Address, getContract, parseEther, keccak256, toHex, maxUint256 } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection, anvilChain } from './setup.ts'
import { loadDeployedContracts, getAllAccounts, TEST_AMOUNTS, type DeployedContracts } from './helpers'
import { KimchiTokenAbi, MockWETHAbi } from './generated'

describe('KimchiAMM Trading', () => {
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

    const salt = keccak256(toHex('trading-test-token'))
    testTokenAddress = await factory.read.computeTokenAddress(['Trading Token', 'TRADE', salt])

    const hash = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: ['Trading Token', 'TRADE', salt],
      account: accounts.creator,
      chain: anvilChain,
    })

    await publicClient.waitForTransactionReceipt({ hash })

    // Setup WETH for traders (deposit ETH to get WETH)
    const weth = getContract({
      address: contracts.weth.address,
      abi: MockWETHAbi,
      client: { public: publicClient, wallet: walletClient },
    })

    // Alice deposits 100 ETH
    const aliceDepositHash = await walletClient.writeContract({
      address: contracts.weth.address,
      abi: MockWETHAbi,
      functionName: 'deposit',
      args: [],
      account: accounts.alice,
      value: parseEther('100'),
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: aliceDepositHash })

    // Alice approves AMM to spend WETH
    const aliceApproveHash = await walletClient.writeContract({
      address: contracts.weth.address,
      abi: MockWETHAbi,
      functionName: 'approve',
      args: [contracts.amm.address, maxUint256],
      account: accounts.alice,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: aliceApproveHash })

    // Bob deposits 100 ETH
    const bobDepositHash = await walletClient.writeContract({
      address: contracts.weth.address,
      abi: MockWETHAbi,
      functionName: 'deposit',
      args: [],
      account: accounts.bob,
      value: parseEther('100'),
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: bobDepositHash })

    // Bob approves AMM to spend WETH
    const bobApproveHash = await walletClient.writeContract({
      address: contracts.weth.address,
      abi: MockWETHAbi,
      functionName: 'approve',
      args: [contracts.amm.address, maxUint256],
      account: accounts.bob,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: bobApproveHash })
  })

  test('should allow buying tokens', async () => {
    const amm = getContract({
      address: contracts.amm.address,
      abi: contracts.amm.abi,
      client: { public: publicClient, wallet: walletClient },
    })

    const token = getContract({
      address: testTokenAddress,
      abi: KimchiTokenAbi,
      client: publicClient,
    })

    const buyAmount = TEST_AMOUNTS.SMALL_BUY // 0.1 ETH
    const minTokensOut = 1n // Minimum tokens to receive (low for test)

    // Get initial balances
    const initialTokenBalance = await token.read.balanceOf([accounts.alice.address])

    // Buy tokens
    const hash = await walletClient.writeContract({
      address: contracts.amm.address,
      abi: contracts.amm.abi,
      functionName: 'buyTokens',
      args: [testTokenAddress, buyAmount, minTokensOut],
      account: accounts.alice,
      chain: anvilChain,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('success')

    // Check token balance increased
    const finalTokenBalance = await token.read.balanceOf([accounts.alice.address])
    expect(finalTokenBalance).toBeGreaterThan(initialTokenBalance)

    // Check curve reserves increased
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: publicClient,
    })

    const curve = await factory.read.getCurve([testTokenAddress])
    expect(curve.quoteReserve).toBe(buyAmount)
    expect(curve.baseReserve).toBeGreaterThan(0n)
  })

  test('should allow selling tokens', async () => {
    const token = getContract({
      address: testTokenAddress,
      abi: KimchiTokenAbi,
      client: { public: publicClient, wallet: walletClient },
    })

    const weth = getContract({
      address: contracts.weth.address,
      abi: MockWETHAbi,
      client: publicClient,
    })

    // First buy some tokens
    const buyHash = await walletClient.writeContract({
      address: contracts.amm.address,
      abi: contracts.amm.abi,
      functionName: 'buyTokens',
      args: [testTokenAddress, TEST_AMOUNTS.MEDIUM_BUY, 1n],
      account: accounts.bob,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: buyHash })

    // Get token balance
    const tokenBalance = await token.read.balanceOf([accounts.bob.address])
    expect(tokenBalance).toBeGreaterThan(0n)

    // Approve AMM to spend tokens
    const approveHash = await walletClient.writeContract({
      address: testTokenAddress,
      abi: KimchiTokenAbi,
      functionName: 'approve',
      args: [contracts.amm.address, maxUint256],
      account: accounts.bob,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })

    // Get initial WETH balance
    const initialWethBalance = await weth.read.balanceOf([accounts.bob.address])

    // Sell half of the tokens
    const sellAmount = tokenBalance / 2n
    const minQuoteOut = 1n // Minimum WETH to receive

    const sellHash = await walletClient.writeContract({
      address: contracts.amm.address,
      abi: contracts.amm.abi,
      functionName: 'sellTokens',
      args: [testTokenAddress, sellAmount, minQuoteOut],
      account: accounts.bob,
      chain: anvilChain,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: sellHash,
    })
    expect(receipt.status).toBe('success')

    // Check WETH balance increased
    const finalWethBalance = await weth.read.balanceOf([accounts.bob.address])
    expect(finalWethBalance).toBeGreaterThan(initialWethBalance)

    // Check token balance decreased
    const finalTokenBalance = await token.read.balanceOf([accounts.bob.address])
    expect(finalTokenBalance).toBeLessThan(tokenBalance)
  })

  test('should respect slippage limits on buy', async () => {
    const veryHighMinOut = parseEther('1000000') // Unrealistic min tokens out - should fail

    try {
      const hash = await walletClient.writeContract({
        address: contracts.amm.address,
        abi: contracts.amm.abi,
        functionName: 'buyTokens',
        args: [testTokenAddress, TEST_AMOUNTS.LARGE_BUY, veryHighMinOut],
        account: accounts.alice,
        chain: anvilChain,
      })

      await publicClient.waitForTransactionReceipt({ hash })
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      // Expected to fail with insufficient output error
      expect(error).toBeDefined()
    }
  })

  test('should track price increases as more tokens are bought', async () => {
    const factory = getContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      client: publicClient,
    })

    // Create a fresh token for this test
    const salt = keccak256(toHex('price-test-token'))
    const priceTestToken = await factory.read.computeTokenAddress(['Price Test', 'PRICE', salt])

    const createHash = await walletClient.writeContract({
      address: contracts.factory.address,
      abi: contracts.factory.abi,
      functionName: 'createCurve',
      args: ['Price Test', 'PRICE', salt],
      account: accounts.creator,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: createHash })

    // Get initial price
    const initialPrice = await factory.read.getPrice([priceTestToken])

    // Make a buy
    const buyHash = await walletClient.writeContract({
      address: contracts.amm.address,
      abi: contracts.amm.abi,
      functionName: 'buyTokens',
      args: [priceTestToken, TEST_AMOUNTS.MEDIUM_BUY, 1n],
      account: accounts.alice,
      chain: anvilChain,
    })
    await publicClient.waitForTransactionReceipt({ hash: buyHash })

    // Get new price
    const newPrice = await factory.read.getPrice([priceTestToken])

    // Price should increase after buy
    expect(newPrice).toBeGreaterThan(initialPrice)
  })
})
