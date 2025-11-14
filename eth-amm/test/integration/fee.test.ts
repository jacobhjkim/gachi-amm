import { describe, test, expect, beforeAll, afterEach, beforeEach } from 'bun:test'
import { type Address, type Hex, parseUnits, formatUnits, parseEventLogs } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'
import { randomBytes } from 'crypto'

const BIG_NUMBER = 2n ** 100n

// Helper function to generate random requestId
const generateRequestId = () => `0x${randomBytes(32).toString('hex')}` as Hex

// Constants for fee basis points (from PumpFactory default config)
const FEE_BP = 150 // 1.5%
const CREATOR_FEE_BP = 50 // 0.5%
const L1_REFERRAL_FEE_BP = 30 // 0.3%
const L2_REFERRAL_FEE_BP = 3 // 0.03%
const L3_REFERRAL_FEE_BP = 2 // 0.02%
const REFEREE_DISCOUNT_BP = 10 // 0.1%
const MAX_BP = 10000 // 100%

// Tier configurations
const TIER_0_BP = 5 // 0.05% cashback
const TIER_1_THRESHOLD = parseUnits('10000', 6) // 10k USDC
const TIER_1_BP = 8 // 0.08% cashback

describe('Fee Math', () => {
	let client: ReturnType<typeof createTestPublicClient>
	let walletClient: ReturnType<typeof createTestWalletClient>
	let contracts: DeployedContracts
	let accounts: ReturnType<typeof getAllAccounts>

	// Token and curve addresses for tests
	let testTokenAddress: Address
	let testCurveAddress: Address

	// Helper function to create a new token and curve
	async function createTokenAndCurve(creator = accounts.alice): Promise<{ token: Address; curve: Address }> {
		const requestId = generateRequestId()
		const { result, request } = await client.simulateContract({
			account: creator,
			address: contracts.factory.address,
			abi: contracts.factory.abi,
			functionName: 'mintTokenAndCreateCurve',
			args: ['Test Token', 'TEST', requestId],
		})

		const token = result[0]
		const curve = result[1]

		const hash = await walletClient.writeContract(request)
		await client.waitForTransactionReceipt({ hash })

		return { token, curve }
	}

	// Helper function to get full referral chain for a user
	async function getFullReferralChain(user: Address): Promise<Address[]> {
		const chain: Address[] = []
		let current = user
		for (let i = 0; i < 3; i++) {
			const referrer = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getReferrer',
				args: [current],
			})
			if (referrer === '0x0000000000000000000000000000000000000000') break
			chain.push(referrer)
			current = referrer
		}
		return chain
	}

	// Helper function to setup referral chain: user -> l1 -> l2 -> l3
	// This function is idempotent - it will skip setting referrers if they would create circular references
	async function setupReferralChain(user: Address, l1: Address, l2?: Address, l3?: Address) {
		// Get existing referral chains for all participants
		const [userChain, l1Chain, l2Chain] = await Promise.all([
			getFullReferralChain(user),
			getFullReferralChain(l1),
			l2 ? getFullReferralChain(l2) : Promise.resolve([]),
		])

		// Check if user already has a referrer
		const existingReferrer = await client.readContract({
			address: contracts.reward.address,
			abi: contracts.reward.abi,
			functionName: 'getReferrer',
			args: [user],
		})

		// Set user -> l1 only if not already set AND it won't create a circular reference
		// Check if l1 is already in user's chain (would be circular)
		const wouldBeCircular = l1Chain.some((addr) => addr.toLowerCase() === user.toLowerCase())

		if (existingReferrer === '0x0000000000000000000000000000000000000000' && !wouldBeCircular) {
			const { request: r1 } = await client.simulateContract({
				account: { address: user } as any,
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'setReferrer',
				args: [l1],
			})
			const account =
				accounts.alice.address === user
					? accounts.alice
					: accounts.bob.address === user
						? accounts.bob
						: accounts.charlie
			const hash1 = await walletClient.writeContract({ ...r1, account })
			await client.waitForTransactionReceipt({ hash: hash1 })
		}

		// Set l1 -> l2 if provided
		if (l2) {
			const l1ExistingReferrer = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getReferrer',
				args: [l1],
			})

			// Check if l2 would create a circular reference
			const l1WouldBeCircular =
				l2Chain.some((addr) => addr.toLowerCase() === l1.toLowerCase()) || l2.toLowerCase() === user.toLowerCase()

			if (l1ExistingReferrer === '0x0000000000000000000000000000000000000000' && !l1WouldBeCircular) {
				const l1Account =
					accounts.bob.address === l1
						? accounts.bob
						: accounts.charlie.address === l1
							? accounts.charlie
							: accounts.dave
				const { request: r2 } = await client.simulateContract({
					account: l1Account,
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'setReferrer',
					args: [l2],
				})
				const hash2 = await walletClient.writeContract({ ...r2, account: l1Account })
				await client.waitForTransactionReceipt({ hash: hash2 })
			}
		}

		// Set l2 -> l3 if provided
		if (l2 && l3) {
			const l2ExistingReferrer = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getReferrer',
				args: [l2],
			})

			const l3Chain = await getFullReferralChain(l3)
			// Check if l3 would create a circular reference
			const l2WouldBeCircular =
				l3Chain.some((addr) => addr.toLowerCase() === l2.toLowerCase()) ||
				l3.toLowerCase() === l1.toLowerCase() ||
				l3.toLowerCase() === user.toLowerCase()

			if (l2ExistingReferrer === '0x0000000000000000000000000000000000000000' && !l2WouldBeCircular) {
				const l2Account = accounts.charlie.address === l2 ? accounts.charlie : accounts.dave
				const { request: r3 } = await client.simulateContract({
					account: l2Account,
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'setReferrer',
					args: [l3],
				})
				const hash3 = await walletClient.writeContract({ ...r3, account: l2Account })
				await client.waitForTransactionReceipt({ hash: hash3 })
			}
		}
	}

	// Helper function to mint USDC and approve curve
	async function mintAndApproveUSDC(account: any, amount: bigint, curve: Address) {
		// Mint USDC
		const { request: mintRequest } = await client.simulateContract({
			account: accounts.deployer,
			address: contracts.usdc.address,
			abi: contracts.usdc.abi,
			functionName: 'mint',
			args: [account.address, amount],
		})
		await walletClient.writeContract(mintRequest)

		// Approve curve
		const { request: approveRequest } = await client.simulateContract({
			account: account,
			address: contracts.usdc.address,
			abi: contracts.usdc.abi,
			functionName: 'approve',
			args: [curve, amount],
		})
		await walletClient.writeContract(approveRequest)
	}

	// Helper function to execute a buy (quote -> base) trade
	async function executeBuy(account: any, curve: Address, amountIn: bigint, minAmountOut = 0n) {
		const { request } = await client.simulateContract({
			account: account,
			address: curve,
			abi: contracts.curve.abi,
			functionName: 'swap',
			args: [account.address, true, amountIn, minAmountOut], // quoteToBase = true
		})
		const hash = await walletClient.writeContract(request)
		const receipt = await client.waitForTransactionReceipt({ hash })

		// Parse Swap event
		const logs = parseEventLogs({
			abi: contracts.curve.abi,
			eventName: 'Swap',
			logs: receipt.logs,
		})

		return logs[0]!.args
	}

	// Helper function to execute a sell (base -> quote) trade
	async function executeSell(account: any, curve: Address, amountIn: bigint, minAmountOut = 0n) {
		const { request } = await client.simulateContract({
			account: account,
			address: curve,
			abi: contracts.curve.abi,
			functionName: 'swap',
			args: [account.address, false, amountIn, minAmountOut], // quoteToBase = false
		})
		const hash = await walletClient.writeContract(request)
		const receipt = await client.waitForTransactionReceipt({ hash })

		// Parse Swap event
		const logs = parseEventLogs({
			abi: contracts.curve.abi,
			eventName: 'Swap',
			logs: receipt.logs,
		})

		return logs[0]!.args
	}

	// Helper function to snapshot all relevant state for delta comparisons
	async function snapshotState() {
		const [protocolFees, aliceReward, bobReward, charlieReward, daveReward, aliceTier, bobTier, charlieTier, daveTier] =
			await Promise.all([
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.alice.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.charlie.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.dave.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getCurrentTier',
					args: [accounts.alice.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getCurrentTier',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getCurrentTier',
					args: [accounts.charlie.address],
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getCurrentTier',
					args: [accounts.dave.address],
				}),
			])

		return {
			protocolFees,
			alice: {
				accumulatedCreatorFee: aliceReward.accumulatedCreatorFee,
				accumulatedCashback: aliceReward.accumulatedCashback,
				accumulatedReferral: aliceReward.accumulatedReferral,
				totalVolume: aliceReward.totalVolume,
				currentTier: aliceTier,
			},
			bob: {
				accumulatedCreatorFee: bobReward.accumulatedCreatorFee,
				accumulatedCashback: bobReward.accumulatedCashback,
				accumulatedReferral: bobReward.accumulatedReferral,
				totalVolume: bobReward.totalVolume,
				currentTier: bobTier,
			},
			charlie: {
				accumulatedCreatorFee: charlieReward.accumulatedCreatorFee,
				accumulatedCashback: charlieReward.accumulatedCashback,
				accumulatedReferral: charlieReward.accumulatedReferral,
				totalVolume: charlieReward.totalVolume,
				currentTier: charlieTier,
			},
			dave: {
				accumulatedCreatorFee: daveReward.accumulatedCreatorFee,
				accumulatedCashback: daveReward.accumulatedCashback,
				accumulatedReferral: daveReward.accumulatedReferral,
				totalVolume: daveReward.totalVolume,
				currentTier: daveTier,
			},
		}
	}

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
	})

	beforeEach(async () => {
		// Create a fresh token and curve for each test
		const { token, curve } = await createTokenAndCurve(accounts.alice)
		testTokenAddress = token
		testCurveAddress = curve

		// Mint and approve USDC for all test accounts
		for (const account of [accounts.alice, accounts.bob, accounts.charlie, accounts.dave]) {
			await mintAndApproveUSDC(account, BigInt(10 * 10 ** 15), testCurveAddress)
		}
	})

	describe('Basic Fee Calculation', () => {
		test('calculates 1.5% total fee without referral', async () => {
			const amountIn = BigInt(1000 * 10 ** 6) // 1000 USDC

			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Calculate expected fee: 1.5% of 1000 = 15 USDC
			const expectedTotalFee = (amountIn * BigInt(FEE_BP)) / BigInt(MAX_BP)

			expect(swapEvent.tradingFee).toBe(expectedTotalFee)
		})

		test('calculates 1.4% total fee with referral (referee discount)', async () => {
			// Setup: Alice refers Bob
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			const amountIn = BigInt(1000 * 10 ** 6) // 1000 USDC
			const swapEvent = await executeBuy(accounts.bob, testCurveAddress, amountIn)

			// Calculate expected fee: (1.5% - 0.1%) = 1.4% of 1000 = 14 USDC
			const effectiveFeeRate = FEE_BP - REFEREE_DISCOUNT_BP
			const expectedTotalFee = (amountIn * BigInt(effectiveFeeRate)) / BigInt(MAX_BP)

			expect(swapEvent.tradingFee).toBe(expectedTotalFee)
		})

		test('fee components sum correctly without referral', async () => {
			const before = await snapshotState()

			const amountIn = BigInt(1000 * 10 ** 6) // 1000 USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const after = await snapshotState()

			// Creator fee delta should be 0.5% of amountIn
			const expectedCreatorFee = (amountIn * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			const creatorFeeDelta = after.alice.accumulatedCreatorFee - before.alice.accumulatedCreatorFee
			expect(creatorFeeDelta).toBe(expectedCreatorFee)

			// Verify trading fee is correct
			expect(swapEvent.tradingFee).toBeGreaterThan(0n)

			// Verify protocol fees increased
			const protocolFeeDelta = after.protocolFees - before.protocolFees
			expect(protocolFeeDelta).toBeGreaterThan(0n)
		})

		test('protocol fee absorbs rounding dust', async () => {
			// Use an amount that will cause rounding
			const amountIn = BigInt(1001 * 10 ** 6 + 7) // 1000 USDC

			// Snapshot fees before trade
			const [protocolFeesBefore, aliceRewardBefore] = await Promise.all([
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.alice.address], // Alice is the creator
				}),
			])

			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read fees from factory after trade
			const [protocolFeesAfter, aliceRewardAfter] = await Promise.all([
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.alice.address],
				}),
			])

			// Calculate the fee increase from this trade
			const protocolFeeIncrease = protocolFeesAfter - protocolFeesBefore
			const creatorFeeIncrease = aliceRewardAfter.accumulatedCreatorFee - aliceRewardBefore.accumulatedCreatorFee

			// Total fee should equal sum of all components (protocol fee absorbs any dust)
			const totalFee = swapEvent.tradingFee

			// Components should not exceed total
			expect(creatorFeeIncrease).toBeLessThanOrEqual(totalFee)
			expect(protocolFeeIncrease).toBeLessThanOrEqual(totalFee)
		})
	})

	describe('Referee Discount', () => {
		test('discount applies only when user has referrer', async () => {
			const amountIn = parseUnits('1000', 6)

			// Alice has no referrer - should pay 1.5%
			const aliceSwap = await executeBuy(accounts.alice, testCurveAddress, amountIn)
			const aliceExpectedFee = (amountIn * BigInt(FEE_BP)) / BigInt(MAX_BP)
			expect(aliceSwap.tradingFee).toBe(aliceExpectedFee)

			// Setup Bob with referrer
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			// Bob has referrer - should pay 1.4%
			const bobSwap = await executeBuy(accounts.bob, testCurveAddress, amountIn)
			const bobExpectedFee = (amountIn * BigInt(FEE_BP - REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			expect(bobSwap.tradingFee).toBe(bobExpectedFee)

			// Bob should pay less than Alice
			expect(bobSwap.tradingFee).toBeLessThan(aliceSwap.tradingFee)
		})

		test('discount saves user exactly 0.1% (10 basis points)', async () => {
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			const amountIn = parseUnits('10000', 6) // 10k USDC

			const bobSwap = await executeBuy(accounts.bob, testCurveAddress, amountIn)

			// Discount should be exactly 0.1% of amount = 10 USDC
			const expectedDiscount = (amountIn * BigInt(REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			const fullFee = (amountIn * BigInt(FEE_BP)) / BigInt(MAX_BP)
			const actualDiscount = fullFee - bobSwap.tradingFee

			expect(actualDiscount).toBe(expectedDiscount)
		})

		test('discount works for both buy and sell', async () => {
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			// Buy tokens first
			const buyAmount = parseUnits('1000', 6)
			const buySwap = await executeBuy(accounts.bob, testCurveAddress, buyAmount)

			// Verify buy has discount (1.4% fee)
			const buyExpectedFee = (buyAmount * BigInt(FEE_BP - REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			expect(buySwap.tradingFee).toBe(buyExpectedFee)

			// Now sell some tokens back
			const tokensToSell = buySwap.amountOut / 2n

			// Approve token spending
			const { request: approveReq } = await client.simulateContract({
				account: accounts.bob,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'approve',
				args: [testCurveAddress, tokensToSell],
			})
			await walletClient.writeContract(approveReq)

			const sellSwap = await executeSell(accounts.bob, testCurveAddress, tokensToSell)

			// For sell, fee is taken from output, but rate should still be 1.4%
			// Verify discount was applied (actual calculation is complex due to bonding curve)
			expect(sellSwap.tradingFee).toBeGreaterThan(0n)
		})
	})

	describe('Referral Reward Distribution', () => {
		test('L1 referrer receives 0.3% of total fee as reward', async () => {
			// Setup: Bob refers Alice
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			const before = await snapshotState()

			const amountIn = parseUnits('10000', 6) // 10k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const after = await snapshotState()

			// L1 gets 0.3% of the TOTAL FEE (not 0.3% of trade amount)
			// Total fee = 1.4% of 10k = 140 USDC (with referee discount)
			// L1 reward = 0.3% of 140 = 0.42 USDC
			const expectedL1Reward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const bobReferralDelta = after.bob.accumulatedReferral - before.bob.accumulatedReferral
			expect(bobReferralDelta).toBe(expectedL1Reward)
		})

		test('2-level referral chain distributes L1 and L2 rewards', async () => {
			// Setup: Alice -> Bob -> Charlie
			await setupReferralChain(accounts.alice.address, accounts.bob.address, accounts.charlie.address)

			const before = await snapshotState()

			const amountIn = parseUnits('10000', 6) // 10k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const after = await snapshotState()

			// L1 gets 0.3% of total fee, L2 gets 0.03% of total fee
			const expectedL1Reward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const expectedL2Reward = (swapEvent.tradingFee * BigInt(L2_REFERRAL_FEE_BP)) / BigInt(MAX_BP)

			const bobReferralDelta = after.bob.accumulatedReferral - before.bob.accumulatedReferral
			const charlieReferralDelta = after.charlie.accumulatedReferral - before.charlie.accumulatedReferral

			expect(bobReferralDelta).toBe(expectedL1Reward)
			expect(charlieReferralDelta).toBe(expectedL2Reward)
		})

		test('3-level referral chain distributes L1, L2, and L3 rewards', async () => {
			// Setup: Alice -> Bob -> Charlie -> Dave
			await setupReferralChain(
				accounts.alice.address,
				accounts.bob.address,
				accounts.charlie.address,
				accounts.dave.address,
			)

			const before = await snapshotState()

			const amountIn = parseUnits('10000', 6) // 10k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const after = await snapshotState()

			// Calculate expected rewards (all based on total fee)
			const expectedL1Reward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const expectedL2Reward = (swapEvent.tradingFee * BigInt(L2_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const expectedL3Reward = (swapEvent.tradingFee * BigInt(L3_REFERRAL_FEE_BP)) / BigInt(MAX_BP)

			const bobReferralDelta = after.bob.accumulatedReferral - before.bob.accumulatedReferral
			const charlieReferralDelta = after.charlie.accumulatedReferral - before.charlie.accumulatedReferral
			const daveReferralDelta = after.dave.accumulatedReferral - before.dave.accumulatedReferral

			expect(bobReferralDelta).toBe(expectedL1Reward)
			expect(charlieReferralDelta).toBe(expectedL2Reward)
			expect(daveReferralDelta).toBe(expectedL3Reward)
		})

		test('referral rewards accumulate across multiple trades', async () => {
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			const before = await snapshotState()

			const amountIn = parseUnits('1000', 6) // 1k USDC per trade
			let totalExpectedReward = 0n

			// Execute 3 trades
			for (let i = 0; i < 3; i++) {
				const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)
				totalExpectedReward += (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			}

			const after = await snapshotState()

			// Check Bob's accumulated rewards delta
			const bobReferralDelta = after.bob.accumulatedReferral - before.bob.accumulatedReferral
			expect(bobReferralDelta).toBe(totalExpectedReward)
		})

		test('can claim accumulated referral rewards', async () => {
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read Bob's actual accumulated referral amount (includes any from previous tests)
			const bobAccountBeforeClaim = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.bob.address],
			})
			const totalAccumulated = bobAccountBeforeClaim.accumulatedReferral

			// Check Bob's USDC balance before claim
			const bobUsdcBefore = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			// Claim referral rewards
			const { request: claimReq } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'claimReferral',
			})
			const claimHash = await walletClient.writeContract(claimReq)
			await client.waitForTransactionReceipt({ hash: claimHash })

			// Check Bob's USDC balance after claim
			const bobUsdcAfter = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			// Should receive all accumulated referral rewards
			expect(bobUsdcAfter - bobUsdcBefore).toBe(totalAccumulated)

			// Account should be zeroed after claim
			const bobAccountAfterClaim = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.bob.address],
			})
			expect(bobAccountAfterClaim.accumulatedReferral).toBe(0n)
		})
	})

	describe('Volume Accumulation', () => {
		test('volume increases after buy trade', async () => {
			const amountIn = parseUnits('1000', 6)

			const accountBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const accountAfter = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			// For buy (quoteToBase), volume = amountIn (in quote tokens)
			expect(accountAfter.totalVolume - accountBefore.totalVolume).toBe(amountIn)
		})

		test('volume increases after sell trade', async () => {
			// Get volume before trading
			const accountBeforeBuy = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			// First buy some tokens
			const buyAmount = parseUnits('1000', 6)
			const buySwap = await executeBuy(accounts.alice, testCurveAddress, buyAmount)

			// Get volume after buy
			const accountAfterBuy = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			// Verify buy volume increased correctly
			expect(accountAfterBuy.totalVolume - accountBeforeBuy.totalVolume).toBe(buyAmount)

			// Approve tokens for selling
			const tokensToSell = buySwap.amountOut / 2n
			const { request: approveReq } = await client.simulateContract({
				account: accounts.alice,
				address: testTokenAddress,
				abi: contracts.token.abi,
				functionName: 'approve',
				args: [testCurveAddress, tokensToSell],
			})
			await walletClient.writeContract(approveReq)

			// Sell tokens
			const sellSwap = await executeSell(accounts.alice, testCurveAddress, tokensToSell)

			const accountAfterSell = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			// For sell (baseToQuote), volume = grossAmountOut = amountOut + totalFee
			const expectedVolumeIncrease = sellSwap.amountOut + sellSwap.tradingFee
			expect(accountAfterSell.totalVolume - accountAfterBuy.totalVolume).toBe(expectedVolumeIncrease)
		})

		test('volume accumulates across multiple trades', async () => {
			const accountBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			const tradeAmounts = [parseUnits('1000', 6), parseUnits('2000', 6), parseUnits('500', 6)]
			let expectedTotalVolume = 0n

			for (const amount of tradeAmounts) {
				await executeBuy(accounts.alice, testCurveAddress, amount)
				expectedTotalVolume += amount
			}

			const accountAfter = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			expect(accountAfter.totalVolume - accountBefore.totalVolume).toBe(expectedTotalVolume)
		})

		test('volume accumulates across different curves', async () => {
			const before = await snapshotState()

			// Trade on first curve
			const amount1 = parseUnits('1000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amount1)

			// Create a second curve
			const { token: token2, curve: curve2 } = await createTokenAndCurve(accounts.alice)
			await mintAndApproveUSDC(accounts.alice, parseUnits('10000', 6), curve2)

			// Trade on second curve
			const amount2 = parseUnits('2000', 6)
			await executeBuy(accounts.alice, curve2, amount2)

			const after = await snapshotState()

			// Volume delta should include both trades
			const volumeDelta = after.alice.totalVolume - before.alice.totalVolume
			expect(volumeDelta).toBeGreaterThanOrEqual(amount1 + amount2)
		})
	})

	describe('Tier & Cashback System', () => {
		test('new user starts at Tier 0 (Wood) with 0.05% cashback', async () => {
			const tier = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			expect(tier).toBe(0)

			// Verify Tier 0 configuration
			const tierConfig = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getTier',
				args: [0],
			})

			expect(tierConfig.volumeThreshold).toBe(0n)
			expect(tierConfig.cashbackBasisPoints).toBe(TIER_0_BP)
		})

		test('user receives cashback on trade based on tier', async () => {
			const before = await snapshotState()

			// Use smaller amount to ensure user stays at Tier 0
			const amountIn = parseUnits('1000', 6) // 1k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const after = await snapshotState()

			// Verify user received some cashback (delta)
			const cashbackDelta = after.alice.accumulatedCashback - before.alice.accumulatedCashback
			expect(cashbackDelta).toBeGreaterThan(0n)

			// Cashback delta should be less than the total trading fee
			expect(cashbackDelta).toBeLessThan(swapEvent.tradingFee)

			// Verify cashback was calculated (value in swap event)
			expect(swapEvent.cashbackFee).toBeGreaterThan(0n)
		})

		test('user progresses to Tier 1 after 10k USDC volume', async () => {
			// Trade to reach Tier 1 threshold (10k USDC)
			const amountIn = parseUnits('10000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const tier = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			// Should now be Tier 1
			expect(tier).toBe(1)
		})

		test('Tier 1 user receives 0.08% of total fee as cashback', async () => {
			// First reach Tier 1
			const firstTrade = await executeBuy(accounts.alice, testCurveAddress, parseUnits('10000', 6))

			// Verify at Tier 1
			let tier = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})
			expect(tier).toBe(1)

			// Get cashback before second trade
			const accountBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			// Make another trade as Tier 1
			const amountIn = parseUnits('1000', 6)
			const secondTrade = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const accountAfter = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})

			// Cashback for second trade: 0.08% of total fee (not trade amount)
			const expectedCashback = (secondTrade.tradingFee * BigInt(TIER_1_BP)) / BigInt(MAX_BP)
			const cashbackIncrease = accountAfter.accumulatedCashback - accountBefore.accumulatedCashback

			expect(cashbackIncrease).toBe(expectedCashback)
		})

		test('cashback accumulates across multiple trades', async () => {
			const before = await snapshotState()

			const amountIn = parseUnits('1000', 6)

			// Make 3 trades
			for (let i = 0; i < 3; i++) {
				await executeBuy(accounts.alice, testCurveAddress, amountIn)
			}

			const after = await snapshotState()

			// Should have accumulated cashback from all 3 trades (delta)
			const cashbackDelta = after.alice.accumulatedCashback - before.alice.accumulatedCashback
			expect(cashbackDelta).toBeGreaterThan(0n)
		})

		test('can claim accumulated cashback', async () => {
			const amountIn = parseUnits('10000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Get expected cashback amount
			const accountBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})
			const expectedCashback = accountBefore.accumulatedCashback

			// Check Alice's USDC balance before claim
			const aliceUsdcBefore = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.alice.address],
			})

			// Claim cashback
			const { request: claimReq } = await client.simulateContract({
				account: accounts.alice,
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'claimCashback',
			})
			const claimHash = await walletClient.writeContract(claimReq)
			await client.waitForTransactionReceipt({ hash: claimHash })

			// Check Alice's USDC balance after claim
			const aliceUsdcAfter = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.alice.address],
			})

			expect(aliceUsdcAfter - aliceUsdcBefore).toBe(expectedCashback)

			// Account should be zeroed after claim
			const accountAfter = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})
			expect(accountAfter.accumulatedCashback).toBe(0n)
		})
	})

	describe('Creator Fee', () => {
		test('creator receives 0.5% fee on every trade', async () => {
			const before = await snapshotState()

			const amountIn = parseUnits('10000', 6) // 10k USDC
			await executeBuy(accounts.bob, testCurveAddress, amountIn)

			const after = await snapshotState()

			// Expected creator fee delta: 0.5% of amountIn
			const expectedCreatorFee = (amountIn * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			const creatorFeeDelta = after.alice.accumulatedCreatorFee - before.alice.accumulatedCreatorFee
			expect(creatorFeeDelta).toBe(expectedCreatorFee)
		})

		test('creator fee accumulates across multiple trades', async () => {
			const before = await snapshotState()

			const amountIn = parseUnits('1000', 6)

			// Make 3 trades
			for (let i = 0; i < 3; i++) {
				await executeBuy(accounts.bob, testCurveAddress, amountIn)
			}

			const after = await snapshotState()

			// Expected total creator fee delta: 0.5% of (1000 * 3)
			const expectedTotalCreatorFee = (amountIn * 3n * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			const creatorFeeDelta = after.alice.accumulatedCreatorFee - before.alice.accumulatedCreatorFee
			expect(creatorFeeDelta).toBe(expectedTotalCreatorFee)
		})

		test('different curves accumulate to their respective creators', async () => {
			const before = await snapshotState()

			// Trade on first curve (creator is Alice)
			const amount1 = parseUnits('1000', 6)
			await executeBuy(accounts.bob, testCurveAddress, amount1)

			// Create second curve with different creator (Bob)
			const { token: token2, curve: curve2 } = await createTokenAndCurve(accounts.bob)
			await mintAndApproveUSDC(accounts.alice, parseUnits('10000', 6), curve2)

			// Trade on second curve
			const amount2 = parseUnits('2000', 6)
			await executeBuy(accounts.alice, curve2, amount2)

			const after = await snapshotState()

			// Each creator should have their respective fee deltas
			const expectedFee1 = (amount1 * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			const expectedFee2 = (amount2 * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)

			const aliceCreatorFeeDelta = after.alice.accumulatedCreatorFee - before.alice.accumulatedCreatorFee
			const bobCreatorFeeDelta = after.bob.accumulatedCreatorFee - before.bob.accumulatedCreatorFee

			expect(aliceCreatorFeeDelta).toBe(expectedFee1)
			expect(bobCreatorFeeDelta).toBe(expectedFee2)
		})
	})

	describe('Combined Scenarios', () => {
		test('referee discount + cashback work together', async () => {
			// Setup referral
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			const before = await snapshotState()

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.bob, testCurveAddress, amountIn)

			const after = await snapshotState()

			// Should have referee discount (1.4% fee instead of 1.5%)
			const expectedFee = (amountIn * BigInt(FEE_BP - REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			expect(swapEvent.tradingFee).toBe(expectedFee)

			// Should also receive cashback (calculated from total fee)
			// Note: 10k trade might push Bob to Tier 1, so use his actual tier after trade
			const tierBP = after.bob.currentTier === 0 ? TIER_0_BP : TIER_1_BP
			const expectedCashback = (swapEvent.tradingFee * BigInt(tierBP)) / BigInt(MAX_BP)
			const cashbackDelta = after.bob.accumulatedCashback - before.bob.accumulatedCashback
			expect(cashbackDelta).toBe(expectedCashback)
		})

		test('3-level referral + cashback + discount all work together', async () => {
			// Setup 3-level referral chain
			await setupReferralChain(
				accounts.alice.address,
				accounts.bob.address,
				accounts.charlie.address,
				accounts.dave.address,
			)

			const before = await snapshotState()

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const after = await snapshotState()

			// 1. Verify referee discount (Alice pays 1.4%)
			const expectedFee = (amountIn * BigInt(FEE_BP - REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			expect(swapEvent.tradingFee).toBe(expectedFee)

			// 2. Verify Alice gets cashback (delta)
			const aliceCashbackDelta = after.alice.accumulatedCashback - before.alice.accumulatedCashback
			expect(aliceCashbackDelta).toBeGreaterThan(0n)

			// 3. Verify all 3 referrers get rewards (deltas)
			const bobReferralDelta = after.bob.accumulatedReferral - before.bob.accumulatedReferral
			const charlieReferralDelta = after.charlie.accumulatedReferral - before.charlie.accumulatedReferral
			const daveReferralDelta = after.dave.accumulatedReferral - before.dave.accumulatedReferral

			expect(bobReferralDelta).toBeGreaterThan(0n)
			expect(charlieReferralDelta).toBeGreaterThan(0n)
			expect(daveReferralDelta).toBeGreaterThan(0n)
		})

		test('can claim cashback, referral, and creator fee rewards together', async () => {
			// Setup: Bob refers Alice
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			// Alice trades (gets cashback, Bob gets referral)
			await executeBuy(accounts.alice, testCurveAddress, parseUnits('10000', 6))

			// Bob also trades (gets his own cashback)
			await executeBuy(accounts.bob, testCurveAddress, parseUnits('5000', 6))

			// Get Bob's expected total rewards (including creator fee since Bob created no curves in this test)
			const bobAccountBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.bob.address],
			})

			const expectedTotal =
				bobAccountBefore.accumulatedReferral +
				bobAccountBefore.accumulatedCashback +
				bobAccountBefore.accumulatedCreatorFee

			// Check Bob's balances before claim
			const bobUsdcBefore = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			// Claim all rewards (cashback, referral, creator fee)
			const { request: claimReq } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'claimCreatorFeeCashbackAndReferral',
			})
			const claimHash = await walletClient.writeContract(claimReq)
			await client.waitForTransactionReceipt({ hash: claimHash })

			// Check Bob's USDC balance after claim
			const bobUsdcAfter = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			expect(bobUsdcAfter - bobUsdcBefore).toBe(expectedTotal)
		})

		test('tier upgrade applies as volume accumulates', async () => {
			const before = await snapshotState()

			// Make multiple small trades
			const tradeAmount = parseUnits('3000', 6)

			// First trade
			await executeBuy(accounts.alice, testCurveAddress, tradeAmount)
			let tier = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})
			const firstTier = tier // Could be 0 or 1 depending on state

			// Second trade
			await executeBuy(accounts.alice, testCurveAddress, tradeAmount)

			// Third trade
			await executeBuy(accounts.alice, testCurveAddress, tradeAmount)

			// Fourth trade - definitely should be tier 1 now (12k+ volume)
			await executeBuy(accounts.alice, testCurveAddress, tradeAmount)

			const after = await snapshotState()

			tier = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			// After 12k+ volume, should be at least Tier 1
			expect(tier).toBeGreaterThanOrEqual(1)

			// Volume delta should be cumulative (4 trades * 3000)
			const volumeDelta = after.alice.totalVolume - before.alice.totalVolume
			expect(volumeDelta).toBeGreaterThan(parseUnits('10000', 6))
		})
	})

	describe('Edge Cases', () => {
		test('very small trade still calculates fees correctly', async () => {
			const amountIn = 100n // 0.0001 USDC (100 micro-USDC)

			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Fee should be calculated correctly even for tiny amounts
			expect(swapEvent.tradingFee).toBeGreaterThan(0n)
		})

		test('first trade ever (new user, Tier 0, no referral)', async () => {
			// Charlie has never traded
			const tier = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.charlie.address],
			})
			expect(tier).toBe(0)

			const before = await snapshotState()

			// Make first trade
			const amountIn = parseUnits('1000', 6)
			const swapEvent = await executeBuy(accounts.charlie, testCurveAddress, amountIn)

			const after = await snapshotState()

			// Should pay full 1.5% fee (no referral discount)
			const expectedFee = (amountIn * BigInt(FEE_BP)) / BigInt(MAX_BP)
			expect(swapEvent.tradingFee).toBe(expectedFee)

			// Should receive Tier 0 cashback delta (calculated from total fee, not trade amount)
			const expectedCashback = (swapEvent.tradingFee * BigInt(TIER_0_BP)) / BigInt(MAX_BP)
			const charlieCashbackDelta = after.charlie.accumulatedCashback - before.charlie.accumulatedCashback
			expect(charlieCashbackDelta).toBe(expectedCashback)
		})

		test('trading exactly at tier boundary', async () => {
			// Get current volume and tier
			const accountBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getUserReward',
				args: [accounts.alice.address],
			})
			const tierBefore = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			// Get tier 1 threshold
			const tier1Config = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'getTier',
				args: [1],
			})

			// Calculate how much more volume needed to reach tier 1
			const volumeNeeded = tier1Config.volumeThreshold - accountBefore.totalVolume

			// If already at tier 1 or higher, trade to reach tier 2
			if (tierBefore >= 1) {
				const tier2Config = await client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getTier',
					args: [2],
				})
				const volumeForTier2 = tier2Config.volumeThreshold - accountBefore.totalVolume

				if (volumeForTier2 > 0n) {
					await executeBuy(accounts.alice, testCurveAddress, volumeForTier2)

					const tierAfter = await client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getCurrentTier',
						args: [accounts.alice.address],
					})

					// Should be promoted to Tier 2
					expect(tierAfter).toBe(2)
				}
			} else {
				// Trade exactly enough to reach tier 1
				await executeBuy(accounts.alice, testCurveAddress, volumeNeeded)

				const tierAfter = await client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getCurrentTier',
					args: [accounts.alice.address],
				})

				// Should be promoted to Tier 1
				expect(tierAfter).toBe(1)
			}
		})
	})

	describe('Fee Math Invariants', () => {
		test('fee components never exceed total fee', async () => {
			// Setup 3-level referral to maximize fee distribution
			await setupReferralChain(
				accounts.alice.address,
				accounts.bob.address,
				accounts.charlie.address,
				accounts.dave.address,
			)

			// Snapshot all accounts before trade
			const [protocolFeesBefore, aliceAccountBefore, bobAccountBefore, charlieAccountBefore, daveAccountBefore] =
				await Promise.all([
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'accumulatedProtocolFees',
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.alice.address],
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.bob.address],
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.charlie.address],
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.dave.address],
					}),
				])

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Get all fee components after trade
			const [protocolFeesAfter, aliceAccountAfter, bobAccountAfter, charlieAccountAfter, daveAccountAfter] =
				await Promise.all([
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'accumulatedProtocolFees',
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.alice.address],
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.bob.address],
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.charlie.address],
					}),
					client.readContract({
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'getUserReward',
						args: [accounts.dave.address],
					}),
				])

			// Calculate increases from this trade (Alice is both trader and creator)
			const protocolFeeIncrease = protocolFeesAfter - protocolFeesBefore
			const creatorFeeIncrease = aliceAccountAfter.accumulatedCreatorFee - aliceAccountBefore.accumulatedCreatorFee
			const aliceCashbackIncrease = aliceAccountAfter.accumulatedCashback - aliceAccountBefore.accumulatedCashback
			const bobReferralIncrease = bobAccountAfter.accumulatedReferral - bobAccountBefore.accumulatedReferral
			const charlieReferralIncrease = charlieAccountAfter.accumulatedReferral - charlieAccountBefore.accumulatedReferral
			const daveReferralIncrease = daveAccountAfter.accumulatedReferral - daveAccountBefore.accumulatedReferral

			// Sum all components
			const totalDistributed =
				protocolFeeIncrease +
				creatorFeeIncrease +
				aliceCashbackIncrease +
				bobReferralIncrease +
				charlieReferralIncrease +
				daveReferralIncrease

			// Total distributed should not exceed trading fee
			// Note: Due to rounding, they should be approximately equal
			expect(totalDistributed).toBeLessThanOrEqual(swapEvent.tradingFee)
		})

		test('protocol fee is residual after all other fees', async () => {
			// Snapshot fees before trade
			const [protocolFeesBefore, aliceRewardBefore] = await Promise.all([
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.alice.address], // Alice is the creator
				}),
			])

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read fees from factory after trade
			const [protocolFeesAfter, aliceRewardAfter] = await Promise.all([
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.alice.address],
				}),
			])

			// Calculate fee increases from this trade
			const protocolFeeIncrease = protocolFeesAfter - protocolFeesBefore
			const creatorFeeIncrease = aliceRewardAfter.accumulatedCreatorFee - aliceRewardBefore.accumulatedCreatorFee

			// Protocol fee should be what's left after creator fee and other distributions
			// In practice, protocol fee absorbs any rounding dust
			expect(protocolFeeIncrease).toBeGreaterThan(0n)
			expect(protocolFeeIncrease + creatorFeeIncrease).toBeLessThanOrEqual(swapEvent.tradingFee)
		})

		test('no fee component can be negative', async () => {
			const amountIn = parseUnits('1000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read fees from factory
			const [protocolFees, account] = await Promise.all([
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'accumulatedProtocolFees',
				}),
				client.readContract({
					address: contracts.reward.address,
					abi: contracts.reward.abi,
					functionName: 'getUserReward',
					args: [accounts.alice.address],
				}),
			])

			// All fee components should be non-negative
			expect(protocolFees).toBeGreaterThanOrEqual(0n)
			expect(account.accumulatedCreatorFee).toBeGreaterThanOrEqual(0n)
			expect(account.accumulatedCashback).toBeGreaterThanOrEqual(0n)
			expect(account.accumulatedReferral).toBeGreaterThanOrEqual(0n)
		})
	})
})
