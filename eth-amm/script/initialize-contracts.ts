#!/usr/bin/env bun
/**
 * Initialize deployed Kimchi contracts
 * Run after deployment: bun run script/initialize-contracts.ts
 *
 * This script:
 * - Loads deployed contract addresses from deployments/anvil.json
 * - Uses account definitions from test-ts/helpers/accounts.ts
 * - Initializes contracts with proper configuration
 * - Is idempotent (safe to run multiple times)
 */

import { createWalletClient, createPublicClient, http, type Address, getContract } from "viem";
import { anvil } from "viem/chains";
import { join } from "path";
import { ANVIL_ACCOUNTS, getAccount } from "../test-ts/helpers/accounts";
import {
  KimchiFactoryAbi,
  KimchiCashbackAbi,
  KimchiMigrationAbi,
} from "../test-ts/generated";

interface DeploymentData {
  network: string;
  chainId: number;
  deployer: Address;
  contracts: {
    MockWETH: Address;
    KimchiFactory: Address;
    KimchiCashback: Address;
    KimchiAMM: Address;
    KimchiMigration: Address;
  };
}

/**
 * Load deployed contract addresses from deployments/anvil.json
 */
async function loadDeployedAddresses(): Promise<DeploymentData> {
  const deploymentPath = join(import.meta.dir, "../deployments/anvil.json");

  try {
    const file = Bun.file(deploymentPath);
    const deployment = await file.json();
    return deployment as DeploymentData;
  } catch (error) {
    throw new Error(
      `Failed to load deployment file at ${deploymentPath}.\n` +
        `Make sure to run: ./script/deploy-local.sh\n` +
        `Error: ${error}`
    );
  }
}

async function main() {
  console.log("\n🔧 Initializing Kimchi Contracts\n");

  // Load deployed addresses
  const deployment = await loadDeployedAddresses();
  const { contracts } = deployment;

  // Setup clients
  const publicClient = createPublicClient({
    chain: anvil,
    transport: http("http://localhost:8545"),
  });

  const deployerAccount = getAccount(ANVIL_ACCOUNTS.DEPLOYER.privateKey);
  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: anvil,
    transport: http("http://localhost:8545"),
  });

  console.log("📍 Using contracts:");
  console.log(`   MockWETH:       ${contracts.MockWETH}`);
  console.log(`   KimchiFactory:  ${contracts.KimchiFactory}`);
  console.log(`   KimchiCashback: ${contracts.KimchiCashback}`);
  console.log(`   KimchiAMM:      ${contracts.KimchiAMM}`);
  console.log(`   KimchiMigration: ${contracts.KimchiMigration}`);
  console.log();

  // Get factory contract
  const factory = getContract({
    address: contracts.KimchiFactory,
    abi: KimchiFactoryAbi,
    client: { public: publicClient, wallet: walletClient },
  });

  // Check if factory is already initialized (idempotent check)
  console.log("🔍 Checking initialization status...");
  const config = await factory.read.getConfig();

  if (config.isInitialized) {
    console.log("✅ Contracts are already initialized!");
    console.log(`   Fee Claimer: ${config.feeClaimer}`);
    console.log(`   Quote Token: ${config.quoteToken}`);
    console.log("\nNo action needed.\n");
    return;
  }

  console.log("⚠️  Contracts not initialized. Starting initialization...\n");

  // 1. Initialize Factory
  console.log("1️⃣  Initializing Factory config...");
  console.log(`   Fee Claimer: ${ANVIL_ACCOUNTS.FEE_CLAIMER.address}`);
  console.log(`   Quote Token (WETH): ${contracts.MockWETH}`);

  const initHash = await factory.write.initializeConfig([
    ANVIL_ACCOUNTS.FEE_CLAIMER.address,
    contracts.MockWETH,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: initHash });
  console.log("   ✅ Factory initialized\n");

  // 2. Set contract references in Factory
  console.log("2️⃣  Setting contract references in Factory...");

  const setCashbackHash = await factory.write.setCashbackContract([
    contracts.KimchiCashback,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: setCashbackHash });
  console.log("   ✅ Cashback contract set");

  const setAmmInFactoryHash = await factory.write.setAmmContract([
    contracts.KimchiAMM,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: setAmmInFactoryHash });
  console.log("   ✅ AMM contract set\n");

  // 3. Set AMM in Cashback
  console.log("3️⃣  Setting AMM in Cashback...");
  const cashback = getContract({
    address: contracts.KimchiCashback,
    abi: KimchiCashbackAbi,
    client: { public: publicClient, wallet: walletClient },
  });

  const setAmmInCashbackHash = await cashback.write.setAmmContract([
    contracts.KimchiAMM,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: setAmmInCashbackHash });
  console.log("   ✅ AMM set in Cashback\n");

  // 4. Set AMM in Migration
  console.log("4️⃣  Setting AMM in Migration...");
  const migration = getContract({
    address: contracts.KimchiMigration,
    abi: KimchiMigrationAbi,
    client: { public: publicClient, wallet: walletClient },
  });

  const setAmmInMigrationHash = await migration.write.setAmmContract([
    contracts.KimchiAMM,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: setAmmInMigrationHash });
  console.log("   ✅ AMM set in Migration\n");

  console.log("✅ All contracts initialized successfully!");
  console.log(`   Fee Claimer: ${ANVIL_ACCOUNTS.FEE_CLAIMER.address}`);
  console.log(`   Quote Token: ${contracts.MockWETH}\n`);
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
