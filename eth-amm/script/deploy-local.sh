#!/usr/bin/env bash

set -e

# Check if Anvil is running
if ! curl -s http://localhost:8545 > /dev/null; then
    echo "❌ Error: Anvil is not running at http://localhost:8545"
    echo "Please start Anvil with: anvil"
    exit 1
fi

# Deploy contracts
forge script script/DeployPump.s.sol:Deploy \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --legacy \
    -vvv

echo ""
echo "✅ Deployment complete!"
echo "📋 Contract addresses saved to: deployments/anvil.json"
echo ""

# Initialize contracts
echo "🔧 Generate types..."
bun run script/generate-types.ts
echo "✅ Types generated!"
