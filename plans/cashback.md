let's implement cashback rewards for our users.

# Cashback Details:
- users will be able to claim a percentage of their trading fee as cashback once a week.
- the cashback is separate from the referral rewards.
- referral rewards will be added to the cashback. (referral logic is already implemented, but we have to update it so that we use the new cashback account)

## Cashback Formula
🌲 Wood (1X)
- Net Fee: 0.95%
- Cashback: 0.05%

🥉 Bronze (2X)
- Net Fee: 0.90%
- Cashback: 0.10%

🥈 Silver (2.5X)
- Net Fee: 0.875%
- Cashback: 0.125%

🥇 Gold (3X)
- Net Fee: 0.85%
- Cashback: 0.15%

💿 Platinum (3.5X)
- Net Fee: 0.825%
- Cashback: 0.175%

💎 Diamond (4X)
- Net Fee: 0.80%
- Cashback: 0.20%

🏆 Champion (5X)
- Net Fee: 0.75%
- Cashback: 0.25%

### Example:
- Bob trades 10 Sol fro 3,000,000 token.
- Bob's cashback tier is Gold (3X).
- Bob is referred by Alice.

Fee:
out of the total 1% trading fee which is 0.1 SOL (100_000_000 Lamports)
- 0.1 SOL * 10% = 0.01 SOL goes to Alice's CashbackAccount for her referral rewards.
- 0.1 SOL * 15% (0.15% of the total SOL traded) = 0.015 SOL goes to Bob's CashbackAccount for his cashback rewards.
- 0.1 SOL * 75% (0.7% of the total SOL traded) = 0.075 SOL goes to the protocol.

