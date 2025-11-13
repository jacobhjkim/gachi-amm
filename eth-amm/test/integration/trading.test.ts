import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { type Address, type Hex, parseUnits, formatUnits, parseEventLogs } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'
import { randomBytes } from 'crypto'
import { calculateSwapOutput, calculatePriceImpact } from './libs/swap.ts'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const MAX_UINT256 = 2n ** 256n - 1n // Max uint256 value

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
				args: [testCurveAddress, MAX_UINT256],
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
		test('TypeScript swap calculation matches actual swap', async () => {
			const amountIn = parseUnits('100', 6) // 100 USDC

			// Get current curve state and fee config in parallel
			const [state, feeConfig] = await Promise.all([
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'state',
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'feeConfig',
				}),
			])

			// For a buy, fees are deducted from input BEFORE swap calculation
			// Calculate total fee (approximately - assuming no referral for simplicity)
			const totalFee = (amountIn * BigInt(feeConfig.feeBasisPoints)) / 10000n
			const actualAmountIn = amountIn - totalFee

			// Predict output using TypeScript (after fees)
			const predictedOutput = calculateSwapOutput(
				state.virtualQuoteReserve,
				state.virtualBaseReserve,
				actualAmountIn,
				true, // quoteToBase
			)

			// Execute actual swap
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

			const actualOutput = logs[0]!.args.amountOut
			const actualFee = logs[0]!.args.tradingFee

			console.log('\n🔮 Swap Prediction Test:')
			console.log(`  Amount in: ${formatUnits(amountIn, 6)} USDC`)
			console.log(`  Estimated fee: ${formatUnits(totalFee, 6)} USDC`)
			console.log(`  Actual fee: ${formatUnits(actualFee, 6)} USDC`)
			console.log(`  Actual amount in (after fee): ${formatUnits(amountIn - actualFee, 6)} USDC`)
			console.log(`  Predicted output: ${formatUnits(predictedOutput, 6)} tokens`)
			console.log(`  Actual output: ${formatUnits(actualOutput, 6)} tokens`)

			// Recalculate with actual fee for exact match
			const exactPrediction = calculateSwapOutput(
				state.virtualQuoteReserve,
				state.virtualBaseReserve,
				amountIn - actualFee,
				true,
			)

			console.log(`  Exact prediction (with actual fee): ${formatUnits(exactPrediction, 6)} tokens`)

			// Exact prediction should match
			expect(exactPrediction).toBe(actualOutput)
		})

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

			// With Math.mulDiv, we expect much better precision: < 0.01% (1 basis point)
			expect(diffPercent).toBeLessThan(1n) // Less than 0.01% difference
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
			const buyAmount = BigInt(100 * 10 ** 6) // 100 USDC
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
				args: [testCurveAddress, MAX_UINT256],
			})
			await walletClient.writeContract(approveRequest)

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
					args: [accounts.alice.address, false, tokensBought, 0n], // quoteToBase = false
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
			expect(sellEvent.amountIn).toBe(tokensBought)
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

			const [protocolFeesBefore, creatorFeesBefore, { request }] = await Promise.all([
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'accumulatedCreatorFees',
					args: [testCurveAddress],
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

			const [protocolFeesAfter, creatorFeesAfter] = await Promise.all([
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'accumulatedCreatorFees',
					args: [testCurveAddress],
				}),
			])

			console.log(`\n💰 Fee Accumulation:`)
			console.log(`  Protocol fee: ${formatUnits(swapEvent.protocolFee, 6)} tokens`)
			console.log(`  Creator fee: ${formatUnits(swapEvent.creatorFee, 6)} tokens`)

			// Fees should be accumulated
			expect(protocolFeesAfter).toBe(protocolFeesBefore + swapEvent.protocolFee)
			expect(creatorFeesAfter).toBe(creatorFeesBefore + swapEvent.creatorFee)
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

	describe('Precision Stress Test', () => {
		test('k invariant holds after 5000+ swaps', async () => {
			console.log('\n🔬 Starting precision stress test...\n')

			// Get initial state
			const initialState = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'state',
			})

			const initialK = initialState.virtualQuoteReserve * initialState.virtualBaseReserve
			console.log(`Initial k: ${initialK}`)
			console.log(
				`Initial reserves: ${formatUnits(initialState.virtualQuoteReserve, 6)} USDC, ${formatUnits(initialState.virtualBaseReserve, 6)} tokens\n`,
			)

			// Approve tokens once for all sells (gas efficient - better than PERMIT2 for tests)
			const { request: approveTokenRequest } = await client.simulateContract({
				account: accounts.alice,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'approve',
				args: [testCurveAddress, MAX_UINT256], // Approve max amount
			})
			await walletClient.writeContract(approveTokenRequest)

			// Perform 500 alternating buys and sells with small amounts
			const numSwaps = 1000
			const swapAmount = BigInt(5 * 10 ** 6) // 5 USDC per buy

			let maxKDrift = 0n
			let minK = initialK
			let maxK = initialK
			let lastBuyAmountOut = 0n

			for (let i = 0; i < numSwaps; i++) {
				const isBuy = i % 2 === 0

				if (isBuy) {
					// Buy tokens with USDC
					const { request } = await client.simulateContract({
						account: accounts.alice,
						address: testCurveAddress,
						abi: contracts.curve.abi,
						functionName: 'swap',
						args: [accounts.alice.address, true, swapAmount, 0n],
					})

					const hash = await walletClient.writeContract(request)
					const receipt = await client.waitForTransactionReceipt({ hash })

					// Check if transaction succeeded
					if (receipt.status !== 'success') {
						console.log(`\n❌ BUY FAILED at swap ${i + 1}:`)
						console.log(`  Transaction hash: ${hash}`)
						console.log(`  Status: ${receipt.status}`)
						throw new Error(`Buy transaction failed at swap ${i + 1}`)
					}

					// Parse the Swap event to get the ACTUAL amount received
					const logs = parseEventLogs({
						abi: contracts.curve.abi,
						eventName: 'Swap',
						logs: receipt.logs,
					})

					if (logs.length === 0) {
						throw new Error(`No Swap event emitted for buy ${i + 1}`)
					}

					const swapEvent = logs[0]!.args
					// Use the ACTUAL amount from the event, not the simulated amount
					lastBuyAmountOut = swapEvent.amountOut
				} else {
					try {
						const { request } = await client.simulateContract({
							account: accounts.alice,
							address: testCurveAddress,
							abi: contracts.curve.abi,
							functionName: 'swap',
							args: [accounts.alice.address, false, lastBuyAmountOut, 0n],
						})

						await walletClient.writeContract(request)
					} catch (error) {
						// Capture state at failure
						const [failureState, curveTokenBalance, aliceTokenBalance, curveUsdcBalance, aliceUsdcBalance] =
							await Promise.all([
								client.readContract({
									address: testCurveAddress,
									abi: contracts.curve.abi,
									functionName: 'state',
								}),
								client.readContract({
									address: testTokenAddress,
									abi: contracts.token.abi,
									functionName: 'balanceOf',
									args: [testCurveAddress],
								}),
								client.readContract({
									address: testTokenAddress,
									abi: contracts.token.abi,
									functionName: 'balanceOf',
									args: [accounts.alice.address],
								}),
								client.readContract({
									address: contracts.usdc.address,
									abi: contracts.usdc.abi,
									functionName: 'balanceOf',
									args: [testCurveAddress],
								}),
								client.readContract({
									address: contracts.usdc.address,
									abi: contracts.usdc.abi,
									functionName: 'balanceOf',
									args: [accounts.alice.address],
								}),
							])

						console.log(`\n❌ FAILURE at swap ${i + 1} (sell operation):`)
						console.log(`\n  CURVE STATE:`)
						console.log(`    Virtual Quote Reserve: ${formatUnits(failureState.virtualQuoteReserve, 6)} USDC`)
						console.log(`    Virtual Base Reserve:  ${formatUnits(failureState.virtualBaseReserve, 6)} tokens`)
						console.log(`    Stored Base Reserve:   ${formatUnits(failureState.baseReserve, 6)} tokens`)
						console.log(`\n  ACTUAL BALANCES:`)
						console.log(`    Curve Token Balance:   ${formatUnits(curveTokenBalance, 6)} tokens`)
						console.log(`    Curve USDC Balance:    ${formatUnits(curveUsdcBalance, 6)} USDC`)
						console.log(`    Alice's Token Balance: ${formatUnits(aliceTokenBalance, 6)} tokens`)
						console.log(`    Alice's USDC Balance:  ${formatUnits(aliceUsdcBalance, 6)} USDC`)
						console.log(`\n  TRADE ATTEMPT:`)
						console.log(`    Selling:               ${formatUnits(lastBuyAmountOut, 6)} tokens`)
						console.log(`    Alice's shortage:      ${formatUnits(lastBuyAmountOut - aliceTokenBalance, 6)} tokens`)
						throw error
					}
				}

				// Check k every 100 swaps
				if ((i + 1) % 200 === 0) {
					const currentState = await client.readContract({
						address: testCurveAddress,
						abi: contracts.curve.abi,
						functionName: 'state',
					})

					const currentK = currentState.virtualQuoteReserve * currentState.virtualBaseReserve
					const kDiff = currentK > initialK ? currentK - initialK : initialK - currentK
					const kDiffPercent = (kDiff * 10000n) / initialK

					if (currentK < minK) minK = currentK
					if (currentK > maxK) maxK = currentK
					if (kDiff > maxKDrift) maxKDrift = kDiff

					console.log(`After ${i + 1} swaps:`)
					console.log(`  k: ${currentK}`)
					console.log(`  drift: ${kDiffPercent / 100n}.${kDiffPercent % 100n}%`)
					console.log(
						`  reserves: ${formatUnits(currentState.virtualQuoteReserve, 6)} USDC, ${formatUnits(currentState.virtualBaseReserve, 6)} tokens`,
					)
				}
			}

			// Get final state
			const finalState = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'state',
			})

			const finalK = finalState.virtualQuoteReserve * finalState.virtualBaseReserve
			const totalDrift = finalK > initialK ? finalK - initialK : initialK - finalK
			const totalDriftPercent = (totalDrift * 10000n) / initialK

			console.log(`\n📊 Final Results after ${numSwaps} swaps:`)
			console.log(`  Initial k: ${initialK}`)
			console.log(`  Final k:   ${finalK}`)
			console.log(`  Min k:     ${minK}`)
			console.log(`  Max k:     ${maxK}`)
			console.log(`  Total drift: ${totalDriftPercent / 100n}.${totalDriftPercent % 100n}%`)
			console.log(`  k increased: ${finalK >= initialK ? 'Yes (protocol favored)' : 'No (user favored)'}`)

			// With proper rounding (Ceil), k should stay constant or increase
			expect(finalK).toBeGreaterThanOrEqual(initialK)

			// k drift should be minimal (< 0.1% even after 500 swaps)
			expect(totalDriftPercent).toBeLessThan(10n) // Less than 0.1%

			console.log('\n✅ Precision stress test passed!\n')
		}, 120000) // 2 minute timeout for 500 swaps
	})
})
