import { describe, test, expect, beforeAll, afterEach } from 'bun:test'
import {
	type Address,
	parseEventLogs,
	keccak256,
	toBytes,
	type Hex,
	encodeAbiParameters,
	concat,
	pad,
	getContractAddress,
} from 'viem'
import { createTestPublicClient, createTestWalletClient, checkAnvilConnection } from './libs/setup.ts'
import { type DeployedContracts, loadDeployedContracts } from './libs/contracts.ts'
import { getAllAccounts } from './libs/accounts.ts'
import { randomBytes } from 'crypto'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

// Helper function to generate random requestId
const generateRequestId = () => `0x${randomBytes(32).toString('hex')}` as Hex

// Helper function to compute salt matching Solidity's EfficientHashLib.hash
// EfficientHashLib.hash(v0, v1, v2) = keccak256(abi.encode(v0, v1, v2))
function computeSalt(sender: Address, requestId: Hex, suffix: string): Hex {
	// In Solidity: bytes32(bytes20(uint160(msg.sender)))
	// This means the address takes up the LEFT 20 bytes, with 12 zeros on the RIGHT
	const senderBytes32 = pad(sender as Hex, { dir: 'right', size: 32 })

	// Convert suffix string to bytes32 (pad right with zeros for strings)
	const suffixBytes = toBytes(suffix)
	const suffixBytes32 = pad(suffixBytes, { dir: 'right', size: 32 })
	const suffixHex = `0x${Array.from(suffixBytes32)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')}` as Hex

	// Compute keccak256(abi.encode(senderBytes32, requestId, suffixBytes32))
	return keccak256(
		encodeAbiParameters(
			[{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }],
			[senderBytes32, requestId, suffixHex],
		),
	)
}

