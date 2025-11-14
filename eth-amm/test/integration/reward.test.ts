import { describe, test, expect, beforeAll } from 'bun:test'
import { type Address } from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'

describe('PumpReward', () => {
	let client: ReturnType<typeof createTestPublicClient>
	let walletClient: ReturnType<typeof createTestWalletClient>
	let contracts: DeployedContracts
	let accounts: ReturnType<typeof getAllAccounts>

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

	describe('Configuration', () => {
		test('reward contract has correct factory address', async () => {
			const factoryAddress = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'factory',
			})
			expect(factoryAddress).toBe(contracts.factory.address)
		})

		test('reward contract has correct quote token address', async () => {
			const quoteTokenAddress = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'quoteToken',
			})
			expect(quoteTokenAddress).toBe(contracts.usdc.address)
		})

		test('test owner', async () => {
			const owner = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'owner',
			})
			// Anvil's default account #0
			const expectedOwner = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address
			expect(owner.toLowerCase()).toBe(expectedOwner.toLowerCase())
		})

		test('test default fee config', async () => {
			const data = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'feeConfig',
			})

			// Default fees from constructor:
			expect(data.feeBasisPoints).toBe(150) // 1.5%
			expect(data.creatorFeeBasisPoints).toBe(50) // 0.5%
			expect(data.l1ReferralFeeBasisPoints).toBe(30) // 0.3%
			expect(data.l2ReferralFeeBasisPoints).toBe(3) // 0.03%
			expect(data.l3ReferralFeeBasisPoints).toBe(2) // 0.02%
			expect(data.refereeDiscountBasisPoints).toBe(10) // 0.1%
		})
	})

	describe('Fee Configuration Management', () => {
		test('test update fee config', async () => {
			const newConfig = {
				feeBasisPoints: 200, // 2%
				creatorFeeBasisPoints: 60, // 0.6%
				l1ReferralFeeBasisPoints: 40, // 0.4%
				l2ReferralFeeBasisPoints: 5, // 0.05%
				l3ReferralFeeBasisPoints: 3, // 0.03%
				refereeDiscountBasisPoints: 15, // 0.15%
			}

			const { request } = await client.simulateContract({
				account: accounts.deployer,
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'setFeeConfig',
				args: [newConfig],
			})
			const hash = await walletClient.writeContract(request)

			await client.waitForTransactionReceipt({ hash })

			const data = await client.readContract({
				address: contracts.reward.address,
				abi: contracts.reward.abi,
				functionName: 'feeConfig',
			})
			expect(data).toEqual(newConfig)
		})

		describe('Fee Validation', () => {
			test('reverts when non-owner tries to update fee config', async () => {
				const newConfig = {
					feeBasisPoints: 200, // 2%
					creatorFeeBasisPoints: 60, // 0.6%
					l1ReferralFeeBasisPoints: 40, // 0.4%
					l2ReferralFeeBasisPoints: 5, // 0.05%
					l3ReferralFeeBasisPoints: 3, // 0.03%
					refereeDiscountBasisPoints: 15, // 0.15%
				}

				// Try to update fee config as non-owner (accounts.alice)
				expect(
					client.simulateContract({
						account: accounts.alice,
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'setFeeConfig',
						args: [newConfig],
					}),
				).rejects.toThrow()
			})

			test('test fee config validation - fee too high', async () => {
				// Try to set fee above 100% (10000 basis points)
				const invalidConfig = {
					feeBasisPoints: 10001, // > 100%
					creatorFeeBasisPoints: 50,
					l1ReferralFeeBasisPoints: 30,
					l2ReferralFeeBasisPoints: 3,
					l3ReferralFeeBasisPoints: 2,
					refereeDiscountBasisPoints: 10,
				}

				// Should revert with "Fee too high"
				expect(
					client.simulateContract({
						account: accounts.deployer,
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'setFeeConfig',
						args: [invalidConfig],
					}),
				).rejects.toThrow()
			})

			test('test fee config validation - L1 must be >= L2', async () => {
				// L1 < L2 should fail
				const invalidConfig = {
					feeBasisPoints: 150,
					creatorFeeBasisPoints: 50,
					l1ReferralFeeBasisPoints: 5, // L1 < L2
					l2ReferralFeeBasisPoints: 10,
					l3ReferralFeeBasisPoints: 2,
					refereeDiscountBasisPoints: 10,
				}

				// Should revert with "L1 must be >= L2"
				expect(
					client.simulateContract({
						account: accounts.deployer,
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'setFeeConfig',
						args: [invalidConfig],
					}),
				).rejects.toThrow()
			})

			test('test fee config validation - L2 must be >= L3', async () => {
				// L2 < L3 should fail
				const invalidConfig = {
					feeBasisPoints: 150,
					creatorFeeBasisPoints: 50,
					l1ReferralFeeBasisPoints: 30,
					l2ReferralFeeBasisPoints: 2, // L2 < L3
					l3ReferralFeeBasisPoints: 5,
					refereeDiscountBasisPoints: 10,
				}

				// Should revert with "L2 must be >= L3"
				expect(
					client.simulateContract({
						account: accounts.deployer,
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'setFeeConfig',
						args: [invalidConfig],
					}),
				).rejects.toThrow()
			})

			test('test fee config validation - fees exceed total', async () => {
				// Total of creator + referral fees exceeds feeBasisPoints
				const invalidConfig = {
					feeBasisPoints: 100,
					creatorFeeBasisPoints: 50,
					l1ReferralFeeBasisPoints: 40,
					l2ReferralFeeBasisPoints: 20,
					l3ReferralFeeBasisPoints: 10, // 50 + 40 + 20 + 10 = 120 > 100
					refereeDiscountBasisPoints: 10,
				}

				// Should revert with "Fees exceed total"
				expect(
					client.simulateContract({
						account: accounts.deployer,
						address: contracts.reward.address,
						abi: contracts.reward.abi,
						functionName: 'setFeeConfig',
						args: [invalidConfig],
					}),
				).rejects.toThrow()
			})
		})
	})
})
