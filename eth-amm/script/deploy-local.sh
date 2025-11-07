#!/usr/bin/env bash
# Deploy Kimchi contracts to local Anvil network
# Usage: ./script/deploy-local.sh

set -e

echo "🚀 Deploying Kimchi contracts to Anvil..."
echo ""

# Check if Anvil is running
if ! curl -s http://localhost:8545 > /dev/null; then
    echo "❌ Error: Anvil is not running at http://localhost:8545"
    echo "Please start Anvil with: anvil"
    exit 1
fi

# Deploy contracts
forge script script/Deploy.s.sol:Deploy \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --legacy \
    -vvv

echo ""
echo "✅ Deployment complete!"
echo "📋 Contract addresses saved to: deployments/anvil.json"
echo ""

# Initialize contracts
echo "🔧 Initializing contracts..."
bun run script/initialize-contracts.ts

echo ""
echo "✅ Deployment and initialization complete!"