describe('Factory', () => {
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
		test('test quote token address', async () => {
			const quoteTokenAddress = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'quoteToken',
			})
			expect(quoteTokenAddress).toBe(contracts.usdc.address)
		})

		test('factory has correct reward contract', async () => {
			const rewardAddress = await client.readContract({
				address: contracts.factory.address,
				abi: contracts.factory.abi,
				functionName: 'rewardContract',
			})
			expect(rewardAddress).toBe(contracts.reward.address)
		})
	})

	describe('Token & Curve Creation', () => {
		describe('Basic Deployment', () => {
			test('deploys token and curve successfully and emits event', async () => {
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Test Token', 'TEST', generateRequestId()],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Verify transaction succeeded
				expect(receipt.status).toBe('success')

				// Parse CurveCreated event
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				expect(logs.length).toBe(1)

				const { creator, token0, token1, curve } = logs[0]!.args

				// Verify addresses are non-zero
				expect(creator.toLowerCase()).toBe(accounts.admin.address.toLowerCase())
				expect(token0).not.toBe(ZERO_ADDRESS)
				expect(token1).not.toBe(ZERO_ADDRESS)
				expect(curve).not.toBe(ZERO_ADDRESS)

				// Verify token0 < token1 (sorted)
				expect(BigInt(token0) < BigInt(token1)).toBe(true)
			})

			test('multiple deployments create different addresses', async () => {
				// First deployment
				const { request: request1 } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Token One', 'TOK1', generateRequestId()],
				})
				const hash1 = await walletClient.writeContract(request1)
				const receipt1 = await client.waitForTransactionReceipt({ hash: hash1 })

				const logs1 = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt1.logs,
				})

				const { token0: token0_1, token1: token1_1, curve: curve1 } = logs1[0]!.args
				// token0 and token1 are sorted, one is the new token and one is USDC
				// Find which one is NOT USDC
				const token1Address = token0_1.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1_1 : token0_1

				// Second deployment
				const { request: request2 } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Token Two', 'TOK2', generateRequestId()],
				})
				const hash2 = await walletClient.writeContract(request2)
				const receipt2 = await client.waitForTransactionReceipt({ hash: hash2 })

				const logs2 = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt2.logs,
				})

				const { token0: token0_2, token1: token1_2, curve: curve2 } = logs2[0]!.args
				// Find which one is NOT WETH
				const token2Address = token0_2.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1_2 : token0_2

				// Verify addresses are different
				expect(token1Address.toLowerCase()).not.toBe(token2Address.toLowerCase())
				expect(curve1.toLowerCase()).not.toBe(curve2.toLowerCase())

				// Verify both are in the mapping
				const mappedCurve1 = await client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCurve',
					args: [token1Address],
				})

				const mappedCurve2 = await client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCurve',
					args: [token2Address],
				})

				expect(mappedCurve1.toLowerCase()).toBe(curve1.toLowerCase())
				expect(mappedCurve2.toLowerCase()).toBe(curve2.toLowerCase())
			})
		})

		describe('Token Properties', () => {
			test('token has correct name and symbol', async () => {
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Test Token', 'TEST', generateRequestId()],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Parse CurveCreated event
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				const { token0, token1 } = logs[0]!.args
				// token0 and token1 are sorted, one is the new token and one is USDC
				// Find which one is NOT USDC
				const tokenAddress = token0.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1 : token0

				// Read token properties
				const name = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'name',
				})

				const symbol = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'symbol',
				})

				const decimals = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'decimals',
				})

				const totalSupply = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'totalSupply',
				})

				expect(name).toBe('Test Token')
				expect(symbol).toBe('TEST')
				expect(decimals).toBe(6)
				expect(totalSupply).toBe(BigInt(1_000_000_000) * BigInt(10 ** 6))
			})

			test('curve holds all tokens', async () => {
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Test Token', 'TEST', generateRequestId()],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Parse CurveCreated event
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				const { token0, token1, curve } = logs[0]!.args
				// token0 and token1 are sorted, one is the new token and one is USDC
				// Find which one is NOT USDC
				const tokenAddress = token0.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1 : token0

				// Check balances
				const curveBalance = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [curve],
				})

				const factoryBalance = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [contracts.factory.address],
				})

				const deployerBalance = await client.readContract({
					address: tokenAddress,
					abi: contracts.token.abi,
					functionName: 'balanceOf',
					args: [accounts.admin.address],
				})

				const totalSupply = BigInt(1_000_000_000) * BigInt(10 ** 6)
				expect(curveBalance).toBe(totalSupply)
				expect(factoryBalance).toBe(BigInt(0))
				expect(deployerBalance).toBe(BigInt(0))
			})
		})

		describe('Curve Properties', () => {
			test('curve has correct properties', async () => {
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Test Token', 'TEST', generateRequestId()],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Parse CurveCreated event
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				const { token0, token1, curve } = logs[0]!.args
				// token0 and token1 are sorted, one is the new token and one is USDC
				// Find which one is NOT USDC
				const tokenAddress = token0.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1 : token0

				// Read curve properties
				const baseToken = await client.readContract({
					address: curve,
					abi: contracts.curve.abi,
					functionName: 'baseToken',
				})

				const quoteToken = await client.readContract({
					address: curve,
					abi: contracts.curve.abi,
					functionName: 'quoteToken',
				})

				const creator = await client.readContract({
					address: curve,
					abi: contracts.curve.abi,
					functionName: 'creator',
				})

				const factory = await client.readContract({
					address: curve,
					abi: contracts.curve.abi,
					functionName: 'factory',
				})

				expect(baseToken.toLowerCase()).toBe(tokenAddress.toLowerCase())
				expect(quoteToken.toLowerCase()).toBe(contracts.usdc.address.toLowerCase())
				expect(creator.toLowerCase()).toBe(accounts.admin.address.toLowerCase())
				expect(factory.toLowerCase()).toBe(contracts.factory.address.toLowerCase())
			})

			test('factory mapping is updated', async () => {
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Test Token', 'TEST', generateRequestId()],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Parse CurveCreated event
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				const { token0, token1, curve } = logs[0]!.args
				// token0 and token1 are sorted, one is the new token and one is USDC
				// Find which one is NOT USDC
				const tokenAddress = token0.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1 : token0

				// Read from mapping
				const mappedCurve = await client.readContract({
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'getCurve',
					args: [tokenAddress],
				})

				expect(mappedCurve.toLowerCase()).toBe(curve.toLowerCase())
			})
		})

		describe('CREATE2 Address Prediction', () => {
			test('predicts token address correctly with CREATE2', async () => {
				const requestId = generateRequestId()
				const tokenName = 'Predicted Token'
				const tokenSymbol = 'PRED'

				// Compute expected salt
				const tokenSalt = computeSalt(accounts.admin.address, requestId, 'TOKEN')

				// Get token bytecode (creationCode + constructor args)
				const tokenBytecode = concat([
					contracts.token.bytecode as Hex,
					encodeAbiParameters(
						[{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'address' }],
						[tokenName, tokenSymbol, contracts.factory.address, contracts.factory.address],
					),
				])

				// Predict address using CREATE2
				const predictedTokenAddress = getContractAddress({
					from: contracts.factory.address,
					salt: tokenSalt,
					bytecode: tokenBytecode,
					opcode: 'CREATE2',
				})

				// Deploy the token
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: [tokenName, tokenSymbol, requestId],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Parse event to get actual address
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				const { token0, token1 } = logs[0]!.args
				const actualTokenAddress = token0.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1 : token0

				// Verify prediction matches reality
				expect(predictedTokenAddress.toLowerCase()).toBe(actualTokenAddress.toLowerCase())
			})

			test('predicts curve address correctly with CREATE2', async () => {
				const requestId = generateRequestId()
				const tokenName = 'Test Token'
				const tokenSymbol = 'TEST'

				// First, we need to predict the token address to compute curve bytecode
				const tokenSalt = computeSalt(accounts.admin.address, requestId, 'TOKEN')
				const tokenBytecode = concat([
					contracts.token.bytecode as Hex,
					encodeAbiParameters(
						[{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'address' }],
						[tokenName, tokenSymbol, contracts.factory.address, contracts.factory.address],
					),
				])
				const predictedTokenAddress = getContractAddress({
					from: contracts.factory.address,
					salt: tokenSalt,
					bytecode: tokenBytecode,
					opcode: 'CREATE2',
				})

				// Now predict curve address
				const curveSalt = computeSalt(accounts.admin.address, requestId, 'CURVE')
				const curveBytecode = concat([
					contracts.curve.bytecode as Hex,
					encodeAbiParameters(
						[{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }],
						[
							predictedTokenAddress,
							contracts.usdc.address,
							accounts.admin.address,
							contracts.uniswapV3Factory.address,
							contracts.reward.address,
						],
					),
				])
				const predictedCurveAddress = getContractAddress({
					from: contracts.factory.address,
					salt: curveSalt,
					bytecode: curveBytecode,
					opcode: 'CREATE2',
				})

				// Deploy
				const { request } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: [tokenName, tokenSymbol, requestId],
				})
				const hash = await walletClient.writeContract(request)
				const receipt = await client.waitForTransactionReceipt({ hash })

				// Parse event to get actual address
				const logs = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt.logs,
				})

				const { curve: actualCurveAddress } = logs[0]!.args

				// Verify prediction matches reality
				expect(predictedCurveAddress.toLowerCase()).toBe(actualCurveAddress.toLowerCase())
			})

			test('CREATE2 reverts on duplicate deployment (same requestId + same params)', async () => {
				const requestId = generateRequestId()
				const tokenName = 'Duplicate Token'
				const tokenSymbol = 'DUP'

				// First deployment
				const { request: request1 } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: [tokenName, tokenSymbol, requestId],
				})
				const hash1 = await walletClient.writeContract(request1)
				await client.waitForTransactionReceipt({ hash: hash1 })

				// Second deployment with same requestId and params should fail
				expect(
					client.simulateContract({
						account: accounts.admin,
						address: contracts.factory.address,
						abi: contracts.factory.abi,
						functionName: 'mintTokenAndCreateCurve',
						args: [tokenName, tokenSymbol, requestId],
					}),
				).rejects.toThrow()
			})

			test('allows same requestId with different params (creates different address)', async () => {
				const requestId = generateRequestId()

				// First deployment
				const { request: request1 } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Token A', 'TKA', requestId],
				})
				const hash1 = await walletClient.writeContract(request1)
				const receipt1 = await client.waitForTransactionReceipt({ hash: hash1 })

				const logs1 = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt1.logs,
				})
				const { token0: token0_1, token1: token1_1 } = logs1[0]!.args
				const token1Address = token0_1.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1_1 : token0_1

				// Second deployment with same requestId but different params should succeed
				const { request: request2 } = await client.simulateContract({
					account: accounts.admin,
					address: contracts.factory.address,
					abi: contracts.factory.abi,
					functionName: 'mintTokenAndCreateCurve',
					args: ['Token B', 'TKB', requestId], // Same requestId, different name/symbol
				})
				const hash2 = await walletClient.writeContract(request2)
				const receipt2 = await client.waitForTransactionReceipt({ hash: hash2 })

				const logs2 = parseEventLogs({
					abi: contracts.factory.abi,
					eventName: 'CurveCreated',
					logs: receipt2.logs,
				})
				const { token0: token0_2, token1: token1_2 } = logs2[0]!.args
				const token2Address = token0_2.toLowerCase() === contracts.usdc.address.toLowerCase() ? token1_2 : token0_2

				// Verify different addresses (because different bytecode)
				expect(token1Address.toLowerCase()).not.toBe(token2Address.toLowerCase())
			})
		})
	})
})
