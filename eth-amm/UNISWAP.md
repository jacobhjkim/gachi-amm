# Uniswap V3 Integration

## Critical Issue: POOL_INIT_CODE_HASH Mismatch

### Problem
When integrating Uniswap V3 for local development with Anvil/Foundry, swaps through the SwapRouter would fail with silent reverts, even though:
- Pools were created successfully
- Pools had liquidity
- Direct pool queries worked
- Token approvals were in place

### Root Cause
The `POOL_INIT_CODE_HASH` constant in `lib-0_7_6/v3-periphery/contracts/libraries/PoolAddress.sol` was hardcoded to the mainnet value:

```solidity
bytes32 internal constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;
```

This hash is the keccak256 of the UniswapV3Pool contract's creation bytecode. When deploying locally with Foundry/Solc 0.7.6, the bytecode differs slightly from mainnet (due to compiler optimizations, settings, or other factors), producing a different hash.

### Why This Causes Swap Failures
The SwapRouter uses `PoolAddress.computeAddress()` to verify that callbacks are coming from legitimate Uniswap pools:

1. User calls `SwapRouter.exactInputSingle()`
2. SwapRouter calls `pool.swap()`
3. Pool executes swap and calls back `SwapRouter.uniswapV3SwapCallback()`
4. SwapRouter computes the expected pool address using `PoolAddress.computeAddress()` with the hardcoded hash
5. SwapRouter verifies `msg.sender == computedPoolAddress`
6. **If the hash is wrong, the computed address won't match the actual pool, and the callback is rejected**

From `lib-0_7_6/v3-periphery/contracts/libraries/CallbackValidation.sol:34`:
```solidity
pool = IUniswapV3Pool(PoolAddress.computeAddress(factory, poolKey));
require(msg.sender == address(pool)); // <- This fails with wrong hash
```

### Solution
Calculate the correct hash for your local deployment and update the constant.

#### Step 1: Calculate the Correct Hash
Create a script to compute the hash from your deployed bytecode:

```solidity
// lib-0_7_6/ComputePoolHash.s.sol
pragma solidity =0.7.6;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "./v3-core/contracts/UniswapV3Pool.sol";

contract ComputePoolHash is Script {
    function run() external view {
        bytes32 poolInitCodeHash = keccak256(abi.encodePacked(type(UniswapV3Pool).creationCode));
        console.log("POOL_INIT_CODE_HASH:");
        console.logBytes32(poolInitCodeHash);
    }
}
```

Run it:
```bash
env FOUNDRY_PROFILE=0_7_6 forge script lib-0_7_6/ComputePoolHash.s.sol:ComputePoolHash --sig "run()()"
```

#### Step 2: Update the Hash
For our local Anvil deployment, the correct hash is:
```
0x0e6a8b0dd571f8dbe4230798f099ca024c362242c77b1ba00c9b008ef9e612a2
```

Update `lib-0_7_6/v3-periphery/contracts/libraries/PoolAddress.sol:6`:
```solidity
bytes32 internal constant POOL_INIT_CODE_HASH = 0x0e6a8b0dd571f8dbe4230798f099ca024c362242c77b1ba00c9b008ef9e612a2;
```

#### Step 3: Redeploy
```bash
./script/deploy-local.sh
```

### Important Notes

1. **Mainnet vs Local**: Do NOT use this modified hash for mainnet deployments. The mainnet hash is different and should remain `0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54`.

2. **Compiler Settings**: Any change to compiler settings, optimizations, or the UniswapV3Pool contract code will result in a different hash.

3. **Testing**: Always verify swaps work after deployment:
   ```bash
   bun test ./test/integration/migration.test.ts
   ```

4. **Alternative Approach**: For production, consider using the official Uniswap V3 deployments on test networks instead of local deployments, as they have the correct hash already.

### References
- [Uniswap V3 Issue #348: Hardcoded POOL_INIT_CODE_HASH is unexpected value](https://github.com/Uniswap/v3-periphery/issues/348)
- [Stack Exchange: Uniswap V3 Pool_Init_Hash calculations](https://ethereum.stackexchange.com/questions/154591/uniswap-v3-pool-init-hash-calculations)
- [Uniswap Docs: Local Development](https://docs.uniswap.org/sdk/v3/guides/local-development)

## Migration Process

Our PumpCurve contracts integrate with Uniswap V3 for liquidity migration after graduation:

1. **Graduation**: When a bonding curve reaches the graduation threshold, it calls `token.graduate()` to enable free transfers
2. **Migration**: Anyone can call `curve.migrate()` to:
   - Create a Uniswap V3 pool with 1% fee (10000 basis points)
   - Initialize the pool with the current price
   - Add full-range liquidity (ticks -887200 to 887200)
   - Mint the LP position to `address(0)` to permanently lock it
   - Collect 5% migration fee

3. **Trading**: After migration, users can trade on Uniswap V3 using the standard SwapRouter interface

### Key Configuration
- **Fee Tier**: 10000 (1%)
- **Tick Spacing**: 200
- **Liquidity Range**: Full range (-887200 to 887200)
- **Migration Fee**: 5% of quote tokens (USDC)
