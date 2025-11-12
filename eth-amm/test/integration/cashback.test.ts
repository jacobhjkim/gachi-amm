/*
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { parseEventLogs, type Hex, parseUnits } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'

describe('PumpCashback', () => {
	let client: ReturnType<typeof createTestPublicClient>
	let walletClient: ReturnType<typeof createTestWalletClient>
	let contracts: DeployedContracts
	let accounts: ReturnType<typeof getAllAccounts>
	let snapshotId: Hex

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

		snapshotId = await client.snapshot()
	})

	beforeEach(async () => {
		// Revert to snapshot before each test to ensure clean state
		await client.revert({ id: snapshotId })
		// Take a new snapshot for the next test
		snapshotId = await client.snapshot()
	})

	describe('Initialization', () => {
		test('has correct usdc address', async () => {
			const usdc = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'usdc',
			})
			expect(usdc).toBe(contracts.usdc.address)
		})

		test('has correct factory address', async () => {
			const factory = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'factory',
			})
			expect(factory).toBe(contracts.factory.address)
		})

		test('has 7 tiers initialized', async () => {
			const tierCount = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getTierCount',
			})
			expect(tierCount).toBe(7n)
		})

		test('tier 0 (Wood) has correct configuration', async () => {
			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getTier',
				args: [0],
			})
			expect(tier.volumeThreshold).toBe(0n)
			expect(tier.factoryBasisPoints).toBe(5) // 0.05%
		})

		test('tier 6 (Champion) has correct configuration', async () => {
			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getTier',
				args: [6],
			})
			expect(tier.volumeThreshold).toBe(parseUnits('25000000', 6)) // 25M USDC
			expect(tier.factoryBasisPoints).toBe(25) // 0.25%
		})
	})

	describe('Referral System', () => {
		test('allows user to set referrer', async () => {
			const { request } = await client.simulateContract({
				account: accounts.alice,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.bob.address],
			})
			const hash = await walletClient.writeContract(request)
			const receipt = await client.waitForTransactionReceipt({ hash })

			// Check event
			const logs = parseEventLogs({
				abi: contracts.factory.abi,
				eventName: 'ReferralSet',
				logs: receipt.logs,
			})

			expect(logs.length).toBe(1)
			expect(logs[0]!.args.user.toLowerCase()).toBe(accounts.alice.address.toLowerCase())
			expect(logs[0]!.args.referrer.toLowerCase()).toBe(accounts.bob.address.toLowerCase())

			// Verify referrer is set
			const referrer = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getReferrer',
				args: [accounts.alice.address],
			})
			expect(referrer.toLowerCase()).toBe(accounts.bob.address.toLowerCase())
		})

		test('prevents setting referrer to self', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'setReferrer',
					args: [accounts.alice.address],
				}),
			).rejects.toThrow()
		})

		test('prevents setting referrer twice', async () => {
			// Set referrer first time
			const { request } = await client.simulateContract({
				account: accounts.alice,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.bob.address],
			})
			await walletClient.writeContract(request)

			// Try to set referrer again
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'setReferrer',
					args: [accounts.charlie.address],
				}),
			).rejects.toThrow()
		})

		test('prevents circular referral', async () => {
			// Alice → Bob
			const { request: r1 } = await client.simulateContract({
				account: accounts.alice,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.bob.address],
			})
			await walletClient.writeContract(r1)

			// Bob → Charlie
			const { request: r2 } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.charlie.address],
			})
			await walletClient.writeContract(r2)

			// Charlie → Alice should fail (circular)
			expect(
				client.simulateContract({
					account: accounts.charlie,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'setReferrer',
					args: [accounts.alice.address],
				}),
			).rejects.toThrow()
		})

		test('builds correct 3-level referral chain', async () => {
			// Alice → Bob
			const { request: r1 } = await client.simulateContract({
				account: accounts.alice,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.bob.address],
			})
			await walletClient.writeContract(r1)

			// Bob → Charlie
			const { request: r2 } = await client.simulateContract({
				account: accounts.bob,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.charlie.address],
			})
			await walletClient.writeContract(r2)

			// Charlie → Dave
			const { request: r3 } = await client.simulateContract({
				account: accounts.charlie,
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'setReferrer',
				args: [accounts.dave.address],
			})
			await walletClient.writeContract(r3)

			// Check Alice's referral chain
			const [l1, l2, l3] = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getReferralChain',
				args: [accounts.alice.address],
			})

			expect(l1.toLowerCase()).toBe(accounts.bob.address.toLowerCase())
			expect(l2.toLowerCase()).toBe(accounts.charlie.address.toLowerCase())
			expect(l3.toLowerCase()).toBe(accounts.dave.address.toLowerCase())
		})
	})

	describe('Tier System', () => {
		test('starts at tier 0 (Wood) with no volume', async () => {
			const tier = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCurrentTier',
				args: [accounts.alice.address],
			})
			expect(tier).toBe(0)
		})

		// Note: Full tier progression tests would require implementing addCashback
		// and setting up proper volume tracking, which depends on curve integration
	})

	describe('Account Management', () => {
		test('returns empty account for new user', async () => {
			const account = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'getCashbackAccount',
				args: [accounts.alice.address],
			})

			expect(account.totalVolume).toBe(0n)
			expect(account.accumulatedCashback).toBe(0n)
			expect(account.accumulatedReferral).toBe(0n)
			expect(account.lastClaimTimestamp).toBe(0n)
		})
	})

	describe('Claim Functions', () => {
		test('reverts when claiming with no cashback', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'claimCashback',
				}),
			).rejects.toThrow()
		})

		test('reverts when claiming with no referral rewards', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'claimReferral',
				}),
			).rejects.toThrow()
		})

		test('reverts when claiming all with nothing to claim', async () => {
			expect(
				client.simulateContract({
					account: accounts.alice,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'claimAll',
				}),
			).rejects.toThrow()
		})
	})
})
*/