## Cashback Claim
- Users can claim their cashback rewards once a week.
- User's cashback 
- Here is the structure of the cashback claim:
```rs
#[account]
pub struct UserCashbackAccount {
    pub total_volume: u64,
    pub current_tier: u8,
    pub last_claim_timestamp: i64,  // Unix timestamp of last claim
    pub total_trading_volume: u64,  // Total trading volume earned (for stats)
    pub accumulated_cashback: u64,  // Total cashback earned (for stats)
}
```
(`claimable_cashback` is just the lamports in the UserAccount's PDA account)
- if the user did not claim their cashback for a year, the protocol will automatically claim and take the cashback.

# Context
- understand how we calculate fees in our instructions, 
  - `./programs/amm/src/instructions/ix_*.rs` && `./programs/amm/src/math/fees.rs`

# Task
- come up with a sensible and comprehensive `current_tier` formula. how much a user needs to trade to move to each tier?
- We will have to create a new logic to create and manage the PDA for UserCashbackAccount.
- if you are going to use any magic number for the tiering logic, or sth else, add them to `./programs/amm/src/constants.rs`

let's start implementing the cashback logic!

---

# Implementation Plan

## Tier Thresholds (Based on Total Volume)
- 🌲 Wood (1X): 0 SOL (default tier)
- 🥉 Bronze (2X): 100 SOL total volume
- 🥈 Silver (2.5X): 500 SOL total volume
- 🥇 Gold (3X): 2,500 SOL total volume
- 💿 Platinum (3.5X): 10,000 SOL total volume
- 💎 Diamond (4X): 50,000 SOL total volume
- 🏆 Champion (5X): 250,000 SOL total volume

## Account Structure
```rust
#[account]
pub struct UserCashbackAccount {
    pub owner: Pubkey,              // User's wallet address
    pub total_volume: u64,          // Total trading volume (for tier calculation)
    pub current_tier: u8,           // Current cashback tier (0-6)
    pub last_claim_timestamp: i64,  // Unix timestamp of last claim
    pub accumulated_cashback: u64,  // Total cashback earned (lifetime stats)
    pub accumulated_referral: u64,  // Total referral earned (lifetime stats)
}
```

## PDA Seeds
- User Cashback Account: `[b"user-cashback", user_wallet.key().as_ref()]`

## Constants to Add
```rust
// Cashback tiers
pub const CASHBACK_TIER_WOOD: u8 = 0;
pub const CASHBACK_TIER_BRONZE: u8 = 1;
pub const CASHBACK_TIER_SILVER: u8 = 2;
pub const CASHBACK_TIER_GOLD: u8 = 3;
pub const CASHBACK_TIER_PLATINUM: u8 = 4;
pub const CASHBACK_TIER_DIAMOND: u8 = 5;
pub const CASHBACK_TIER_CHAMPION: u8 = 6;

// Volume thresholds (in lamports)
pub const TIER_BRONZE_THRESHOLD: u64 = 100 * LAMPORTS_PER_SOL;
pub const TIER_SILVER_THRESHOLD: u64 = 500 * LAMPORTS_PER_SOL;
pub const TIER_GOLD_THRESHOLD: u64 = 2_500 * LAMPORTS_PER_SOL;
pub const TIER_PLATINUM_THRESHOLD: u64 = 10_000 * LAMPORTS_PER_SOL;
pub const TIER_DIAMOND_THRESHOLD: u64 = 50_000 * LAMPORTS_PER_SOL;
pub const TIER_CHAMPION_THRESHOLD: u64 = 250_000 * LAMPORTS_PER_SOL;

// Cashback percentages (in basis points out of 100)
pub const CASHBACK_WOOD_BPS: u64 = 5;      // 0.05% = 5% of fee
pub const CASHBACK_BRONZE_BPS: u64 = 10;   // 0.10% = 10% of fee
pub const CASHBACK_SILVER_BPS: u64 = 12;   // 0.125% = 12.5% of fee
pub const CASHBACK_GOLD_BPS: u64 = 15;     // 0.15% = 15% of fee
pub const CASHBACK_PLATINUM_BPS: u64 = 17; // 0.175% = 17.5% of fee
pub const CASHBACK_DIAMOND_BPS: u64 = 20;  // 0.20% = 20% of fee
pub const CASHBACK_CHAMPION_BPS: u64 = 25; // 0.25% = 25% of fee

// Claim restrictions
pub const CASHBACK_CLAIM_COOLDOWN: i64 = 7 * 24 * 60 * 60; // 7 days in seconds
pub const CASHBACK_INACTIVE_PERIOD: i64 = 365 * 24 * 60 * 60; // 365 days in seconds
```

## Fee Distribution Update
```rust
pub struct FeeBreakdownWithCashback {
    pub protocol_fee: u64,      // Total fee (1%)
    pub referral_fee: u64,      // Goes to referrer's cashback account
    pub cashback_fee: u64,      // Goes to trader's cashback account
    pub net_protocol_fee: u64,  // Goes to protocol
    pub net_amount: u64,        // Goes to bonding curve
}
```

## Example Fee Calculation (Gold Tier with Referrer)
- Trade: 10 SOL
- Total Fee: 0.1 SOL (1%)
- Referral: 0.01 SOL (10% of fee) → Referrer's cashback account
- Cashback: 0.015 SOL (15% of fee) → Trader's cashback account
- Protocol: 0.075 SOL (75% of fee) → Protocol fee recipient

## Implementation Steps

1. **Create cashback state and constants** 
   - Add UserCashbackAccount to states/mod.rs
   - Add all constants to constants.rs
   - Add PDA seed constant

2. **Update fee calculation**
   - Extend FeeCalculator with cashback tier logic
   - Create get_cashback_tier(volume) function
   - Update calculate_all_fees to include cashback[ix_buy.rs](../programs/amm/src/instructions/ix_buy.rs)

3. **Create initialize_cashback_account instruction**
   - Auto-initialize on first trade if needed
   - Set owner and initial values

4. **Update buy/sell instructions**
   - Add user and referrer cashback accounts
   - Initialize cashback account if needed
   - Calculate fees with cashback
   - Transfer fees to respective cashback PDAs
   - Update user's total volume and tier

5. **Create claim_cashback instruction**
   - Verify 7-day cooldown
   - Transfer SOL from PDA to user
   - Update last_claim_timestamp
   - Track accumulated stats

6. **Create reclaim_inactive_cashback instruction**
   - Admin only
   - Check 365-day inactivity
   - Transfer to protocol fee recipient

## Security Considerations
- PDAs hold the cashback/referral funds
- Only account owner can claim their cashback
- 7-day cooldown prevents claim spamming
- Tier updates happen automatically on trades
- Protocol can reclaim truly inactive accounts (365+ days)