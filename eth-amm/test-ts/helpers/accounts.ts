/**
 * Test accounts using Anvil's default accounts
 * https://book.getfoundry.sh/reference/anvil/
 */

import type { Address, PrivateKeyAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Anvil's default accounts with 10,000 ETH each
 * Mnemonic: "test test test test test test test test test test test junk"
 */
export const ANVIL_ACCOUNTS = {
  DEPLOYER: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
  },
  ADMIN: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`,
  },
  FEE_CLAIMER: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as `0x${string}`,
  },
  CREATOR: {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as Address,
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' as `0x${string}`,
  },
  ALICE: {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as Address,
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' as `0x${string}`,
  },
  BOB: {
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as Address,
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as `0x${string}`,
  },
  CHARLIE: {
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as Address,
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e' as `0x${string}`,
  },
  DAVE: {
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as Address,
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356' as `0x${string}`,
  },
}

/**
 * Get a viem account from private key
 */
export function getAccount(privateKey: `0x${string}`): PrivateKeyAccount {
  return privateKeyToAccount(privateKey)
}

/**
 * Get all test accounts as viem accounts
 */
export function getAllAccounts() {
  return {
    deployer: getAccount(ANVIL_ACCOUNTS.DEPLOYER.privateKey),
    admin: getAccount(ANVIL_ACCOUNTS.ADMIN.privateKey),
    feeClaimer: getAccount(ANVIL_ACCOUNTS.FEE_CLAIMER.privateKey),
    creator: getAccount(ANVIL_ACCOUNTS.CREATOR.privateKey),
    alice: getAccount(ANVIL_ACCOUNTS.ALICE.privateKey),
    bob: getAccount(ANVIL_ACCOUNTS.BOB.privateKey),
    charlie: getAccount(ANVIL_ACCOUNTS.CHARLIE.privateKey),
    dave: getAccount(ANVIL_ACCOUNTS.DAVE.privateKey),
  }
}
