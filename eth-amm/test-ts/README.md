# TypeScript Integration Tests

This directory contains TypeScript integration tests for the Kimchi AMM contracts using `viem` and `bun`.

## Setup

### Prerequisites

1. **Install Bun** (if not already installed):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Build contracts and generate types**:
   ```bash
   forge build
   bun run generate:types
   ```

## Running Tests

### 1. Start Anvil (Local Ethereum Node)

In a terminal, start anvil:
```bash
anvil
```

This will start a local Ethereum node at `http://127.0.0.1:8545` with pre-funded test accounts.

### 2. Deploy Contracts

In another terminal, deploy the contracts to anvil:
```bash
./script/deploy-local.sh
```

This will:
- Deploy all Kimchi contracts (Factory, AMM, Cashback, Migration, MockWETH)
- Initialize the contracts
- Save contract addresses to `deployments/anvil.json`

### 3. Run Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test-ts/integration/factory.test.ts

# Run tests matching a pattern
bun test --test-name-pattern "should create"

# Run in watch mode (re-runs on file changes)
bun test:watch

# Type check without running tests
bun run check-types
```

## Test Structure

```
test-ts/
├── generated/          # Auto-generated contract types (from ABIs)
├── helpers/           # Test helpers
│   ├── accounts.ts    # Anvil default test accounts
│   ├── constants.ts   # Test constants (fees, decimals, amounts)
│   ├── contracts.ts   # Load deployed contract addresses
│   └── index.ts       # Unified exports
├── integration/       # Integration test suites
│   ├── factory.test.ts    # Token creation & deployment
│   ├── trading.test.ts    # Buy/sell operations
│   ├── referral.test.ts   # 3-tier referral system
│   └── cashback.test.ts   # Cashback tiers & claiming
└── setup.ts           # Viem client configuration
```

## Test Coverage

### Factory Tests (`factory.test.ts`)
- ✅ Initial config verification
- ✅ Token creation with CREATE2
- ✅ Duplicate prevention
- ✅ Multiple users creating tokens

### Trading Tests (`trading.test.ts`)
- ✅ Buy tokens with bonding curve
- ✅ Sell tokens
- ✅ Slippage protection
- ✅ Price tracking

### Referral Tests (`referral.test.ts`)
- ✅ Set referrer
- ✅ Get 3-tier referral chain (L1, L2, L3)
- ✅ Prevent self-referral
- ✅ Prevent changing referrer
- ✅ Fee distribution to referrers

### Cashback Tests (`cashback.test.ts`)
- ✅ Create cashback accounts
- ✅ Get user tier
- ✅ Cashback accumulation from trading
- ✅ Claim eligibility checking
- ✅ Account details retrieval
- ✅ Tier verification

## Available Test Accounts

The tests use Anvil's default accounts, each pre-funded with 10,000 ETH:

| Account      | Address                                      | Role                    |
| ------------ | -------------------------------------------- | ----------------------- |
| DEPLOYER     | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   | Contract deployer       |
| ADMIN        | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8   | Admin                   |
| FEE_CLAIMER  | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   | Fee claimer             |
| CREATOR      | 0x90F79bf6EB2c4f870365E785982E1f101E93b906   | Token creator           |
| ALICE        | 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65   | Test trader #1          |
| BOB          | 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc   | Test trader #2          |
| CHARLIE      | 0x976EA74026E726554dB657fA54763abd0C3a0aa9   | Test trader #3          |
| DAVE         | 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955   | Test trader #4          |

## How It Works

### Contract Loading

Instead of deploying contracts in the tests, we load already-deployed contract addresses from `deployments/anvil.json`:

```typescript
import { loadDeployedContracts } from "./helpers";

// Load contracts (reads from deployments/anvil.json)
const contracts = await loadDeployedContracts();

// Use contracts
const factory = getContract({
  address: contracts.factory.address,
  abi: contracts.factory.abi,
  client: { public: publicClient, wallet: walletClient },
});
```

This approach:
- ✅ Uses your existing deployment script
- ✅ Faster test execution (no deployment time)
- ✅ Tests against the same contracts you deploy
- ✅ Consistent with production workflow

### Type Safety

All contracts are fully type-safe thanks to auto-generated types:

```typescript
// Type-safe contract interactions
const name = await token.read.name();  // string
const balance = await token.read.balanceOf([address]);  // bigint
await amm.write.buyTokens([tokenAddress, amount, minOut]);  // typed args
```

## Troubleshooting

### "Failed to connect to anvil"

Make sure anvil is running:
```bash
anvil
```

### "Failed to load deployment file"

Deploy the contracts first:
```bash
./script/deploy-local.sh
```

### "Contract deployment failed"

Restart anvil and redeploy:
```bash
# Terminal 1: Kill anvil (Ctrl+C) and restart
anvil

# Terminal 2: Redeploy
./script/deploy-local.sh
```

### Type errors

Regenerate types after contract changes:
```bash
forge build
bun run generate:types
```

## Tips

1. **Keep anvil running** between test runs for faster execution
2. **Use watch mode** for rapid iteration: `bun test:watch`
3. **Run specific tests** to focus on what you're working on
4. **Check types often** with `bun run check-types` before committing

## NPM Scripts

```json
{
  "test": "bun test test-ts",                    // Run all tests
  "test:watch": "bun test --watch test-ts",      // Watch mode
  "generate:types": "bun run scripts/generate-types.ts",  // Generate types
  "build": "forge build && bun run generate:types",       // Full build
  "check-types": "tsc --noEmit"                  // Type check only
}
```
