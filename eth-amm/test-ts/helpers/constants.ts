/**
 * Common test constants
 */

import { parseEther, parseUnits } from 'viem'

// Anvil local RPC endpoint
export const ANVIL_RPC_URL = 'http://127.0.0.1:8545'
export const CHAIN_ID = 1 // Anvil chain ID

// Token decimals
export const BASE_TOKEN_DECIMALS = 6
export const QUOTE_TOKEN_DECIMALS = 18

// Initial supply for KimchiToken (1 billion tokens with 6 decimals)
export const INITIAL_TOKEN_SUPPLY = parseUnits('1000000000', BASE_TOKEN_DECIMALS)

// Bonding curve parameters (from KimchiFactory)
export const INITIAL_VIRTUAL_QUOTE_RESERVE = parseEther('30')
export const INITIAL_VIRTUAL_BASE_RESERVE = parseUnits('1073000000', BASE_TOKEN_DECIMALS)
export const MIGRATION_QUOTE_THRESHOLD = parseEther('85')

// Fee basis points (from test data)
export const FEE_BASIS_POINTS = 500 // 5%
export const L1_REFERRAL_FEE_BASIS_POINTS = 300 // 3%
export const L2_REFERRAL_FEE_BASIS_POINTS = 150 // 1.5%
export const L3_REFERRAL_FEE_BASIS_POINTS = 50 // 0.5%
export const REFEREE_DISCOUNT_BASIS_POINTS = 50 // 0.5%
export const CREATOR_FEE_BASIS_POINTS = 100 // 1%
export const MIGRATION_FEE_BASIS_POINTS = 500 // 5%

// Cashback tiers (from LibCashback)
export const CASHBACK_TIERS = {
  WOOD: { minVolume: 0n, cashbackBps: 5 }, // 0.05%
  BRONZE: { minVolume: parseEther('10'), cashbackBps: 10 }, // 0.10%
  SILVER: { minVolume: parseEther('50'), cashbackBps: 12 }, // 0.12%
  GOLD: { minVolume: parseEther('100'), cashbackBps: 15 }, // 0.15%
  PLATINUM: { minVolume: parseEther('500'), cashbackBps: 18 }, // 0.18%
  DIAMOND: { minVolume: parseEther('1000'), cashbackBps: 20 }, // 0.20%
  CHAMPION: { minVolume: parseEther('5000'), cashbackBps: 25 }, // 0.25%
}

// Cooldown periods
export const CASHBACK_CLAIM_COOLDOWN = 7 * 24 * 60 * 60 // 7 days in seconds
export const CASHBACK_INACTIVE_PERIOD = 365 * 24 * 60 * 60 // 365 days in seconds

// Test amounts
export const TEST_AMOUNTS = {
  SMALL_BUY: parseEther('0.1'),
  MEDIUM_BUY: parseEther('1'),
  LARGE_BUY: parseEther('10'),
}
