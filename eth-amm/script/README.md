# Deployment Scripts

## Quick Start

### 1. Start Anvil (Local Network)

```bash
anvil
```

This will start a local Ethereum node at `http://localhost:8545` with 10 pre-funded accounts.

### 2. Deploy Contracts

```bash
./script/deploy-local.sh
```

This will deploy all Kimchi contracts to your local Anvil network.

## Deployed Contracts

The deployment will create:

1. **MockWETH** - Mock Wrapped ETH for testing
2. **KimchiFactory** - Factory contract for creating tokens and managing protocol config
3. **KimchiCashback** - Cashback management contract
4. **KimchiAMM** - AMM contract for trading on bonding curves
5. **KimchiMigration** - Migration contract for graduating tokens (stub implementation)

## Default Accounts (Anvil)

- **Account #0** (Deployer/Owner): `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
  - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

- **Account #1** (Fee Claimer): `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
  - Private Key: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

- **Account #2-9**: Available for testing

## Manual Deployment

If you prefer to deploy manually:

```bash
forge script script/Deploy.s.sol:Deploy \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --legacy \
    -vvv
```

## Environment Variables

You can customize deployment with environment variables:

```bash
PRIVATE_KEY=0x... ./script/deploy-local.sh
```

## Deployment Artifacts

- Contract addresses are saved to: `deployments/anvil.json`
- Broadcast logs: `broadcast/Deploy.s.sol/31337/`

## Verifying Deployment

After deployment, you can verify the contracts are deployed correctly:

```bash
# Check Factory initialization
cast call <FACTORY_ADDRESS> "getConfig()" --rpc-url http://localhost:8545

# Check WETH balance
cast balance <YOUR_ADDRESS> --rpc-url http://localhost:8545
```

## Testing with Deployed Contracts

After deployment, you can use the TypeScript tests with the deployed contracts:

```bash
bun test test-ts/
```

Make sure to update the contract addresses in your test helper files if needed.