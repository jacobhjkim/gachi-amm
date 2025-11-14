#!/usr/bin/env bash

set -e

# Store Anvil PID for cleanup
ANVIL_PID=""

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    if [ ! -z "$ANVIL_PID" ]; then
        echo "Stopping Anvil (PID: $ANVIL_PID)..."
        kill $ANVIL_PID 2>/dev/null || true
        wait $ANVIL_PID 2>/dev/null || true
    fi
    echo "✅ Cleanup complete!"
    exit 0
}

# Set up trap to cleanup on exit (Ctrl+C, script exit, etc.)
trap cleanup SIGINT SIGTERM EXIT

# Kill any existing Anvil process on port 8545
echo "🔍 Checking for existing Anvil process..."
if lsof -ti:8545 >/dev/null 2>&1; then
    echo "Found existing process on port 8545, killing it..."
    lsof -ti:8545 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Start Anvil in the background
echo "🚀 Starting Anvil..."
anvil > /dev/null 2>&1 &
ANVIL_PID=$!
echo "Anvil started (PID: $ANVIL_PID)"

# Wait for Anvil to be ready
echo "⏳ Waiting for Anvil to be ready..."
for i in {1..30}; do
    if curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 > /dev/null 2>&1; then
        echo "✅ Anvil is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Error: Anvil failed to start after 30 seconds"
        exit 1
    fi
    sleep 1
done

echo ""
echo "🚀 Starting deployment..."
echo ""

# Step 1: Deploy Uniswap V3 Factory (requires solc 0.7.6)
echo "📦 [1/2] Deploying Uniswap V3 Factory..."
FOUNDRY_PROFILE=0_7_6 forge script lib-0_7_6/DeployUniswapV3.s.sol:DeployUniswapV3 \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --legacy \
    -vvv

# Extract Uniswap V3 Factory address from deployment JSON
UNISWAP_V3_FACTORY=$(cat deployments/uniswap-v3-anvil.json | grep -o '"UniswapV3Factory": "[^"]*' | grep -o '[^"]*$')
echo "✅ UniswapV3Factory deployed at: $UNISWAP_V3_FACTORY"
echo ""

# Step 2: Deploy Pump contracts (uses solc 0.8.30)
echo "📦 [2/2] Deploying Pump contracts..."
UNISWAP_V3_FACTORY=$UNISWAP_V3_FACTORY forge script contracts/DeployPump.s.sol:Deploy \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --legacy \
    -vvv

echo ""
echo "✅ Deployment complete!"
echo "📋 Contract addresses saved to: deployments/anvil.json"
echo ""

# Generate types
echo "🔧 Generating types..."
bun run script/generate-types.ts
echo "✅ Types generated!"
echo ""

# Keep running until interrupted
echo "🎉 Local development environment is ready!"
echo "📡 Anvil is running on http://localhost:8545"
echo ""
echo "Press Ctrl+C to stop Anvil and exit..."
echo ""

# Wait indefinitely until interrupted
wait $ANVIL_PID
