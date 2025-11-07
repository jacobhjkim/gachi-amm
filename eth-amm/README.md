# Kimchi.fun - Ethereum AMM

**Solidity implementation of the Kimchi.fun token launchpad for Optimism L2**

Kimchi.fun is a token launchpad that allows users to create and trade tokens with a bonding curve mechanism, automatically graduating successful tokens to Uniswap V3 when they reach sufficient liquidity.

This is the Ethereum/Optimism port of the original Solana-based Kimchi.fun protocol.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Core Components](#core-components)
- [How It Works](#how-it-works)
- [Fee Structure](#fee-structure)
- [Configuration](#configuration)
- [Security Features](#security-features)
- [Development](#development)
- [TODOs](#todos)
- [Differences from Solana](#differences-from-solana)

---

## Overview

### Key Features

- **Token Creation**: Launch ERC20 tokens (1B supply, 6 decimals) with bonding curves using CREATE2 for deterministic addresses
- **EIP-2612 Permit**: Gasless approvals - approve and trade in a single transaction without separate approval step
- **Bonding Curve Trading**: Trade with constant product (xy=k) formula providing initial liquidity
- **Automatic Graduation**: Tokens graduate to Uniswap V3 when 80% of supply is sold (~85 ETH pooled)
- **Multi-Level Referrals**: 3-tier referral system (L1, L2, L3) with rewards
- **Cashback Rewards**: 7-tier cashback system (Wood to Champion: 0.05% - 0.25%)
- **Fee Distribution**: Protocol, creator, and referral fee splits
- **Immutable Contracts**: Simple, secure architecture without upgrade complexity

### Technology Stack

- **Solidity 0.8.24**: Smart contract language
- **Foundry**: Development framework
- **OpenZeppelin 5.5.0**: Security-audited libraries (ERC20, ERC20Permit, ReentrancyGuard, SafeERC20, Ownable)
- **EIP-2612 (Permit)**: Gasless approvals via signatures
- **CREATE2**: Deterministic token deployment
- **Optimism L2**: Deployment target for lower gas costs

---

## Architecture

### 3-Contract Modular Design

The protocol uses a simple, modular architecture with three main contracts:

```
┌─────────────────────────────────────────────────────────────┐
│                     KimchiFactory.sol                        │
│                   (Factory Contract)                         │
│                                                               │
│  • Configuration management                                  │
│  • Token factory (CREATE2 deployment)                       │
│  • Bonding curve state management                           │
│  • Curve updates (buy/sell operations)                      │
└─────────────────────────────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  KimchiAMM   │  │  KimchiToken │  │   Kimchi     │
    │     .sol     │  │     .sol     │  │  Cashback    │
    │              │  │              │  │    .sol      │
    │ • Trading    │  │ (ERC20 +     │  │              │
    │   (buy/sell) │  │  Permit)     │  │ • Account    │
    │ • Referrals  │  │              │  │   management │
    │ • Fee claims │  │ • 1B supply  │  │ • Claim      │
    │              │  │ • 6 decimals │  │   rewards    │
    │              │  │ • EIP-2612   │  │ • Tier       │
    │              │  │   gasless    │  │   updates    │
    │              │  │   approvals  │  │              │
    └──────────────┘  └──────────────┘  └──────────────┘
                             │
           ┌─────────────────┴─────────────────┐
           │                                    │
           ▼                                    ▼
    ┌──────────────┐                    ┌──────────────┐
    │   Kimchi     │                    │  Libraries   │
    │  Migration   │                    │              │
    │    .sol      │                    │ • LibBonding │
    │              │                    │   Curve      │
    │ • Uniswap V3 │                    │ • LibFee     │
    │   migration  │                    │   Calculator │
    │   (TODO)     │                    │ • LibCashback│
    └──────────────┘                    └──────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Libraries    │
                    │                 │
                    │ • LibBonding    │
                    │   Curve         │
                    │ • LibFee        │
                    │   Calculator    │
                    │ • LibCashback   │
                    └─────────────────┘
```

**Benefits:**
- **Simple**: Straightforward contract interaction, no proxy complexity
- **Modular**: Separate concerns (AMM, cashback, migration)
- **Secure**: Immutable contracts, no upgrade risks
- **Gas efficient**: Direct calls, no delegatecall overhead
- **Transparent**: Easy to audit and understand

---

## Directory Structure

```
eth-amm/
├── src/
│   ├── KimchiFactory.sol           # Factory & configuration ⭐
│   ├── KimchiAMM.sol               # Trading & referrals ⭐
│   ├── KimchiCashback.sol          # Cashback management
│   ├── KimchiMigration.sol         # Uniswap V3 migration (TODO)
│   │
│   ├── storage/
│   │   └── AppStorage.sol          # Shared types and structs
│   │
│   ├── libraries/
│   │   ├── LibBondingCurve.sol     # Bonding curve math (xy=k formula)
│   │   ├── LibFeeCalculator.sol    # Fee distribution calculations
│   │   └── LibCashback.sol         # Cashback tier logic
│   │
│   └── tokens/
│       └── KimchiToken.sol         # ERC20 + Permit (1B supply, 6 decimals)
│
├── test/                           # Foundry tests (TODO)
├── script/                         # Deployment scripts (TODO)
├── lib/                            # Dependencies (forge-std, OpenZeppelin)
└── foundry.toml                    # Foundry configuration
```

---

## Core Components

### 1. KimchiFactory.sol (Factory Contract)

**Functionality:**
- Protocol configuration (fees, thresholds, WETH address)
- Token creation with CREATE2 deployment
- Bonding curve state management
- Curve updates (called by AMM contract)

**Key Storage:**
```solidity
Config public config;                              // Global protocol config
mapping(address => BondingCurve) public curves;    // Token => bonding curve state
mapping(address => bool) public curveExists;       // Track existing curves
address public cashbackContract;                   // Cashback contract reference
address public ammContract;                        // AMM contract reference
```

**Access Control:**
- Owner (via Ownable): Can initialize config, update fees, set contracts
- AMM Contract: Can update curve reserves, graduate curves, reset fees
- Anyone: Can create tokens, view curve data

---

### 2. KimchiAMM.sol (Trading Contract)

**Functionality:**
- Bonding curve trading (buy/sell operations)
- Referral management (3-tier system)
- Fee claiming (protocol + creator)
- Integration with factory and cashback contracts

**Key Storage:**
```solidity
KimchiFactory public immutable FACTORY;            // Factory contract reference
mapping(address => address) public referrals;      // User => referrer (3 levels)
```

**Access Control:**
- Anyone: Can trade, set referrer, claim creator fees
- Fee Claimer: Can claim protocol fees

---

### 3. KimchiCashback.sol (Cashback Management)

**Functionality:**
- Cashback account creation
- Accumulate rewards (called by AMM contract)
- Claim rewards with 7-day cooldown
- Tier updates (owner only)
- Inactive cashback reclaiming (365 days)

**Key Storage:**
```solidity
mapping(address => CashbackAccount) public cashbacks;  // User => cashback data
address public ammContract;                            // Authorized AMM
address public quoteToken;                             // WETH address
```

**Access Control:**
- Owner: Can update tiers, reclaim inactive rewards
- AMM Contract: Can add cashback for users
- Anyone: Can create account, claim rewards

---

### 4. KimchiMigration.sol (Uniswap V3 Integration - TODO)

**Planned functionality:**
- Migrate completed bonding curves to Uniswap V3
- Create pools with concentrated liquidity
- Lock LP NFTs permanently

**Status:** Stub implementation, pending full Uniswap V3 integration

---

### 5. KimchiToken.sol (ERC20 + Permit)

**Functionality:**
- Standard ERC20 token with 1B supply and 6 decimals
- **EIP-2612 Permit** extension for gasless approvals
- Fixed supply minted to Factory contract on creation

**Key Features:**
```solidity
// Standard ERC20 methods
transfer(), approve(), transferFrom(), balanceOf(), etc.

// EIP-2612 Permit methods (gasless approvals)
permit(owner, spender, value, deadline, v, r, s)  // Approve via signature
nonces(owner)                                      // Get current nonce
DOMAIN_SEPARATOR()                                 // EIP-712 domain
```

**Benefits:**
- **Gasless Approvals**: Users can approve without holding ETH for gas
- **Better UX**: Combine approval + trade in single transaction
- **Meta-transactions**: Enable relayer patterns
- **Standard Compatible**: Works with all EIP-2612 compatible wallets/dApps

---

### 6. Storage Layer (storage/AppStorage.sol)

**Shared data structures:**

```solidity
struct Config {
    address quoteToken;              // WETH address
    address feeClaimer;              // Protocol fee recipient
    uint8 baseTokenDecimals;         // 6 decimals
    uint8 quoteTokenDecimals;        // 18 decimals
    uint16 feeBasisPoints;           // Fee rates...
    // ... more fee configuration
    uint256 migrationBaseThreshold;  // 200M tokens
    uint256 migrationQuoteThreshold; // ~115 ETH
    uint256 initialVirtualQuoteReserve;  // 30 ETH
    uint256 initialVirtualBaseReserve;   // 1.073B tokens
    bool isInitialized;
}

struct BondingCurve {
    address creator;                 // Token creator
    address baseToken;               // ERC20 token
    uint256 baseReserve;             // Actual token balance
    uint256 quoteReserve;            // Actual WETH balance
    uint256 virtualBaseReserve;      // Virtual tokens
    uint256 virtualQuoteReserve;     // Virtual WETH
    uint256 protocolFee;             // Accumulated fees
    uint256 creatorFee;              // Accumulated fees
    MigrationStatus migrationStatus;
    uint64 curveFinishTimestamp;
    address uniswapV3Pool;           // After migration
    uint256 nftTokenId;              // LP NFT
}

struct CashbackAccount {
    CashbackTier tier;               // Wood → Champion
    uint256 accumulated;             // WETH rewards
    uint64 lastClaimTimestamp;
    bool exists;
}
```

---

### 7. Bonding Curve Math (libraries/LibBondingCurve.sol)

**Constant Product Formula:** `x × y = k`

```solidity
// Buy tokens with WETH (Quote → Base)
function calculateBuy(
    uint256 virtualQuoteReserve,  // Virtual WETH
    uint256 virtualBaseReserve,   // Virtual tokens
    uint256 amountIn              // WETH input
) returns (uint256 amountOut)     // Tokens output
```

**Key Features:**
- **Decimal Scaling**: 1000x multiplier to handle 18 (WETH) vs 6 (token) decimal difference
- **Virtual Reserves**: Start with 30 ETH + 1.073B tokens for initial liquidity feel
- **Real Reserves**: Accumulate from actual trades (start: 1B tokens, 0 ETH)
- **Graduation Capping**: Limits output to leave exactly 200M tokens (20% remaining)

**Price Calculation:**
```solidity
price = virtualQuoteReserve / (virtualBaseReserve * 1000)
```

---

### 8. Fee Distribution (libraries/LibFeeCalculator.sol)

**Fee Breakdown** (from input amount):

| Fee Type | Basis Points | Percentage | Recipient |
|----------|--------------|------------|-----------|
| **Total Fee** | 1500 | 1.5% | (without referral) |
| **Total Fee (with referral)** | 1400 | 1.4% | (with 0.1% discount) |
| L1 Referral | 300 | 0.3% | Direct referrer |
| L2 Referral | 30 | 0.03% | Referrer's referrer |
| L3 Referral | 20 | 0.02% | Third-level referrer |
| Cashback | 50-250 | 0.05%-0.25% | Trader (tier-based) |
| Creator | 500 | 0.5% | Token creator |
| Protocol | Remainder | ~0.55% | Protocol (rest after distribution) |

**Fee Denominator:** 100,000 (1 bp = 0.01%)

---

## How It Works

### Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. TOKEN CREATION                                               │
│    • Deploy ERC20 with CREATE2 (deterministic address)         │
│    • Initialize bonding curve                                   │
│    • Virtual reserves: 30 ETH + 1.073B tokens                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. TRADING PHASE (PreBondingCurve)                             │
│    • Users buy/sell on bonding curve                            │
│    • Price increases as supply decreases                        │
│    • Fees distributed: referrals, cashback, creator, protocol  │
│    • Real reserves accumulate: tokens ↓, ETH ↑                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. GRADUATION TRIGGER (when ≤200M tokens remain)                │
│    • Status changes to PostBondingCurve                         │
│    • Trading stops on bonding curve                             │
│    • ~85 ETH pooled + 200M tokens remaining                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. MIGRATION TO UNISWAP V3 (TODO)                              │
│    • Create Uniswap V3 pool                                     │
│    • Add liquidity with graduated reserves                      │
│    • Lock LP NFT permanently                                    │
│    • Status: CreatedPool                                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. LIVE ON UNISWAP V3                                           │
│    • Token trades on real DEX with full liquidity              │
│    • No more bonding curve                                      │
│    • Permanent liquidity (LP NFT locked)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Example Trade Flow

**User buys 1 ETH worth of tokens:**

1. **Option A - Traditional**: User approves WETH, then calls `buyTokens(tokenAddress, 1 ether, minOut)` on KimchiAMM
2. **Option B - Gasless Permit**: User signs permit message off-chain, then calls `permitAndBuy()` in single transaction
3. User's WETH is transferred to KimchiAMM
3. **Fee calculation:**
   - Has L1 referrer: Total fee = 1.4% (with 0.1% discount)
   - Fees: L1 (0.3%) + Creator (0.5%) + Cashback (0.05%) + Protocol (0.55%)
   - Net amount for swap: 0.986 ETH
4. **Bonding curve calculation:**
   - `k = virtualQuote × virtualBase × 1000`
   - `newQuote = virtualQuote + 0.986 ETH`
   - `newBase = k / newQuote`
   - `tokensOut = (oldBase - newBase) / 1000`
5. **Check graduation:**
   - If `baseReserve - tokensOut ≤ 200M`: Cap output, mark completed
6. **Distribute fees:**
   - Transfer 0.003 ETH to L1 referrer
   - Transfer 0.005 ETH stays as creator fee (claimable later)
   - Transfer 0.0005 ETH to cashback contract (calls addCashback)
   - Keep 0.0055 ETH as protocol fee (claimable by feeClaimer)
7. **Update state:**
   - `quoteReserve += 0.986 ETH`
   - `virtualQuoteReserve += 0.986 ETH`
   - `baseReserve -= tokensOut`
   - `virtualBaseReserve -= tokensOut`
8. Transfer tokens to user
9. Emit `TokensPurchased` event

---

## Configuration

### Default Values (from `KimchiFactory.initializeConfig()`)

```solidity
// Token decimals
baseTokenDecimals = 6           // All Kimchi tokens
quoteTokenDecimals = 18         // WETH on Optimism

// Fee structure (basis points, denominator = 100,000)
feeBasisPoints = 1500           // 1.5% total
l1ReferralFeeBasisPoints = 300  // 0.3%
l2ReferralFeeBasisPoints = 30   // 0.03%
l3ReferralFeeBasisPoints = 20   // 0.02%
refereeDiscountBasisPoints = 100 // 0.1% discount
creatorFeeBasisPoints = 500     // 0.5%
migrationFeeBasisPoints = 5000  // 5%

// Migration thresholds
migrationBaseThreshold = 200_000_000_000_000      // 200M tokens
migrationQuoteThreshold = 115_005_359_056 ether / 1e9 // ~115 ETH

// Initial virtual reserves
initialVirtualQuoteReserve = 30 ether             // 30 ETH
initialVirtualBaseReserve = 1_073_000_000_000_000 // 1.073B tokens
```

### Constants (from `Constants` library)

```solidity
TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000  // 1B with 6 decimals
INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000 // 793M
FEE_DENOMINATOR = 100_000
DECIMAL_SCALE = 1000  // For bonding curve math
CASHBACK_CLAIM_COOLDOWN = 7 days
CASHBACK_INACTIVE_PERIOD = 365 days
WETH_OPTIMISM = 0x4200000000000000000000000000000000000006
```

---

## Security Features

### Access Control
- **Contract Owner** (via Ownable): Can initialize config, update fees, update cashback contract
- **Admin** (Cashback): Can update cashback tiers, reclaim inactive cashback
- **Fee Claimer**: Can claim protocol fees
- **Token Creator**: Can claim their creator fees
- **AMM Contract**: Can add cashback rewards to user accounts

### Reentrancy Protection
- All state-changing functions use OpenZeppelin's `ReentrancyGuard`
- Follows Checks-Effects-Interactions pattern

### Safe Transfers
- All token transfers use OpenZeppelin's `SafeERC20`
- Prevents issues with non-standard ERC20 implementations

### Input Validation
- Non-zero amount checks
- Address validation (not zero address)
- Slippage protection (minAmountOut)
- Curve existence checks
- Migration status checks

### Overflow Protection
- Solidity 0.8+ built-in overflow/underflow protection
- No need for SafeMath library

### Fee Validation
- Config initialization validates fee structure
- Ensures distributed fees don't exceed total fee
- Validates referral hierarchy (L1 > L2 > L3)
- Creator fee capped at 1%

### Immutability
- No proxy pattern = no upgrade risks
- Code is what you see, forever
- Simpler security model

---

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Solidity 0.8.24+
- Git

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd amm/eth-amm

# Install dependencies
forge install

# Build contracts
forge build
```

### Build

```bash
forge build
```

**Configuration** (see `foundry.toml`):
- Optimizer enabled (200 runs)
- Via IR compilation (required for complex contracts)
- OpenZeppelin remappings configured

### Test

```bash
# Run all tests
forge test

# Run with verbosity
forge test -vvv

# Run specific test
forge test --match-test testBondingCurve

# Gas report
forge test --gas-report
```

### Format

```bash
forge fmt
```

### Coverage

```bash
forge coverage
```

### Deploy (TODO: Create deployment script)

```bash
# 1. Deploy KimchiFactory
# 2. Deploy KimchiAMM (with factory address)
# 3. Deploy KimchiCashback (with WETH address)
# 4. Deploy KimchiMigration (optional)
# 5. Initialize KimchiFactory config (feeClaimer, WETH)
# 6. Set cashback contract on KimchiFactory
# 7. Set AMM contract on KimchiFactory
# 8. Set AMM contract on KimchiCashback
# 9. (Optional) Set AMM contract on KimchiMigration
# 10. Verify all contracts on Etherscan
```

---

## TODOs

### High Priority

- [ ] **Complete Uniswap V3 Integration** (`KimchiMigration.sol`)
  - Install `@uniswap/v3-core` and `@uniswap/v3-periphery`
  - Implement pool creation via `IUniswapV3Factory`
  - Add liquidity via `INonfungiblePositionManager.mint()`
  - Calculate tick ranges for concentrated liquidity
  - Lock LP NFT permanently (transfer to 0xdead)
  - Test price continuity from bonding curve to Uniswap

- [ ] **Write Comprehensive Tests**
  - `BondingCurveMath.t.sol`: Test xy=k formula accuracy
  - `KimchiFactory.t.sol`: Token creation, CREATE2 deployment, config management
  - `KimchiAMM.t.sol`: Buy/sell operations, graduation, referrals
  - `KimchiToken.t.sol`: ERC20Permit functionality, signature verification
  - `FeeCalculator.t.sol`: Fee distribution with referrals
  - `KimchiCashback.t.sol`: Claiming, cooldowns, tier updates
  - `KimchiMigration.t.sol`: Uniswap V3 graduation flow
  - `Integration.t.sol`: End-to-end token lifecycle

- [ ] **Create Deployment Script** (`script/Deploy.s.sol`)
  - Deploy all four contracts (Factory, AMM, Cashback, Migration)
  - Initialize Factory configuration
  - Link contracts together
  - Verify on Etherscan

### Medium Priority

- [ ] **Emergency Functions**
  - Pause/unpause trading (circuit breaker)
  - Emergency withdrawal (admin only)
  - Rate limiting for large trades

- [ ] **Gas Optimizations**
  - Pack storage variables efficiently
  - Optimize loops and calculations
  - Consider using `calldata` more
  - Batch operations where possible

- [ ] **Events and Monitoring**
  - Add more granular events
  - Index important parameters
  - Create subgraph for indexing
  - Set up monitoring/alerts

### Low Priority

- [ ] **Additional Features**
  - Token metadata (logo, description, links)
  - Trading volume tracking
  - Leaderboards
  - Token burning mechanism
  - Whitelist for token creation

- [ ] **Documentation**
  - NatSpec comments for all functions
  - Architecture diagrams
  - Integration guide
  - Frontend integration examples

- [ ] **Security**
  - Professional audit (Trail of Bits, OpenZeppelin, etc.)
  - Formal verification for critical math
  - Bug bounty program
  - Testnet deployment and testing

---

## Differences from Solana

This Ethereum implementation maintains the same economic model and logic as the Solana version but adapts to the EVM environment:

### Architectural Changes

| Aspect | Solana | Ethereum |
|--------|--------|----------|
| **Account Model** | Accounts with rent | Contract storage |
| **Program Structure** | Single program with instructions | 4 modular contracts |
| **Token Standard** | SPL Token / Token2022 | ERC20 + EIP-2612 Permit |
| **Upgradeability** | Program upgrade authority | Immutable (no upgrades) |
| **PDAs** | Program Derived Addresses | CREATE2 + salt |
| **Cross-Program Invocations** | CPI to SPL Token, Metaplex, Meteora | ERC20 transfers, Uniswap V3 calls |

### Technical Adaptations

1. **Storage:**
   - Solana: Account data with `zero_copy` serialization
   - Ethereum: Struct-based storage with mappings

2. **Token Deployment:**
   - Solana: SPL Token mint creation with PDAs
   - Ethereum: CREATE2 for deterministic ERC20 deployment

3. **Graduation Target:**
   - Solana: Meteora DAMM v2 pool
   - Ethereum: Uniswap V3 concentrated liquidity

4. **Math Precision:**
   - Solana: u64/u128 with overflow checks
   - Ethereum: uint256 with built-in overflow protection

5. **Gas vs Compute:**
   - Solana: Compute unit limits
   - Ethereum: Gas optimization (via-IR, optimizer)

### Economic Model (Identical)

✅ Same bonding curve formula (xy=k)
✅ Same fee structure (1.5% total)
✅ Same referral tiers (L1, L2, L3)
✅ Same cashback tiers (Wood → Champion)
✅ Same graduation threshold (80% sold)
✅ Same migration fee (5%)
✅ Same initial reserves (30 quote + 1.073B base)
✅ Same token supply (1B with 6 decimals)

---

## License

MIT

---

## Resources

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Uniswap V3 Documentation](https://docs.uniswap.org/contracts/v3/overview)
- [Optimism Documentation](https://docs.optimism.io/)
- [CREATE2 Specification](https://eips.ethereum.org/EIPS/eip-1014)
- [EIP-2612: Permit Extension](https://eips.ethereum.org/EIPS/eip-2612)

---

**Built with ❤️ for the Kimchi.fun community**
