import { beforeAll, describe, expect, test } from 'bun:test'
import { parseUnits, parseEventLogs, type Address, type Hex } from 'viem'
import { randomBytes } from 'crypto'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup'
import { loadDeployedContracts } from './libs/contracts'
import { getAllAccounts } from './libs/accounts'

const MAX_UINT256 = 2n ** 256n - 1n
const GRADUATION_THRESHOLD = parseUnits('17250.803836', 6) // ~17,250 USDC

const generateRequestId = () => `0x${randomBytes(32).toString('hex')}` as Hex

describe('Migration Tests', () => {
	let client: ReturnType<typeof createTestPublicClient>
	let walletClient: ReturnType<typeof createTestWalletClient>
	let contracts: Awaited<ReturnType<typeof loadDeployedContracts>>
	let accounts: ReturnType<typeof getAllAccounts>

	let testTokenAddress: Address
	let testCurveAddress: Address

	beforeAll(async () => {
		// Check anvil connection
		const isConnected = await checkAnvilConnection()
		if (!isConnected) {
			throw new Error('Anvil is not running. Start it with: anvil')
		}

		// Initialize clients and load contracts
		client = createTestPublicClient()
		walletClient = createTestWalletClient()
		accounts = getAllAccounts()
		contracts = await loadDeployedContracts()

		// Create test token and curve
		const requestId = generateRequestId()
		const { result, request } = await client.simulateContract({
			account: accounts.alice,
			address: contracts.factory.address,
			abi: contracts.factory.abi,
			functionName: 'mintTokenAndCreateCurve',
			args: ['Test Token', 'TEST', requestId],
		})

		const [tokenAddr, curveAddr] = result
		testTokenAddress = tokenAddr
		testCurveAddress = curveAddr

		const hash = await walletClient.writeContract(request)
		await client.waitForTransactionReceipt({ hash })

		// Mint USDC to test accounts
		const mintAmount = parseUnits('100000', 6) // 100k USDC
		const { request: mintRequest } = await client.simulateContract({
			account: accounts.deployer,
			address: contracts.usdc.address,
			abi: contracts.usdc.abi,
			functionName: 'mint',
			args: [accounts.alice.address, mintAmount],
		})
		const mintHash = await walletClient.writeContract(mintRequest)
		await client.waitForTransactionReceipt({ hash: mintHash })

		// Approve USDC for curve
		const { request: approveRequest } = await client.simulateContract({
			account: accounts.alice,
			address: contracts.usdc.address,
			abi: contracts.usdc.abi,
			functionName: 'approve',
			args: [testCurveAddress, MAX_UINT256],
		})
		const approveHash = await walletClient.writeContract(approveRequest)
		await client.waitForTransactionReceipt({ hash: approveHash })
	})

	/**
	 * Helper function to graduate a curve by buying tokens until threshold is reached
	 */
	async function graduateCurve() {
		// Get current state
		const stateBefore = await client.readContract({
			address: testCurveAddress,
			abi: contracts.curve.abi,
			functionName: 'state',
		})

		const remaining = GRADUATION_THRESHOLD - stateBefore.virtualQuoteReserve
		// Buy enough to trigger graduation (add extra for fees)
		const buyAmount = (remaining * 12n) / 10n // 120% to account for fees and ensure graduation

		const { request } = await client.simulateContract({
			account: accounts.alice,
			address: testCurveAddress,
			abi: contracts.curve.abi,
			functionName: 'swap',
			args: [accounts.alice.address, true, buyAmount, 0n], // quoteToBase = true
		})
		const hash = await walletClient.writeContract(request)
		return await client.waitForTransactionReceipt({ hash })
	}

	describe('Pre-Migration Validations', () => {
		test('cannot migrate before graduation', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'migrate',
				}),
			).rejects.toThrow(/Curve must be graduated/)
		})

		test('successfully graduates curve via large buy', async () => {
			await graduateCurve()

			// Verify graduation status
			const [tokenGraduated, curveGraduated, curveState] = await Promise.all([
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'graduated',
				}),
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'graduated',
				}),
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'state',
				}),
			])

			// Token should NOT be graduated yet (only after migration)
			expect(tokenGraduated).toBe(false)
			// But curve should be graduated
			expect(curveGraduated).toBe(true)
			expect(curveState.virtualQuoteReserve).toBe(GRADUATION_THRESHOLD)
			expect(curveState.baseReserve).toBe(0n)
		})

		test('token transfers are blocked after graduation (until migration)', async () => {
			// Get Alice's token balance
			const aliceBalance = await client.readContract({
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'balanceOf',
				args: [accounts.alice.address],
			})

			expect(aliceBalance).toBeGreaterThan(0n)

			const transferAmount = aliceBalance / 2n

			// Transfer should fail because token is not graduated yet
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'transfer',
					args: [accounts.bob.address, transferAmount],
				}),
			).rejects.toThrow(/Transfers locked until graduation/)
		})

		test('curve is graduated but token is not (prevents malicious pool creation)', async () => {
			// This test ensures the security model:
			// 1. Curve graduates (stops trading on bonding curve)
			// 2. Token stays non-transferable (prevents malicious Uniswap pool creation)
			// 3. Migration happens (creates official pool + enables transfers atomically)

			const [curveGraduated, tokenGraduated] = await Promise.all([
				client.readContract({
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'graduated',
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'graduated',
				}),
			])

			// Curve should be graduated, but token should NOT be
			expect(curveGraduated).toBe(true)
			expect(tokenGraduated).toBe(false)

			// Verify migration hasn't happened yet
			const migrated = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'migrated',
			})
			expect(migrated).toBe(false)
		})

		test('cannot swap on curve after graduation', async () => {
			const buyAmount = parseUnits('100', 6)

			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'swap',
					args: [accounts.alice.address, true, buyAmount, 0n],
				}),
			).rejects.toThrow(/Curve has graduated/)
		})
	})

	describe('Migration Execution', () => {
		test('successfully migrates graduated curve', async () => {
			// Get balances before migration
			const [quoteBalanceBefore, baseBalanceBefore, protocolFeesBefore] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [testCurveAddress],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [testCurveAddress],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
			])

			// Calculate expected migration fee (5%)
			const expectedMigrationFee = (quoteBalanceBefore * 500n) / 10000n
			const expectedQuoteForLiquidity = quoteBalanceBefore - expectedMigrationFee

			// Migrate
			const { request } = await client.simulateContract({
				account: accounts.alice,
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'migrate',
			})

			const hash = await walletClient.writeContract(request)
			const receipt = await client.waitForTransactionReceipt({ hash })

			// Parse events
			const migratedEvents = parseEventLogs({
				abi: contracts.curve.abi,
				eventName: 'Migrated',
				logs: receipt.logs,
			})

			const protocolFeeEvents = parseEventLogs({
				abi: contracts.reward.abi,
				eventName: 'ProtocolFeeAdded',
				logs: receipt.logs,
			})

			expect(migratedEvents.length).toBe(1)
			expect(protocolFeeEvents.length).toBe(1)

			const migratedEvent = migratedEvents[0]!.args
			const protocolFeeEvent = protocolFeeEvents[0]!.args

			// Verify event parameters
			expect(migratedEvent.baseAmount).toBe(baseBalanceBefore)
			expect(migratedEvent.quoteAmount).toBe(expectedQuoteForLiquidity)
			expect(migratedEvent.migrationFee).toBe(expectedMigrationFee)

			// Verify protocol fee event
			expect(protocolFeeEvent.curve).toBe(testCurveAddress)
			expect(protocolFeeEvent.amount).toBe(expectedMigrationFee)

			// Verify reward contract's accumulated protocol fees increased
			const protocolFeesAfter = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'accumulatedProtocolFees',
			})

			expect(protocolFeesAfter).toBe(protocolFeesBefore + expectedMigrationFee)

			// Verify migrated flag is set
			const migrated = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'migrated',
			})

			expect(migrated).toBe(true)

			// Store pool address for later tests
			const poolAddress = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'poolAddress',
			})

			expect(poolAddress).not.toBe('0x0000000000000000000000000000000000000000')
		})

		test('token transfers are enabled after migration', async () => {
			// Verify token is now graduated
			const tokenGraduated = await client.readContract({
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'graduated',
			})

			expect(tokenGraduated).toBe(true)

			// Get Alice's token balance
			const aliceBalance = await client.readContract({
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'balanceOf',
				args: [accounts.alice.address],
			})

			expect(aliceBalance).toBeGreaterThan(0n)

			// Transfer half of Alice's balance to Bob
			const transferAmount = aliceBalance / 2n

			// Transfer to Bob should now succeed
			const { request: transferRequest } = await client.simulateContract({
				account: accounts.alice,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'transfer',
				args: [accounts.bob.address, transferAmount],
			})
			const hash = await walletClient.writeContract(transferRequest)
			await client.waitForTransactionReceipt({ hash })

			// Verify Bob received tokens
			const bobBalance = await client.readContract({
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			expect(bobBalance).toBe(transferAmount)
		})

		test('cannot migrate twice', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: testCurveAddress,
					abi: contracts.curve.abi,
					functionName: 'migrate',
				}),
			).rejects.toThrow(/Already migrated/)
		})
	})

	describe('Uniswap V3 Pool Verification', () => {
		let poolAddress: Address

		beforeAll(async () => {
			poolAddress = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'poolAddress',
			})
		})

		test('pool is created with correct token pair and fee tier', async () => {
			// Read pool state
			const [token0, token1, fee] = await Promise.all([
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'token0',
							outputs: [{ type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'token0',
				}),
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'token1',
							outputs: [{ type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'token1',
				}),
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'fee',
							outputs: [{ type: 'uint24' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'fee',
				}),
			])

			// Verify tokens are sorted
			expect(BigInt(token0) < BigInt(token1)).toBe(true)

			// Verify tokens match
			const tokens = [testTokenAddress.toLowerCase(), contracts.usdc.address.toLowerCase()].sort()
			expect(token0.toLowerCase()).toBe(tokens[0]!)
			expect(token1.toLowerCase()).toBe(tokens[1]!)

			// Verify fee tier is 1% (10000 basis points)
			expect(fee).toBe(10000)
		})

		test('pool is initialized with correct price', async () => {
			// Read slot0 to get sqrtPriceX96
			const slot0 = await client.readContract({
				address: poolAddress,
				abi: [
					{
						inputs: [],
						name: 'slot0',
						outputs: [
							{ type: 'uint160', name: 'sqrtPriceX96' },
							{ type: 'int24', name: 'tick' },
							{ type: 'uint16', name: 'observationIndex' },
							{ type: 'uint16', name: 'observationCardinality' },
							{ type: 'uint16', name: 'observationCardinalityNext' },
							{ type: 'uint8', name: 'feeProtocol' },
							{ type: 'bool', name: 'unlocked' },
						],
						stateMutability: 'view',
						type: 'function',
					},
				],
				functionName: 'slot0',
			})

			// Verify sqrtPriceX96 is not zero
			expect(slot0[0]).toBeGreaterThan(0n)
		})

		test('pool has liquidity in full range', async () => {
			// Read liquidity at full range position
			const liquidity = await client.readContract({
				address: poolAddress,
				abi: [
					{
						inputs: [],
						name: 'liquidity',
						outputs: [{ type: 'uint128' }],
						stateMutability: 'view',
						type: 'function',
					},
				],
				functionName: 'liquidity',
			})

			expect(liquidity).toBeGreaterThan(0n)
		})

		test('pool reserves match expected amounts', async () => {
			// Get token balances in pool
			const [token0, token1] = await Promise.all([
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'token0',
							outputs: [{ type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'token0',
				}),
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'token1',
							outputs: [{ type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'token1',
				}),
			])

			const [balance0, balance1] = await Promise.all([
				client.readContract({
					address: token0,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [poolAddress],
				}),
				client.readContract({
					address: token1,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [poolAddress],
				}),
			])

			// Both balances should be > 0
			expect(balance0).toBeGreaterThan(0n)
			expect(balance1).toBeGreaterThan(0n)
		})
	})

	describe('Trading on Uniswap V3', () => {
		let poolAddress: Address
		let token0: Address
		let token1: Address

		beforeAll(async () => {
			poolAddress = await client.readContract({
				address: testCurveAddress,
				abi: contracts.curve.abi,
				functionName: 'poolAddress',
			})

			;[token0, token1] = await Promise.all([
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'token0',
							outputs: [{ type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'token0',
				}),
				client.readContract({
					address: poolAddress,
					abi: [
						{
							inputs: [],
							name: 'token1',
							outputs: [{ type: 'address' }],
							stateMutability: 'view',
							type: 'function',
						},
					],
					functionName: 'token1',
				}),
			])

			// Mint USDC to Bob for testing
			const mintAmount = parseUnits('10000', 6)
			const { request: mintDeployerRequest } = await client.simulateContract({
				account: accounts.deployer,
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'mint',
				args: [accounts.bob.address, mintAmount],
			})
			const mintHash = await walletClient.writeContract(mintDeployerRequest)
			await client.waitForTransactionReceipt({ hash: mintHash })

			// Approve router (sequential to avoid nonce conflicts)
			const { request: bobUSDCApproveRequest } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'approve',
				args: [contracts.uniswapV3Router.address, MAX_UINT256],
			})
			const approveUsdcHash = await walletClient.writeContract(bobUSDCApproveRequest)
			await client.waitForTransactionReceipt({ hash: approveUsdcHash })

			const { request: bobTokenApproveRequest } = await client.simulateContract({
				account: accounts.bob,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'approve',
				args: [contracts.uniswapV3Router.address, MAX_UINT256],
			})
			const approveTokenHash = await walletClient.writeContract(bobTokenApproveRequest)
			await client.waitForTransactionReceipt({ hash: approveTokenHash })
		})

		test('can buy tokens on Uniswap V3 pool', async () => {
			const amountIn = parseUnits('100', 6) // 100 USDC

			// Determine swap direction
			const zeroForOne = token0.toLowerCase() === contracts.usdc.address.toLowerCase()

			// Get balances and allowances before
			const [usdcBefore, tokenBefore, usdcAllowance, tokenAllowance] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'allowance',
					args: [accounts.bob.address, contracts.uniswapV3Router.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'allowance',
					args: [accounts.bob.address, contracts.uniswapV3Router.address],
				}),
			])

			// Execute swap via router
			const swapParams = {
				tokenIn: contracts.usdc.address,
				tokenOut: testTokenAddress,
				fee: 10000,
				recipient: accounts.bob.address,
				deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
				amountIn,
				amountOutMinimum: 0n,
				sqrtPriceLimitX96: 0n,
			}

			const { request } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.uniswapV3Router.address,
				abi: contracts.uniswapV3Router.abi,
				functionName: 'exactInputSingle',
				args: [swapParams],
			})

			const hash = await walletClient.writeContract(request)
			await client.waitForTransactionReceipt({ hash })

			// Get balances after
			const [usdcAfter, tokenAfter] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
			])

			const usdcSpent = usdcBefore - usdcAfter
			const tokensReceived = tokenAfter - tokenBefore

			expect(usdcSpent).toBe(amountIn)
			expect(tokensReceived).toBeGreaterThan(0n)
		})

		test('can sell tokens on Uniswap V3 pool', async () => {
			// Bob should have tokens from previous test
			const tokenBalance = await client.readContract({
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			expect(tokenBalance).toBeGreaterThan(0n)

			// Sell half of the tokens
			const amountIn = tokenBalance / 2n

			// Get balances before
			const [usdcBefore, tokenBefore] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
			])

			// Execute swap via router
			const swapParams = {
				tokenIn: testTokenAddress,
				tokenOut: contracts.usdc.address,
				fee: 10000,
				recipient: accounts.bob.address,
				deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
				amountIn,
				amountOutMinimum: 0n,
				sqrtPriceLimitX96: 0n,
			}

			const { request } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.uniswapV3Router.address,
				abi: contracts.uniswapV3Router.abi,
				functionName: 'exactInputSingle',
				args: [swapParams],
			})
			const hash = await walletClient.writeContract(request)
			await client.waitForTransactionReceipt({ hash })

			// Get balances after
			const [usdcAfter, tokenAfter] = await Promise.all([
				client.readContract({
					address: contracts.usdc.address,
					abi: contracts.usdc.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: testTokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.bob.address],
				}),
			])

			const tokensSpent = tokenBefore - tokenAfter
			const usdcReceived = usdcAfter - usdcBefore

			expect(tokensSpent).toBe(amountIn)
			expect(usdcReceived).toBeGreaterThan(0n)
		})

		test('pool state updates correctly after trades', async () => {
			// Read pool state
			const slot0 = await client.readContract({
				address: poolAddress,
				abi: [
					{
						inputs: [],
						name: 'slot0',
						outputs: [
							{ type: 'uint160', name: 'sqrtPriceX96' },
							{ type: 'int24', name: 'tick' },
							{ type: 'uint16', name: 'observationIndex' },
							{ type: 'uint16', name: 'observationCardinality' },
							{ type: 'uint16', name: 'observationCardinalityNext' },
							{ type: 'uint8', name: 'feeProtocol' },
							{ type: 'bool', name: 'unlocked' },
						],
						stateMutability: 'view',
						type: 'function',
					},
				],
				functionName: 'slot0',
			})

			const liquidity = await client.readContract({
				address: poolAddress,
				abi: [
					{
						inputs: [],
						name: 'liquidity',
						outputs: [{ type: 'uint128' }],
						stateMutability: 'view',
						type: 'function',
					},
				],
				functionName: 'liquidity',
			})

			// Verify pool is still operational
			expect(slot0[0]).toBeGreaterThan(0n)
			expect(liquidity).toBeGreaterThan(0n)
			expect(slot0[6]).toBe(true) // unlocked
		})
	})
})
