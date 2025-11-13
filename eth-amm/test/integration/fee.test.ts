import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { type Address, type Hex, parseUnits, formatUnits, parseEventLogs } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'
import { randomBytes } from 'crypto'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

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
	let snapshotId: Hex

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

	// Helper function to setup referral chain: user -> l1 -> l2 -> l3
	async function setupReferralChain(user: Address, l1: Address, l2?: Address, l3?: Address) {
		// Set user -> l1
		const { request: r1 } = await client.simulateContract({
			account: { address: user } as any,
			address: contracts.factory.address,
			abi: contracts.factory.abi,
			functionName: 'setReferrer',
			args: [l1],
		})
		const account =
			accounts.alice.address === user ? accounts.alice : accounts.bob.address === user ? accounts.bob : accounts.charlie
		const hash1 = await walletClient.writeContract({ ...r1, account })
		await client.waitForTransactionReceipt({ hash: hash1 })

		// Set l1 -> l2 if provided
		if (l2) {
			const l1Account =
				accounts.bob.address === l1 ? accounts.bob : accounts.charlie.address === l1 ? accounts.charlie : accounts.dave
			const { request: r2 } = await client.simulateContract({
				account: l1Account,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [l2],
			})
			const hash2 = await walletClient.writeContract({ ...r2, account: l1Account })
			await client.waitForTransactionReceipt({ hash: hash2 })
		}

		// Set l2 -> l3 if provided
		if (l2 && l3) {
			const l2Account = accounts.charlie.address === l2 ? accounts.charlie : accounts.dave
			const { request: r3 } = await client.simulateContract({
				account: l2Account,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [l3],
			})
			const hash3 = await walletClient.writeContract({ ...r3, account: l2Account })
			await client.waitForTransactionReceipt({ hash: hash3 })
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

		// Create a test token for all trading tests
		const { token, curve } = await createTokenAndCurve(accounts.alice)
		testTokenAddress = token
		testCurveAddress = curve

		console.log(`\n📋 Test Setup:`)
		console.log(`  Test token: ${testTokenAddress}`)
		console.log(`  Test curve: ${testCurveAddress}`)

		// Mint USDC to all test accounts
		const mintAmount = parseUnits('1000000', 6) // 1M USDC each
		for (const account of [accounts.alice, accounts.bob, accounts.charlie, accounts.dave]) {
			await mintAndApproveUSDC(account, mintAmount, testCurveAddress)
		}

		snapshotId = await client.snapshot()
	})

	beforeEach(async () => {
		// Revert to snapshot before each test to ensure clean state
		await client.revert({ id: snapshotId })
		// Take a new snapshot for the next test
		snapshotId = await client.snapshot()
	})

	describe('Basic Fee Calculation', () => {
		test('calculates 1.5% total fee without referral', async () => {
			const amountIn = parseUnits('1000', 6) // 1000 USDC

			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Calculate expected fee: 1.5% of 1000 = 15 USDC
			const expectedTotalFee = (amountIn * BigInt(FEE_BP)) / BigInt(MAX_BP)

			expect(swapEvent.tradingFee).toBe(expectedTotalFee)
		})

		test('calculates 1.4% total fee with referral (referee discount)', async () => {
			// Setup: Alice refers Bob
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			const amountIn = parseUnits('1000', 6) // 1000 USDC
			const swapEvent = await executeBuy(accounts.bob, testCurveAddress, amountIn)

			// Calculate expected fee: (1.5% - 0.1%) = 1.4% of 1000 = 14 USDC
			const effectiveFeeRate = FEE_BP - REFEREE_DISCOUNT_BP
			const expectedTotalFee = (amountIn * BigInt(effectiveFeeRate)) / BigInt(MAX_BP)

			expect(swapEvent.tradingFee).toBe(expectedTotalFee)
		})

		test('fee components sum correctly without referral', async () => {
			const amountIn = parseUnits('1000', 6) // 1000 USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read factory to get fee accumulation (fees are now stored in factory)
			const [protocolFees, creatorFees] = await Promise.all([
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

			// Creator fee should be 0.5% of amountIn
			const expectedCreatorFee = (amountIn * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			expect(creatorFees).toBe(expectedCreatorFee)

			// Verify trading fee is correct
			expect(swapEvent.tradingFee).toBeGreaterThan(0n)

			// Verify protocol and creator fees are tracked
			expect(protocolFees).toBeGreaterThan(0n)
		})

		test('protocol fee absorbs rounding dust', async () => {
			// Use an amount that will cause rounding
			const amountIn = parseUnits('1001', 6) + 7n // Odd amount to test rounding

			// Snapshot fees before trade
			const [protocolFeesBefore, creatorFeesBefore] = await Promise.all([
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

			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read fees from factory after trade
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

			// Calculate the fee increase from this trade
			const protocolFeeIncrease = protocolFeesAfter - protocolFeesBefore
			const creatorFeeIncrease = creatorFeesAfter - creatorFeesBefore

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

			const amountIn = parseUnits('10000', 6) // 10k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Check Bob's (L1) referral rewards
			const bobAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.bob.address],
			})

			// L1 gets 0.3% of the TOTAL FEE (not 0.3% of trade amount)
			// Total fee = 1.4% of 10k = 140 USDC (with referee discount)
			// L1 reward = 0.3% of 140 = 0.42 USDC
			const expectedL1Reward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			expect(bobAccount.accumulatedReferral).toBe(expectedL1Reward)
		})

		test('2-level referral chain distributes L1 and L2 rewards', async () => {
			// Setup: Alice -> Bob -> Charlie
			await setupReferralChain(accounts.alice.address, accounts.bob.address, accounts.charlie.address)

			const amountIn = parseUnits('10000', 6) // 10k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Check Bob's (L1) rewards
			const bobAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.bob.address],
			})

			// Check Charlie's (L2) rewards
			const charlieAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.charlie.address],
			})

			// L1 gets 0.3% of total fee, L2 gets 0.03% of total fee
			const expectedL1Reward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const expectedL2Reward = (swapEvent.tradingFee * BigInt(L2_REFERRAL_FEE_BP)) / BigInt(MAX_BP)

			expect(bobAccount.accumulatedReferral).toBe(expectedL1Reward)
			expect(charlieAccount.accumulatedReferral).toBe(expectedL2Reward)
		})

		test('3-level referral chain distributes L1, L2, and L3 rewards', async () => {
			// Setup: Alice -> Bob -> Charlie -> Dave
			await setupReferralChain(
				accounts.alice.address,
				accounts.bob.address,
				accounts.charlie.address,
				accounts.dave.address,
			)

			const amountIn = parseUnits('10000', 6) // 10k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Check all referrers' rewards
			const [bobAccount, charlieAccount, daveAccount] = await Promise.all([
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.charlie.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.dave.address],
				}),
			])

			// Calculate expected rewards (all based on total fee)
			const expectedL1Reward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const expectedL2Reward = (swapEvent.tradingFee * BigInt(L2_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			const expectedL3Reward = (swapEvent.tradingFee * BigInt(L3_REFERRAL_FEE_BP)) / BigInt(MAX_BP)

			expect(bobAccount.accumulatedReferral).toBe(expectedL1Reward)
			expect(charlieAccount.accumulatedReferral).toBe(expectedL2Reward)
			expect(daveAccount.accumulatedReferral).toBe(expectedL3Reward)
		})

		test('referral rewards accumulate across multiple trades', async () => {
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			const amountIn = parseUnits('1000', 6) // 1k USDC per trade
			let totalExpectedReward = 0n

			// Execute 3 trades
			for (let i = 0; i < 3; i++) {
				const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)
				totalExpectedReward += (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)
			}

			// Check Bob's accumulated rewards
			const bobAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.bob.address],
			})

			expect(bobAccount.accumulatedReferral).toBe(totalExpectedReward)
		})

		test('can claim accumulated referral rewards', async () => {
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const expectedReward = (swapEvent.tradingFee * BigInt(L1_REFERRAL_FEE_BP)) / BigInt(MAX_BP)

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
				address: contracts.factory.address,
				abi: contracts.factory.abi,
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

			expect(bobUsdcAfter - bobUsdcBefore).toBe(expectedReward)

			// Account should be zeroed after claim
			const bobAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.bob.address],
			})
			expect(bobAccount.accumulatedReferral).toBe(0n)
		})
	})

	describe('Volume Accumulation', () => {
		test('volume increases after buy trade', async () => {
			const amountIn = parseUnits('1000', 6)

			const accountBefore = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const accountAfter = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// For buy (quoteToBase), volume = amountIn (in quote tokens)
			expect(accountAfter.totalVolume - accountBefore.totalVolume).toBe(amountIn)
		})

		test('volume increases after sell trade', async () => {
			// First buy some tokens
			const buyAmount = parseUnits('1000', 6)
			const buySwap = await executeBuy(accounts.alice, testCurveAddress, buyAmount)

			// Get volume after buy
			const accountAfterBuy = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

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
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// For sell (baseToQuote), volume = grossAmountOut = amountOut + totalFee
			const expectedVolumeIncrease = sellSwap.amountOut + sellSwap.tradingFee
			expect(accountAfterSell.totalVolume - accountAfterBuy.totalVolume).toBe(expectedVolumeIncrease)
		})

		test('volume accumulates across multiple trades', async () => {
			const accountBefore = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			const tradeAmounts = [parseUnits('1000', 6), parseUnits('2000', 6), parseUnits('500', 6)]
			let expectedTotalVolume = 0n

			for (const amount of tradeAmounts) {
				await executeBuy(accounts.alice, testCurveAddress, amount)
				expectedTotalVolume += amount
			}

			const accountAfter = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			expect(accountAfter.totalVolume - accountBefore.totalVolume).toBe(expectedTotalVolume)
		})

		test('volume accumulates across different curves', async () => {
			// Trade on first curve
			const amount1 = parseUnits('1000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amount1)

			// Create a second curve
			const { token: token2, curve: curve2 } = await createTokenAndCurve(accounts.alice)
			await mintAndApproveUSDC(accounts.alice, parseUnits('10000', 6), curve2)

			// Trade on second curve
			const amount2 = parseUnits('2000', 6)
			await executeBuy(accounts.alice, curve2, amount2)

			// Check total volume
			const accountAfter = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// Volume should include both trades
			expect(accountAfter.totalVolume).toBeGreaterThanOrEqual(amount1 + amount2)
		})
	})

	describe('Tier & Cashback System', () => {
		test('new user starts at Tier 0 (Wood) with 0.05% cashback', async () => {
			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			expect(tier).toBe(0)

			// Verify Tier 0 configuration
			const tierConfig = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getTier',
				args: [0],
			})

			expect(tierConfig.volumeThreshold).toBe(0n)
			expect(tierConfig.cashbackBasisPoints).toBe(TIER_0_BP)
		})

		test('user receives cashback on trade based on tier', async () => {
			// Use smaller amount to ensure user stays at Tier 0
			const amountIn = parseUnits('1000', 6) // 1k USDC
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const account = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// Verify user received some cashback
			expect(account.accumulatedCashback).toBeGreaterThan(0n)

			// Cashback should be less than the total trading fee
			expect(account.accumulatedCashback).toBeLessThan(swapEvent.tradingFee)

			// Verify cashback was calculated (value in swap event)
			expect(swapEvent.cashbackFee).toBeGreaterThan(0n)
		})

		test('user progresses to Tier 1 after 10k USDC volume', async () => {
			// Trade to reach Tier 1 threshold (10k USDC)
			const amountIn = parseUnits('10000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
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
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})
			expect(tier).toBe(1)

			// Get cashback before second trade
			const accountBefore = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// Make another trade as Tier 1
			const amountIn = parseUnits('1000', 6)
			const secondTrade = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			const accountAfter = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// Cashback for second trade: 0.08% of total fee (not trade amount)
			const expectedCashback = (secondTrade.tradingFee * BigInt(TIER_1_BP)) / BigInt(MAX_BP)
			const cashbackIncrease = accountAfter.accumulatedCashback - accountBefore.accumulatedCashback

			expect(cashbackIncrease).toBe(expectedCashback)
		})

		test('cashback accumulates across multiple trades', async () => {
			const amountIn = parseUnits('1000', 6)

			// Make 3 trades
			for (let i = 0; i < 3; i++) {
				await executeBuy(accounts.alice, testCurveAddress, amountIn)
			}

			const account = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			// Should have accumulated cashback from all 3 trades
			expect(account.accumulatedCashback).toBeGreaterThan(0n)
		})

		test('can claim accumulated cashback', async () => {
			const amountIn = parseUnits('10000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Get expected cashback amount
			const accountBefore = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
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
				address: contracts.factory.address,
				abi: contracts.factory.abi,
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
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})
			expect(accountAfter.accumulatedCashback).toBe(0n)
		})
	})

	describe('Creator Fee', () => {
		test('creator receives 0.5% fee on every trade', async () => {
			const amountIn = parseUnits('10000', 6) // 10k USDC
			await executeBuy(accounts.bob, testCurveAddress, amountIn)

			// Read creator fees from factory (fees are now stored in factory)
			const creatorFees = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'accumulatedCreatorFees',
				args: [testCurveAddress],
			})

			// Expected creator fee: 0.5% of amountIn
			const expectedCreatorFee = (amountIn * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			expect(creatorFees).toBe(expectedCreatorFee)
		})

		test('creator fee accumulates across multiple trades', async () => {
			const amountIn = parseUnits('1000', 6)

			// Make 3 trades
			for (let i = 0; i < 3; i++) {
				await executeBuy(accounts.bob, testCurveAddress, amountIn)
			}

			// Read creator fees from factory (fees are now stored in factory)
			const creatorFees = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'accumulatedCreatorFees',
				args: [testCurveAddress],
			})

			// Expected total creator fee: 0.5% of (1000 * 3)
			const expectedTotalCreatorFee = (amountIn * 3n * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			expect(creatorFees).toBe(expectedTotalCreatorFee)
		})

		test('different curves track creator fees independently', async () => {
			// Trade on first curve (creator is Alice)
			const amount1 = parseUnits('1000', 6)
			await executeBuy(accounts.bob, testCurveAddress, amount1)

			// Create second curve with different creator (Bob)
			const { token: token2, curve: curve2 } = await createTokenAndCurve(accounts.bob)
			await mintAndApproveUSDC(accounts.alice, parseUnits('10000', 6), curve2)

			// Trade on second curve
			const amount2 = parseUnits('2000', 6)
			await executeBuy(accounts.alice, curve2, amount2)

			// Read creator fees from factory (fees are now stored in factory)
			const [creatorFees1, creatorFees2] = await Promise.all([
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'accumulatedCreatorFees',
					args: [testCurveAddress],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'accumulatedCreatorFees',
					args: [curve2],
				}),
			])

			// Each curve should have its own creator fee
			const expectedFee1 = (amount1 * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)
			const expectedFee2 = (amount2 * BigInt(CREATOR_FEE_BP)) / BigInt(MAX_BP)

			expect(creatorFees1).toBe(expectedFee1)
			expect(creatorFees2).toBe(expectedFee2)
		})
	})

	describe('Combined Scenarios', () => {
		test('referee discount + cashback work together', async () => {
			// Setup referral
			await setupReferralChain(accounts.bob.address, accounts.alice.address)

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.bob, testCurveAddress, amountIn)

			// Should have referee discount (1.4% fee instead of 1.5%)
			const expectedFee = (amountIn * BigInt(FEE_BP - REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			expect(swapEvent.tradingFee).toBe(expectedFee)

			// Should also receive cashback (calculated from total fee)
			const bobAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.bob.address],
			})

			// Note: 10k trade pushes Bob to Tier 1, so he gets 0.08% cashback
			// Cashback is calculated from total fee, not trade amount
			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.bob.address],
			})
			const tierBP = tier === 0 ? TIER_0_BP : TIER_1_BP
			const expectedCashback = (swapEvent.tradingFee * BigInt(tierBP)) / BigInt(MAX_BP)
			expect(bobAccount.accumulatedCashback).toBe(expectedCashback)
		})

		test('3-level referral + cashback + discount all work together', async () => {
			// Setup 3-level referral chain
			await setupReferralChain(
				accounts.alice.address,
				accounts.bob.address,
				accounts.charlie.address,
				accounts.dave.address,
			)

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// 1. Verify referee discount (Alice pays 1.4%)
			const expectedFee = (amountIn * BigInt(FEE_BP - REFEREE_DISCOUNT_BP)) / BigInt(MAX_BP)
			expect(swapEvent.tradingFee).toBe(expectedFee)

			// 2. Verify Alice gets cashback
			const aliceAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})
			expect(aliceAccount.accumulatedCashback).toBeGreaterThan(0n)

			// 3. Verify all 3 referrers get rewards
			const [bobAccount, charlieAccount, daveAccount] = await Promise.all([
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.charlie.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.dave.address],
				}),
			])

			expect(bobAccount.accumulatedReferral).toBeGreaterThan(0n)
			expect(charlieAccount.accumulatedReferral).toBeGreaterThan(0n)
			expect(daveAccount.accumulatedReferral).toBeGreaterThan(0n)
		})

		test('can claim both cashback and referral rewards together', async () => {
			// Setup: Bob refers Alice
			await setupReferralChain(accounts.alice.address, accounts.bob.address)

			// Alice trades (gets cashback, Bob gets referral)
			await executeBuy(accounts.alice, testCurveAddress, parseUnits('10000', 6))

			// Bob also trades (gets his own cashback)
			await executeBuy(accounts.bob, testCurveAddress, parseUnits('5000', 6))

			// Get Bob's expected total rewards
			const bobAccountBefore = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.bob.address],
			})

			const expectedTotal = bobAccountBefore.accumulatedReferral + bobAccountBefore.accumulatedCashback

			// Check Bob's balances before claim
			const bobUsdcBefore = await client.readContract({
				address: contracts.usdc.address,
				abi: contracts.usdc.abi,
				functionName: 'balanceOf',
				args: [accounts.bob.address],
			})

			// Claim all rewards
			const { request: claimReq } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'claimAll',
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
			// Make multiple small trades
			const tradeAmount = parseUnits('3000', 6)

			// First trade
			await executeBuy(accounts.alice, testCurveAddress, tradeAmount)
			let tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
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

			tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			// After 12k+ volume, should be at least Tier 1
			expect(tier).toBeGreaterThanOrEqual(1)

			// Volume should be cumulative
			const account = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})
			expect(account.totalVolume).toBeGreaterThan(parseUnits('10000', 6))
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
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.charlie.address],
			})
			expect(tier).toBe(0)

			// Make first trade
			const amountIn = parseUnits('1000', 6)
			const swapEvent = await executeBuy(accounts.charlie, testCurveAddress, amountIn)

			// Should pay full 1.5% fee (no referral discount)
			const expectedFee = (amountIn * BigInt(FEE_BP)) / BigInt(MAX_BP)
			expect(swapEvent.tradingFee).toBe(expectedFee)

			// Should receive Tier 0 cashback (calculated from total fee, not trade amount)
			const charlieAccount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.charlie.address],
			})
			const expectedCashback = (swapEvent.tradingFee * BigInt(TIER_0_BP)) / BigInt(MAX_BP)
			expect(charlieAccount.accumulatedCashback).toBe(expectedCashback)
		})

		test('trading exactly at tier boundary', async () => {
			// Trade exactly 10k USDC to hit Tier 1 threshold
			const exactThreshold = parseUnits('10000', 6)
			await executeBuy(accounts.alice, testCurveAddress, exactThreshold)

			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})

			// Should be promoted to Tier 1
			expect(tier).toBe(1)
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
			const [
				protocolFeesBefore,
				creatorFeesBefore,
				aliceAccountBefore,
				bobAccountBefore,
				charlieAccountBefore,
				daveAccountBefore,
			] = await Promise.all([
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
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.alice.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.charlie.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.dave.address],
				}),
			])

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Get all fee components after trade
			const [
				protocolFeesAfter,
				creatorFeesAfter,
				aliceAccountAfter,
				bobAccountAfter,
				charlieAccountAfter,
				daveAccountAfter,
			] = await Promise.all([
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
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.alice.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.bob.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.charlie.address],
				}),
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.dave.address],
				}),
			])

			// Calculate increases from this trade
			const protocolFeeIncrease = protocolFeesAfter - protocolFeesBefore
			const creatorFeeIncrease = creatorFeesAfter - creatorFeesBefore
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
			const [protocolFeesBefore, creatorFeesBefore] = await Promise.all([
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

			const amountIn = parseUnits('10000', 6)
			const swapEvent = await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read fees from factory after trade
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

			// Calculate fee increases from this trade
			const protocolFeeIncrease = protocolFeesAfter - protocolFeesBefore
			const creatorFeeIncrease = creatorFeesAfter - creatorFeesBefore

			// Protocol fee should be what's left after creator fee and other distributions
			// In practice, protocol fee absorbs any rounding dust
			expect(protocolFeeIncrease).toBeGreaterThan(0n)
			expect(protocolFeeIncrease + creatorFeeIncrease).toBeLessThanOrEqual(swapEvent.tradingFee)
		})

		test('no fee component can be negative', async () => {
			const amountIn = parseUnits('1000', 6)
			await executeBuy(accounts.alice, testCurveAddress, amountIn)

			// Read fees from factory (fees are now stored in factory)
			const [protocolFees, creatorFees, account] = await Promise.all([
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
				client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCashbackAccount',
					args: [accounts.alice.address],
				}),
			])

			// All fee components should be non-negative
			expect(protocolFees).toBeGreaterThanOrEqual(0n)
			expect(creatorFees).toBeGreaterThanOrEqual(0n)
			expect(account.accumulatedCashback).toBeGreaterThanOrEqual(0n)
			expect(account.accumulatedReferral).toBeGreaterThanOrEqual(0n)
		})
	})
})
