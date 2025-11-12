/**
 * Common test constants
 */

import { parseEther, parseUnits } from 'viem'

// Anvil local RPC endpoint
export const ANVIL_RPC_URL = 'http://127.0.0.1:8545'
export const CHAIN_ID = 31337 // Anvil chain ID

// Token decimals
export const BASE_TOKEN_DECIMALS = 6
export const QUOTE_TOKEN_DECIMALS = 6 // USDC has 6 decimals

// Initial supply for PumpToken (1 billion tokens with 6 decimals)
export const INITIAL_TOKEN_SUPPLY = BigInt(1_000_000_000) * BigInt(10 ** BASE_TOKEN_DECIMALS)

// Bonding curve parameters
export const INITIAL_VIRTUAL_QUOTE_RESERVE = parseUnits('5000', 6) // 5,000 USDC
export const INITIAL_VIRTUAL_BASE_RESERVE = BigInt(1_073_000_000) * BigInt(10 ** BASE_TOKEN_DECIMALS)
export const MIGRATION_QUOTE_THRESHOLD = parseUnits('85000', 6) // 85,000 USDC

// Fee basis points (from test data)
export const FEE_BASIS_POINTS = 500 // 5%
export const L1_REFERRAL_FEE_BASIS_POINTS = 300 // 3%
export const L2_REFERRAL_FEE_BASIS_POINTS = 150 // 1.5%
export const L3_REFERRAL_FEE_BASIS_POINTS = 50 // 0.5%
export const REFEREE_DISCOUNT_BASIS_POINTS = 50 // 0.5%
export const CREATOR_FEE_BASIS_POINTS = 100 // 1%
export const MIGRATION_FEE_BASIS_POINTS = 500 // 5%

// Cashback tiers (from PumpCashback)
export const CASHBACK_TIERS = {
	WOOD: { minVolume: 0n, cashbackBps: 5 }, // 0.05%
	BRONZE: { minVolume: parseUnits('10000', 6), cashbackBps: 8 }, // 0.08%
	SILVER: { minVolume: parseUnits('50000', 6), cashbackBps: 12 }, // 0.12%
	GOLD: { minVolume: parseUnits('250000', 6), cashbackBps: 15 }, // 0.15%
	PLATINUM: { minVolume: parseUnits('1000000', 6), cashbackBps: 18 }, // 0.18%
	DIAMOND: { minVolume: parseUnits('5000000', 6), cashbackBps: 22 }, // 0.22%
	CHAMPION: { minVolume: parseUnits('25000000', 6), cashbackBps: 25 }, // 0.25%
}

// Cooldown periods
export const CASHBACK_CLAIM_COOLDOWN = 7 * 24 * 60 * 60 // 7 days in seconds
export const CASHBACK_INACTIVE_PERIOD = 365 * 24 * 60 * 60 // 365 days in seconds

// Test amounts (in USDC, 6 decimals)
export const TEST_AMOUNTS = {
	SMALL_BUY: parseUnits('100', 6), // 100 USDC
	MEDIUM_BUY: parseUnits('1000', 6), // 1,000 USDC
	LARGE_BUY: parseUnits('10000', 6), // 10,000 USDC
}
