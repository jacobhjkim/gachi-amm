import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { type Address, type Hex, parseUnits, formatUnits, parseEventLogs } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'
import { randomBytes } from 'crypto'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

// Helper function to generate random requestId
const generateRequestId = () => `0x${randomBytes(32).toString('hex')}` as Hex

describe('Trading', () => {
	let client: ReturnType<typeof createTestPublicClient>
	let walletClient: ReturnType<typeof createTestWalletClient>
	let contracts: DeployedContracts
	let accounts: ReturnType<typeof getAllAccounts>
	let snapshotId: Hex

	// Token and curve addresses for tests
	let testTokenAddress: Address
	let testCurveAddress: Address

	beforeAll(async () => {
		// Check anvil connection
		const isConnected = await checkAnvilConnection()
		if (!isConnected) {
			throw new Error('Anvil is not running. Start it with: anvil')
		}

		client = createTestPublicClient()
		walletClient = createTestWalletClient()
		accounts = getAllAccounts()
		contracts = await loadDeployedContracts()

		// Create a test token for trading tests
		const requestId = generateRequestId()
		const { result, request: createRequest } = await client.simulateContract({
			account: accounts.alice,
			address: contracts.factory.address,
			abi: contracts.factory.abi,
			functionName: 'mintTokenAndCreateCurve',
			args: ['Test Token', 'TEST', requestId],
		})

		// Get token and curve addresses from return value
		testTokenAddress = result[0]
		testCurveAddress = result[1]

		const createHash = await walletClient.writeContract(createRequest)
		await client.waitForTransactionReceipt({ hash: createHash })

		console.log(`\n📋 Test Setup:`)
		console.log(`  Test token: ${testTokenAddress}`)
		console.log(`  Test curve: ${testCurveAddress}`)

		// Mint USDC to Alice and Bob for trading
		const mintAmount = parseUnits('10000', 6) // 10k USDC each
		for (const account of [accounts.alice, accounts.bob]) {
			const { request: mintRequest } = await client.simulateContract({
				account: accounts.deployer,
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'mint',
				args: [account.address, mintAmount],
			})
			await walletClient.writeContract(mintRequest)

			// Approve USDC spending for curve
			const { request: approveRequest } = await client.simulateContract({
				account: account,
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'approve',
				args: [testCurveAddress, mintAmount],
			})
			await walletClient.writeContract(approveRequest)
		}

		snapshotId = await client.snapshot()
	})

	beforeEach(async () => {
		// Revert to snapshot before each test to ensure clean state
		await client.revert({ id: snapshotId })
		// Take a new snapshot for the next test
		snapshotId = await client.snapshot()
	})

	describe('Buying Tokens (Quote → Base)', () => {
		test('buys tokens with USDC', async () => {
			const amountIn = BigInt(100 * 10 ** 6) // 100 USDC

			const [aliceUsdcBefore, aliceTokenBefore, { request }] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.alice.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.alice.address],
				}),
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, amountIn, 0n], // quoteToBase = true
				}),
			])

			const hash = await walletClient.writeContract(request)
			const receipt = await client.waitForTransactionReceipt({ hash })

			// Check Swap event
			const logs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: receipt.logs,
			})

			expect(logs.length).toBe(1)
			const swapEvent = logs[0]!.args

			expect(swapEvent.quoteToBase).toBe(true)
			expect(swapEvent.amountIn).toBe(amountIn)
			expect(swapEvent.amountOut).toBeGreaterThan(0n)

			// Verify balances changed correctly
			const [aliceUsdcAfter, aliceTokenAfter] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.alice.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.alice.address],
				}),
			])

			expect(aliceUsdcBefore - aliceUsdcAfter).toBe(amountIn)
			expect(aliceTokenAfter - aliceTokenBefore).toBe(swapEvent.amountOut)
		})

		test('updates reserves correctly after buy', async () => {
			const amountIn = parseUnits('100', 6)

			const [stateBefore, { request }] = await Promise.all([
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'state',
				}),
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, amountIn, 0n],
				}),
			])

			const hash = await walletClient.writeContract(request)
			const receipt = await client.waitForTransactionReceipt({ hash })

			const logs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: receipt.logs,
			})

			const swapEvent = logs[0]!.args
			const grossAmountOut = swapEvent.amountOut + swapEvent.tradingFee

			const stateAfter = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'state',
			})

			console.log(`\n📊 Reserve Changes:`)
			console.log(
				`  Virtual Quote: ${formatUnits(stateBefore.virtualQuoteReserve, 6)} → ${formatUnits(stateAfter.virtualQuoteReserve, 6)} USDC`,
			)
			console.log(
				`  Virtual Base: ${formatUnits(stateBefore.virtualBaseReserve, 6)} → ${formatUnits(stateAfter.virtualBaseReserve, 6)} tokens`,
			)
			console.log(
				`  Base Reserve: ${formatUnits(stateBefore.baseReserve, 6)} → ${formatUnits(stateAfter.baseReserve, 6)} tokens`,
			)

			// Virtual quote reserve should increase by actualAmountIn (after fees)
			// Fee is deducted from input before swap, so reserves only see the net amount
			const actualAmountIn = amountIn - swapEvent.tradingFee
			expect(stateAfter.virtualQuoteReserve).toBe(stateBefore.virtualQuoteReserve + actualAmountIn)

			// Virtual base reserve should decrease
			expect(stateAfter.virtualBaseReserve).toBeLessThan(stateBefore.virtualBaseReserve)

			// Base reserve should decrease by output amount
			expect(stateAfter.baseReserve).toBe(stateBefore.baseReserve - swapEvent.amountOut)

			// Verify constant product formula: k should be approximately maintained
			const kBefore = stateBefore.virtualQuoteReserve * stateBefore.virtualBaseReserve
			const kAfter = stateAfter.virtualQuoteReserve * stateAfter.virtualBaseReserve

			// Allow for small rounding errors
			const diff = kAfter > kBefore ? kAfter - kBefore : kBefore - kAfter
			const diffPercent = (diff * 10000n) / kBefore

			console.log(`  k before: ${kBefore}`)
			console.log(`  k after:  ${kAfter}`)
			console.log(`  diff:     ${diffPercent / 100n}.${diffPercent % 100n}%`)

			expect(diffPercent).toBeLessThan(100n) // Less than 1% difference
		})

		test('respects slippage protection', async () => {
			const amountIn = parseUnits('100', 6)

			// Simulate to get expected output
			const { request } = await client.simulateContract({
				account: accounts.alice,
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'swap',
				args: [accounts.alice.address, true, amountIn, 0n],
			})

			const hash = await walletClient.writeContract(request)
			const receipt = await client.waitForTransactionReceipt({ hash })

			const logs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: receipt.logs,
			})

			const expectedOutput = logs[0]!.args.amountOut

			// Revert to try again with higher minAmountOut
			await client.revert({ id: snapshotId })
			snapshotId = await client.snapshot()

			// Now try with minAmountOut higher than actual output - should fail
			const unrealisticMinOut = expectedOutput * 2n

			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, amountIn, unrealisticMinOut],
				}),
			).rejects.toThrow()
		})

		test('calculates price correctly (price increases as buying)', async () => {
			// Buy tokens in multiple trades and verify price increases
			const trades = 3
			const amountPerTrade = parseUnits('100', 6)
			const outputs: bigint[] = []

			for (let i = 0; i < trades; i++) {
				const { request } = await client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, amountPerTrade, 0n],
				})

				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				const logs = parseEventLogs({
					abi: contracts.curve.abi,
					eventName: 'Swap',
					logs: receipt.logs,
				})

				outputs.push(logs[0]!.args.amountOut)
			}

			console.log(`\n📈 Price Increase Test:`)
			for (let i = 0; i < trades; i++) {
				const price = (amountPerTrade * parseUnits('1', 6)) / outputs[i]!
				console.log(`  Trade ${i + 1}: ${formatUnits(outputs[i]!, 6)} tokens → ${formatUnits(price, 6)} USDC per token`)
			}

			// Each subsequent trade should get fewer tokens (price increasing)
			expect(outputs[1]!).toBeLessThan(outputs[0]!)
			expect(outputs[2]!).toBeLessThan(outputs[1]!)
		})
	})

	describe('Selling Tokens (Base → Quote)', () => {
		test('sells tokens for USDC', async () => {
			// First buy some tokens
			const buyAmount = parseUnits('100', 6)
			const { request: buyRequest } = await client.simulateContract({
				account: accounts.alice,
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'swap',
				args: [accounts.alice.address, true, buyAmount, 0n],
			})

			const buyHash = await walletClient.writeContract(buyRequest)
			const buyReceipt = await client.waitForTransactionReceipt({ hash: buyHash })

			const buyLogs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: buyReceipt.logs,
			})

			const tokensBought = buyLogs[0]!.args.amountOut

			// Approve tokens for selling
			const { request: approveRequest } = await client.simulateContract({
				account: accounts.alice,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'approve',
				args: [testCurveAddress, tokensBought],
			})
			await walletClient.writeContract(approveRequest)

			// Now sell half the tokens
			const sellAmount = tokensBought / 2n

			const [aliceUsdcBefore, { request: sellRequest }] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.alice.address],
				}),
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, false, sellAmount, 0n], // quoteToBase = false
				}),
			])

			const sellHash = await walletClient.writeContract(sellRequest)
			const sellReceipt = await client.waitForTransactionReceipt({ hash: sellHash })

			const sellLogs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: sellReceipt.logs,
			})

			const sellEvent = sellLogs[0]!.args

			console.log(`\n💸 Sell Trade:`)
			console.log(`  Input: ${formatUnits(sellEvent.amountIn, 6)} tokens`)
			console.log(`  Output: ${formatUnits(sellEvent.amountOut, 6)} USDC`)
			console.log(`  Fee: ${formatUnits(sellEvent.tradingFee, 6)} USDC`)

			expect(sellEvent.quoteToBase).toBe(false)
			expect(sellEvent.amountIn).toBe(sellAmount)
			expect(sellEvent.amountOut).toBeGreaterThan(0n)

			// Verify Alice received USDC
			const aliceUsdcAfter = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.alice.address],
			})

			expect(aliceUsdcAfter - aliceUsdcBefore).toBe(sellEvent.amountOut)
		})

		test('updates reserves correctly after sell', async () => {
			// First buy some tokens
			const buyAmount = parseUnits('100', 6)
			const { request: buyRequest } = await client.simulateContract({
				account: accounts.alice,
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'swap',
				args: [accounts.alice.address, true, buyAmount, 0n],
			})

			const buyHash = await walletClient.writeContract(buyRequest)
			const buyReceipt = await client.waitForTransactionReceipt({ hash: buyHash })

			const buyLogs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: buyReceipt.logs,
			})

			const tokensBought = buyLogs[0]!.args.amountOut

			// Approve and sell
			const { request: approveRequest } = await client.simulateContract({
				account: accounts.alice,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'approve',
				args: [testCurveAddress, tokensBought],
			})
			await walletClient.writeContract(approveRequest)

			const [stateBefore, { request: sellRequest }] = await Promise.all([
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'state',
				}),
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, false, tokensBought, 0n],
				}),
			])

			const sellHash = await walletClient.writeContract(sellRequest)
			const sellReceipt = await client.waitForTransactionReceipt({ hash: sellHash })

			const sellLogs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: sellReceipt.logs,
			})

			const sellEvent = sellLogs[0]!.args

			const stateAfter = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'state',
			})

			console.log(`\n📊 Reserve Changes (Sell):`)
			console.log(
				`  Virtual Quote: ${formatUnits(stateBefore.virtualQuoteReserve, 6)} → ${formatUnits(stateAfter.virtualQuoteReserve, 6)} USDC`,
			)
			console.log(
				`  Virtual Base: ${formatUnits(stateBefore.virtualBaseReserve, 6)} → ${formatUnits(stateAfter.virtualBaseReserve, 6)} tokens`,
			)
			console.log(
				`  Base Reserve: ${formatUnits(stateBefore.baseReserve, 6)} → ${formatUnits(stateAfter.baseReserve, 6)} tokens`,
			)

			// Virtual base reserve should increase
			expect(stateAfter.virtualBaseReserve).toBeGreaterThan(stateBefore.virtualBaseReserve)

			// Virtual quote reserve should decrease
			expect(stateAfter.virtualQuoteReserve).toBeLessThan(stateBefore.virtualQuoteReserve)

			// Base reserve should increase by input amount
			expect(stateAfter.baseReserve).toBe(stateBefore.baseReserve + sellEvent.amountIn)
		})
	})

	describe('Fee Distribution', () => {
		test('accumulates protocol and creator fees', async () => {
			const amountIn = parseUnits('100', 6)

			const [stateBefore, { request }] = await Promise.all([
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'state',
				}),
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, amountIn, 0n],
				}),
			])

			const hash = await walletClient.writeContract(request)
			const receipt = await client.waitForTransactionReceipt({ hash })

			const logs = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Swap',
				logs: receipt.logs,
			})

			const swapEvent = logs[0]!.args

			const stateAfter = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'state',
			})

			console.log(`\n💰 Fee Accumulation:`)
			console.log(`  Protocol fee: ${formatUnits(swapEvent.protocolFee, 6)} tokens`)
			console.log(`  Creator fee: ${formatUnits(swapEvent.creatorFee, 6)} tokens`)

			// Fees should be accumulated
			expect(stateAfter.protocolFee).toBe(stateBefore.protocolFee + swapEvent.protocolFee)
			expect(stateAfter.creatorFee).toBe(stateBefore.creatorFee + swapEvent.creatorFee)
		})
	})

	describe('Edge Cases', () => {
		test('prevents zero amount swaps', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, 0n, 0n],
				}),
			).rejects.toThrow()
		})

		test('prevents invalid recipient', async () => {
			const amountIn = parseUnits('100', 6)

			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [ZERO_ADDRESS, true, amountIn, 0n],
				}),
			).rejects.toThrow()
		})
	})
})
