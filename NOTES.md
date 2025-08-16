# Anchor

## `has_one` Constraints
- has_one = base_vault: Verifies that the base_vault field stored in the pool account matches the base_vault account passed in the instruction
- has_one = quote_vault: Verifies that the quote_vault field stored in the pool account matches the quote_vault account passed in the instruction
- has_one = config: Verifies that the config field stored in the pool account matches the config account passed in the instruction

## `Box`

The Box<> wrapper is used for memory optimization in Anchor. Here's why:

1. Stack size limits: Solana programs have a limited stack size (4KB). Account structs can be large, especially InterfaceAccount and TokenAccount types.
2. Heap allocation: Box<> moves the account data from the stack to the heap, preventing stack overflow errors.
3. Common pattern: You'll see Box<> used on larger account types like:
   - Box<InterfaceAccount<'info, TokenAccount>> (lines 46, 48, 54, 57)
   - Box<InterfaceAccount<'info, Mint>> (lines 61, 63)
4. Not needed for smaller types: Notice that AccountLoader types (lines 38, 42) and Signer (line 67) aren't boxed because they're smaller.

Without Box<>, you might encounter errors like:
Error: Function _ZN108_$LT$instruction..SwapCtx$u20$as$u20$anchor_lang..Accounts$LT$$u27$info$GT$$GT$9try_accounts
Stack offset of -5584 exceeded max offset of -4096 by 1488 bytes

This is a standard Anchor pattern for managing memory efficiently in Solana programs.

## Rate Limiting
The rate limiter is an anti-sniper mechanism that progressively increases fees based on the amount traded. Here's why it's necessary and how it works:

Purpose

1. Prevents snipers from buying large amounts immediately after token launch
2. Protects regular users by making it expensive for bots to accumulate tokens early
3. Only applies to buy transactions (QuoteToBase direction) when fees are collected in quote tokens

How It Works

The rate limiter uses a tiered fee structure:

1. Below reference amount: Standard cliff fee applies
   - If input_amount ≤ reference_amount, fee = cliff_fee_numerator
2. Above reference amount: Fees increase progressively
   - The amount above reference is divided into chunks of reference_amount
   - Each chunk has incrementally higher fees: cliff_fee + (chunk_index * fee_increment)
   - After reaching max fee (99%), all remaining amount is charged at max rate

Example

If configured with:
- reference_amount = 1 SOL
- cliff_fee = 1%
- fee_increment = 0.5%
- max_duration = 300 slots

Then:
- Buying 0.5 SOL → 1% fee
- Buying 1.5 SOL → 1% on first SOL + 1.5% on 0.5 SOL
- Buying 3 SOL → 1% + 1.5% + 2% (progressively higher)

## Snipers
Short-term Benefits of Snipers

1. Immediate volume & fees: Snipers generate substantial trading volume and fee revenue in the first minutes
2. Price discovery: They quickly establish market price through aggressive buying
3. Marketing metrics: High launch volume attracts attention and new projects
4. Liquidity provision: They do add liquidity to the pool initially

Long-term Costs of Snipers

1. Community destruction: Regular users get priced out, killing community formation - the lifeblood of memecoins
2. Pump & dump cycles: Snipers typically dump within hours/days, creating negative price action
3. Platform reputation: Becomes known as "sniper paradise" which deters legitimate projects and users
4. Token concentration: 80%+ supply in few wallets leads to manipulation and project death

Business Case Against Snipers

Successful platforms like Pump.fun chose anti-sniper measures because:

1. Memecoins live or die by community - without fair distribution, projects fail
2. Repeat customers: Fair launches encourage creators to launch more tokens
3. Network effects: Happy communities bring more users than high-volume ghost towns
4. Sustainable revenue: Many small trades from community > one-time sniper fees

The rate limiter is ultimately good for business because it prioritizes sustainable growth and community building over short-term volume metrics. Dead projects don't generate
ongoing fees.

# Jup config
- virtual pool: https://solscan.io/account/C6B1JbjLU3KaqrRc4x4Pz4eRiC8RV5fQQMUjYBaz6UHW#anchorData
- pool config: https://solscan.io/account/3RaNm911gBm7FLzz4tbpdPCrzEbS1tVgG9jDbYGkCPyR#anchorData
- virtual pool 2: https://solscan.io/account/ChfSgwNmJTffQdLNAyhVcfPsjpjgPgzm1bTTFqCJychg
- pool config 2: https://solscan.io/account/BwKuSMwRDMae3sampFXSvJ55W6LM8H6gss1wChs2tCXS#anchorData
```json
{
    "quote_mint": {
        "type": "pubkey",
        "data": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    },
    "fee_claimer": {
        "type": "pubkey",
        "data": "CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz"
    },
    "leftover_receiver": {
        "type": "pubkey",
        "data": "CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz"
    },
    "pool_fees": {
        "type": {
            "defined": {
                "name": "PoolFeesConfig"
            }
        },
        "data": {
            "base_fee": {
                "type": {
                    "defined": {
                        "name": "BaseFeeConfig"
                    }
                },
                "data": {
                    "cliff_fee_numerator": "10000000",
                    "second_factor": "0",
                    "third_factor": "0",
                    "first_factor": 0,
                    "base_fee_mode": 0,
                    "padding_0": [
                        0,
                        0,
                        0,
                        0,
                        0
                    ]
                }
            },
            "dynamic_fee": {
                "type": {
                    "defined": {
                        "name": "DynamicFeeConfig"
                    }
                },
                "data": {
                    "initialized": 0,
                    "padding": [
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "max_volatility_accumulator": 0,
                    "variable_fee_control": 0,
                    "bin_step": 0,
                    "filter_period": 0,
                    "decay_period": 0,
                    "reduction_factor": 0,
                    "padding2": [
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "bin_step_u128": "0"
                }
            },
            "padding_0": {
                "type": {
                    "array": [
                        "u64",
                        5
                    ]
                },
                "data": [
                    "0",
                    "0",
                    "0",
                    "0",
                    "0"
                ]
            },
            "padding_1": {
                "type": {
                    "array": [
                        "u8",
                        6
                    ]
                },
                "data": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ]
            },
            "protocol_fee_percent": {
                "type": "u8",
                "data": 20
            },
            "referral_fee_percent": {
                "type": "u8",
                "data": 20
            }
        }
    },
    "collect_fee_mode": {
        "type": "u8",
        "data": 0
    },
    "migration_option": {
        "type": "u8",
        "data": 1
    },
    "activation_type": {
        "type": "u8",
        "data": 0
    },
    "token_decimal": {
        "type": "u8",
        "data": 6
    },
    "version": {
        "type": "u8",
        "data": 0
    },
    "token_type": {
        "type": "u8",
        "data": 0
    },
    "quote_token_flag": {
        "type": "u8",
        "data": 0
    },
    "partner_locked_lp_percentage": {
        "type": "u8",
        "data": 0
    },
    "partner_lp_percentage": {
        "type": "u8",
        "data": 100
    },
    "creator_locked_lp_percentage": {
        "type": "u8",
        "data": 0
    },
    "creator_lp_percentage": {
        "type": "u8",
        "data": 0
    },
    "migration_fee_option": {
        "type": "u8",
        "data": 2
    },
    "fixed_token_supply_flag": {
        "type": "u8",
        "data": 1
    },
    "creator_trading_fee_percentage": {
        "type": "u8",
        "data": 50
    },
    "token_update_authority": {
        "type": "u8",
        "data": 1
    },
    "migration_fee_percentage": {
        "type": "u8",
        "data": 0
    },
    "creator_migration_fee_percentage": {
        "type": "u8",
        "data": 0
    },
    "_padding_1": {
        "type": {
            "array": [
                "u8",
                7
            ]
        },
        "data": [
            0,
            0,
            0,
            0,
            0,
            0,
            0
        ]
    },
    "swap_base_amount": {
        "type": "u64",
        "data": "537389607260190"
    },
    "migration_quote_threshold": {
        "type": "u64",
        "data": "17594894789"
    },
    "migration_base_threshold": {
        "type": "u64",
        "data": "262610377454612"
    },
    "migration_sqrt_price": {
        "type": "u128",
        "data": "150993107735760167"
    },
    "locked_vesting_config": {
        "type": {
            "defined": {
                "name": "LockedVestingConfig"
            }
        },
        "data": {
            "amount_per_period": {
                "type": "u64",
                "data": "1000000"
            },
            "cliff_duration_from_migration_time": {
                "type": "u64",
                "data": "0"
            },
            "frequency": {
                "type": "u64",
                "data": "1"
            },
            "number_of_period": {
                "type": "u64",
                "data": "1"
            },
            "cliff_unlock_amount": {
                "type": "u64",
                "data": "199999999000000"
            },
            "_padding": {
                "type": "u64",
                "data": "0"
            }
        }
    },
    "pre_migration_token_supply": {
        "type": "u64",
        "data": "1000000000000000"
    },
    "post_migration_token_supply": {
        "type": "u64",
        "data": "1000000000000000"
    },
    "_padding_2": {
        "type": {
            "array": [
                "u128",
                2
            ]
        },
        "data": [
            "0",
            "0"
        ]
    },
    "sqrt_start_price": {
        "type": "u128",
        "data": "73786979413030680"
    },
    "curve": {
        "type": {
            "array": [
                {
                    "defined": {
                        "name": "LiquidityDistributionConfig"
                    }
                },
                20
            ]
        },
        "data": [
            {
                "sqrt_price": "150993107735760167",
                "liquidity": "77548668410084807934696855687386"
            },
            {
                "sqrt_price": "79226673521066979257578248091",
                "liquidity": "2307959548380824427284126"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            }
        ]
    }
}
```

- USDC virtual pool: https://solscan.io/account/13PnULoAftcAnD583ELJ5AzciXX1n9sdHtwqqWvJLgpW#anchorData
- USDC pool config: https://solscan.io/account/ECF6sGqjMmqkkUtBfQVcuqJsLeByaydqsLvHLo6nCcPx
```json
{
    "quote_mint": {
        "type": "pubkey",
        "data": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    },
    "fee_claimer": {
        "type": "pubkey",
        "data": "CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz"
    },
    "leftover_receiver": {
        "type": "pubkey",
        "data": "CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz"
    },
    "pool_fees": {
        "type": {
            "defined": {
                "name": "PoolFeesConfig"
            }
        },
        "data": {
            "base_fee": {
                "type": {
                    "defined": {
                        "name": "BaseFeeConfig"
                    }
                },
                "data": {
                    "cliff_fee_numerator": "990000000",
                    "second_factor": "11",
                    "third_factor": "98000000",
                    "first_factor": 10,
                    "base_fee_mode": 0,
                    "padding_0": [
                        0,
                        0,
                        0,
                        0,
                        0
                    ]
                }
            },
            "dynamic_fee": {
                "type": {
                    "defined": {
                        "name": "DynamicFeeConfig"
                    }
                },
                "data": {
                    "initialized": 0,
                    "padding": [
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "max_volatility_accumulator": 0,
                    "variable_fee_control": 0,
                    "bin_step": 0,
                    "filter_period": 0,
                    "decay_period": 0,
                    "reduction_factor": 0,
                    "padding2": [
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "bin_step_u128": "0"
                }
            },
            "padding_0": {
                "type": {
                    "array": [
                        "u64",
                        5
                    ]
                },
                "data": [
                    "0",
                    "0",
                    "0",
                    "0",
                    "0"
                ]
            },
            "padding_1": {
                "type": {
                    "array": [
                        "u8",
                        6
                    ]
                },
                "data": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ]
            },
            "protocol_fee_percent": {
                "type": "u8",
                "data": 20
            },
            "referral_fee_percent": {
                "type": "u8",
                "data": 20
            }
        }
    },
    "collect_fee_mode": {
        "type": "u8",
        "data": 0
    },
    "migration_option": {
        "type": "u8",
        "data": 1
    },
    "activation_type": {
        "type": "u8",
        "data": 0
    },
    "token_decimal": {
        "type": "u8",
        "data": 6
    },
    "version": {
        "type": "u8",
        "data": 0
    },
    "token_type": {
        "type": "u8",
        "data": 0
    },
    "quote_token_flag": {
        "type": "u8",
        "data": 0
    },
    "partner_locked_lp_percentage": {
        "type": "u8",
        "data": 0
    },
    "partner_lp_percentage": {
        "type": "u8",
        "data": 100
    },
    "creator_locked_lp_percentage": {
        "type": "u8",
        "data": 0
    },
    "creator_lp_percentage": {
        "type": "u8",
        "data": 0
    },
    "migration_fee_option": {
        "type": "u8",
        "data": 2
    },
    "fixed_token_supply_flag": {
        "type": "u8",
        "data": 1
    },
    "creator_trading_fee_percentage": {
        "type": "u8",
        "data": 50
    },
    "token_update_authority": {
        "type": "u8",
        "data": 1
    },
    "migration_fee_percentage": {
        "type": "u8",
        "data": 0
    },
    "creator_migration_fee_percentage": {
        "type": "u8",
        "data": 0
    },
    "_padding_1": {
        "type": {
            "array": [
                "u8",
                7
            ]
        },
        "data": [
            0,
            0,
            0,
            0,
            0,
            0,
            0
        ]
    },
    "swap_base_amount": {
        "type": "u64",
        "data": "144165095656500"
    },
    "migration_quote_threshold": {
        "type": "u64",
        "data": "27917451131"
    },
    "migration_base_threshold": {
        "type": "u64",
        "data": "55834902843102"
    },
    "migration_sqrt_price": {
        "type": "u128",
        "data": "412481737123559485"
    },
    "locked_vesting_config": {
        "type": {
            "defined": {
                "name": "LockedVestingConfig"
            }
        },
        "data": {
            "amount_per_period": {
                "type": "u64",
                "data": "1000000"
            },
            "cliff_duration_from_migration_time": {
                "type": "u64",
                "data": "0"
            },
            "frequency": {
                "type": "u64",
                "data": "1"
            },
            "number_of_period": {
                "type": "u64",
                "data": "1"
            },
            "cliff_unlock_amount": {
                "type": "u64",
                "data": "799999999000000"
            },
            "_padding": {
                "type": "u64",
                "data": "0"
            }
        }
    },
    "pre_migration_token_supply": {
        "type": "u64",
        "data": "1000000000000000"
    },
    "post_migration_token_supply": {
        "type": "u64",
        "data": "1000000000000000"
    },
    "_padding_2": {
        "type": {
            "array": [
                "u128",
                2
            ]
        },
        "data": [
            "0",
            "0"
        ]
    },
    "sqrt_start_price": {
        "type": "u128",
        "data": "159753492149232763"
    },
    "curve": {
        "type": {
            "array": [
                {
                    "defined": {
                        "name": "LiquidityDistributionConfig"
                    }
                },
                20
            ]
        },
        "data": [
            {
                "sqrt_price": "412481737123559485",
                "liquidity": "37589056776069270764598550300222"
            },
            {
                "sqrt_price": "79226673521066979257578248091",
                "liquidity": "618886773419936544901601"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            },
            {
                "sqrt_price": "0",
                "liquidity": "0"
            }
        ]
    }
}
```

What is baseAmount?

From the data:
- swap_base_amount: 641,223,168,112,427 (in smallest units, 6 decimals)
- This is 641,223,168.112427 actual tokens reserved for swapping in the bonding curve

The baseAmount in the formula is the total amount of base tokens allocated for the bonding curve's first segment. This determines how much liquidity is needed to sell exactly that
amount of tokens between the starting price and the first curve point.

The Formula Breakdown:

// From the code:
// Δa = L * (1 / √P_lower - 1 / √P_upper)
// Rearranging: L = Δa / (1 / √P_lower - 1 / √P_upper)
// Which simplifies to: L = Δa * √P_lower * √P_upper / (√P_upper - √P_lower)

getInitialLiquidityFromDeltaBase = (baseAmount, sqrtMaxPrice, sqrtPrice) => {
let priceDelta = sqrtMaxPrice - sqrtPrice;
let prod = baseAmount * sqrtMaxPrice * sqrtPrice;
let liquidity = prod / priceDelta;
return liquidity;
}

Why the Slight Difference?

Your calculation:
91259178914854212608522704659485

Actual on-chain:
91259178914854104573442997012073

The difference is: 108035079707647412 (about 0.0000001% difference)

This tiny discrepancy is likely due to:

1. Rounding differences: The SDK might use different rounding methods when calculating the curve
2. Precision loss: JavaScript/TypeScript number handling vs Rust's u128 arithmetic
3. Intermediate calculations: The actual program might have additional steps that introduce slight variations

What This Means for the Bonding Curve:

Looking at the full config:
- First segment: From price 0.0054 to 0.0234 USDC per token
   - Uses 641M tokens (64.1% of supply)
   - Huge liquidity to keep price stable
- Second segment: From price 0.0234 to 2,500 USDC per token (!)
   - Uses 308M tokens (30.8% of supply)
   - Much lower liquidity = explosive price growth

The migration_quote_threshold of 21,305 USDC means the pool graduates to DAMM v2 after collecting that much USDC.

This creates a bonding curve where:
1. Early buyers get tokens cheaply (< $0.024)
2. Once demand picks up, price explodes toward $2,500
3. Graduation happens when ~$21k USDC is collected

---

What is "Swallowing" in DBC?

"Swallowing" refers to the pool's ability to absorb excess quote tokens (like USDC) beyond what's mathematically required by the bonding curve.

The Context:

When someone buys tokens (swaps Quote → Base):
1. The swap traverses through the curve segments
2. If the swap amount exceeds all available liquidity in the curve, there's amount_left remaining
3. Normally, this would fail - you can't buy more than what's available

The Swallow Mechanism:

pub const MAX_SWALLOW_PERCENTAGE: u8 = 20; // 20%

// Maximum extra USDC the pool can accept
max_swallow_amount = migration_quote_threshold * 20 / 100

Why Allow Swallowing?

1. Overflow Protection: Near graduation, someone might try to buy with slightly more USDC than the curve can handle
2. User Experience: Instead of rejecting the transaction, the pool accepts up to 20% extra
3. Graduation Buffer: Helps pools reach the migration threshold even with rounding errors

Example:

If migration_quote_threshold = 21,305 USDC:
- Max swallow amount = 21,305 × 20% = 4,261 USDC
- If someone tries to buy with 25,000 USDC and only 24,000 fits in the curve
- The remaining 1,000 USDC (< 4,261) gets "swallowed"
- The buyer gets all available tokens, pool keeps extra USDC

Important Notes:

1. Only for Quote → Base swaps (buying tokens)
2. Not for Base → Quote swaps (selling tokens)
3. Prevents griefing - limits how much extra can be deposited
4. Helps graduation - extra funds count toward migration threshold

This is a clever mechanism that makes the bonding curve more robust and user-friendly, especially as it approaches graduation!

---

What is safe_shl?

safe_shl is a safe left bit shift operation that prevents overflow errors. Let me explain:

Basic Bit Shifting:

- Left shift (<<): Multiplies by powers of 2
    - x << 1 = x * 2
    - x << 2 = x * 4
    - x << n = x * 2^n

The Safety Wrapper:

fn safe_shl(self, v: $offset) -> Result<$t, PoolError> {
match self.checked_shl(v) {
Some(result) => Ok(result),
None => {
// Log error location and return error
Err(PoolError::MathOverflow)
}
}
}

Why Use It in the Formula?

Looking at the code:
pub const RESOLUTION: u8 = 64;

pub fn get_next_sqrt_price_from_amount_quote_rounding_down(
sqrt_price: u128,
liquidity: u128,
amount: u64,
) -> Result<u128> {
let quotient = U256::from(amount)
.safe_shl((RESOLUTION * 2) as usize)?  // Shift left by 128 bits
.safe_div(U256::from(liquidity))?;

      let result = U256::from(sqrt_price).safe_add(quotient)?;
      Ok(result.try_into().map_err(|_| PoolError::TypeCastFailed)?)
}

The Math Behind It:

The formula is calculating: √P' = √P + Δy / L

But since we're using Q64.64 fixed-point arithmetic:
- Square root prices are stored with 64 bits of fractional precision
- sqrt_price is actually actual_sqrt_price * 2^64

So the calculation becomes:
1. amount << 128 = amount * 2^128 (shift left by 2 * RESOLUTION)
2. Divide by liquidity
3. This gives us the delta in Q64.64 format

Why Double the Resolution?

- RESOLUTION = 64 for sqrt prices
- But we need 2 * RESOLUTION = 128 because:
    - We're working with the relationship between amount and sqrt_price
    - The math requires matching the precision of squared values

Example:

If amount = 1000 USDC:
- Without shifting: 1000 / liquidity (loses precision)
- With shifting: (1000 * 2^128) / liquidity (maintains Q64.64 precision)

Benefits of Safe Operations:

1. Prevents silent overflows that could cause fund loss
2. Provides clear error messages with file locations
3. Essential for financial contracts where precision matters
4. Required by Solana - no unchecked arithmetic in production

This is a critical safety feature in DeFi protocols where mathematical errors could lead to significant financial losses!

---


The Problem with Swallowing:

1. Trader sends amount_in (e.g., 1000 USDC)
2. Pool processes through all curve segments and outputs tokens
3. If amount_left remains (e.g., 50 USDC couldn't be used):
   - The pool keeps this extra USDC
   - The trader gets NO additional tokens for it
   - It's essentially a hidden fee/loss

Why This is Problematic:

1. No Token Return: The swallowed amount doesn't buy any tokens
2. No Refund: The extra USDC stays in the pool
3. Bad UX: Trader loses money without clear warning
4. Up to 20% Loss: Could lose significant value near graduation

When This Happens:

This typically occurs when:
- The pool is near graduation (most tokens sold)
- Someone tries to buy more than available
- The curve segments are exhausted

Why Allow It?

The design choice seems to prioritize:
1. Simplicity: Avoids complex refund logic
2. Graduation Speed: Extra funds help reach migration threshold
3. MEV Protection: Prevents precise calculations for bots

Better Alternatives:

A fairer design would:
1. Refund excess: Return unused USDC to trader
2. Reject transaction: Fail if amount exceeds capacity
3. Partial fill with warning: Process what's possible, return rest
4. Clear messaging: Show maximum purchasable amount

For Kimchi.fun, you should consider:
- Option 1: Remove swallow mechanism entirely
- Option 2: Implement refunds for excess amounts
- Option 3: Add slippage protection that accounts for swallowing
- Option 4: Clearly display maximum buy amounts in UI

This is a significant issue that could damage user trust if not handled properly!

The Truth About Swallowing

Swallowing DOES harm traders, but there's a nuanced design intention:

What Actually Happens:

1. Fixed Token Supply Pools (like the example with fixed_token_supply_flag = 1):
   - Pre-migration supply: 1,000,000,000,000,000 tokens
   - Post-migration supply: Same (in this case)
   - No extra tokens are minted for swallowed amounts
2. The Buffer System:
   - SWAP_BUFFER_PERCENTAGE = 25% - Extra tokens reserved for potential overflow
   - MAX_SWALLOW_PERCENTAGE = 20% - Max extra quote tokens that can be absorbed
   - These are separate mechanisms

Why Traders Get a Bad Deal:

When swallowing occurs:
1. Trader sends extra USDC beyond curve capacity
2. Pool accepts up to 20% extra USDC
3. Trader gets NO additional tokens for the swallowed amount
4. The extra USDC counts toward migration threshold

The Design Rationale:

The comment about post_migration_token_supply is misleading. It's actually for:
1. Dynamic supply pools (when fixed_token_supply_flag = 0)
2. Burning excess tokens after migration if needed
3. NOT for compensating swallowed amounts

Why This Design Exists:

1. Simplicity: Avoids complex refund mechanisms
2. Migration Speed: Extra funds help reach graduation faster
3. Edge Case Handling: Deals with rounding errors near completion
4. User Choice: Traders can set appropriate slippage to avoid this

For Kimchi.fun:

You should consider:
1. Warning users about potential swallowing near graduation
2. Setting slippage protection that accounts for this
3. Displaying maximum purchasable amount clearly
4. Consider removing swallow mechanism for better UX

The swallowing mechanism is indeed unfair to traders - they lose funds without receiving tokens. This is a trade-off the DBC designers made for simplicity, but it's definitely not
trader-friendly!

---

Why Config is NOT a PDA

The DBC design uses a regular keypair account for the PoolConfig instead of a PDA. Here's why:

1. Flexibility in Account Creation

- Partners can pre-generate config keypairs offline
- Multiple configs can be created in parallel without conflicts
- No need to find bump seeds or worry about collision

2. Gas Efficiency

- No PDA derivation cost on every instruction
- Direct account lookup is faster than PDA derivation
- Important for high-frequency operations

3. Design Pattern

The DBC uses a hybrid approach:
- Config: Regular keypair (created once by partner)
- Pool Authority: PDA (for signing transactions)
- Virtual Pools: Regular keypairs (linked to config)

4. Security Model

#[account(
init,
signer,  // Config keypair must sign its own creation
payer = payer,
space = 8 + PoolConfig::INIT_SPACE
)]
pub config: AccountLoader<'info, PoolConfig>,

After creation:
- Config becomes immutable (mostly)
- Only specific fields can be updated by owner
- Virtual pools reference the config by its pubkey

5. Real-World Usage

Partners typically:
1. Generate a new keypair for config
2. Fund it and create the config
3. Share the config pubkey with creators
4. Creators use this config to create pools

Comparison with PDA Approach:

If it were a PDA:
#[account(
init,
seeds = [b"config", owner.key().as_ref(), some_unique_id.as_ref()],
bump,
payer = payer,
space = 8 + PoolConfig::INIT_SPACE
)]

Problems with PDA:
- Need unique seeds for each config
- More complex to manage multiple configs
- Higher computational cost
- Less flexible for partners

For Kimchi.fun:

You could choose either approach:
- Keypair (like DBC): More flexible, easier to manage
- PDA: More deterministic, easier to derive

    1. PoolConfig: Regular Keypair Account

  #[account(
  init,
  signer,  // Must be signed by the config keypair itself
  payer = payer,
  space = 8 + PoolConfig::INIT_SPACE
  )]
  pub config: AccountLoader<'info, PoolConfig>,
    - Created once by partner
    - Contains all configuration parameters
    - Not a PDA - flexible account creation

    2. VirtualPool: PDA (Program Derived Address)

  seeds = [
  b"pool",                                    // POOL_PREFIX
  config.key().as_ref(),                      // Links to specific config
  &max_key(&base_mint.key(), &quote_mint.key()), // Larger pubkey first
  &min_key(&base_mint.key(), &quote_mint.key()), // Smaller pubkey second
  ]
    - Deterministic: Same config + token pair always = same pool address
    - Canonical ordering: BASE/QUOTE and QUOTE/BASE resolve to same pool
    - One pool per config per token pair

    3. Token Vaults: PDAs

  // Base vault
  seeds = [
  b"token_vault",         // TOKEN_VAULT_PREFIX
  base_mint.key().as_ref(),
  pool.key().as_ref(),
  ]

  // Quote vault
  seeds = [
  b"token_vault",
  quote_mint.key().as_ref(),
  pool.key().as_ref(),
  ]
    - Separate vaults for base and quote tokens
    - Derived from token mint + pool

    4. Pool Authority: Constant PDA

  const POOL_AUTHORITY_AND_BUMP: ([u8; 32], u8) = ed25519::derive_program_address(
  &[b"pool_authority"],
  &crate::ID_CONST.to_bytes(),
  );
    - Single authority for ALL pools in the program
    - Pre-computed at compile time for efficiency
    - Signs all token transfers

    5. Base Mint: Regular Keypair (Creator-provided)

  #[account(
  init,
  signer,  // Creator must sign with base mint keypair
  payer = payer,
  mint::decimals = config.load()?.token_decimal,
  mint::authority = pool_authority,
  )]
  pub base_mint: Box<Account<'info, Mint>>,
    - New SPL token created during pool initialization
    - Creator provides the keypair
    - Authority transferred to pool (or creator/partner based on config)

  The Flow:

    1. Partner creates Config (keypair) with parameters
    2. Creator initializes pool providing:
    - Config reference
    - Base mint keypair (new token)
    - Quote mint (existing, like USDC)
    3. System derives:
    - Pool PDA from config + tokens
    - Vault PDAs from pool + tokens
    4. Pool uses constant pool authority for signing

  Why This Design?

    - Config flexibility: Partners can create many configs without seed management
    - Pool uniqueness: PDA ensures one pool per token pair per config
    - Discoverability: Anyone can derive pool address from inputs
    - Efficiency: Constant pool authority avoids repeated PDA derivations
    - Security: All critical accounts (pool, vaults) are PDAs

## Zero-Copy Account Alignment Issue

We encountered a transmute error with the BondingCurve struct:
```
cannot transmute between types of different sizes, or dependently-sized types [E0512]
Note: source type: `bonding_curve::BondingCurve` (2176 bits)
Note: target type: `bonding_curve::_::{closure#0}::TypeWithoutPadding` (2112 bits)
```

The issue was caused by u128 fields in zero-copy accounts. In Rust, u128 aligns to 16 bytes, but Solana aligns it to 8 bytes, causing a size mismatch.

**Solution**: We removed the `_padding_2: [u8; 8]` field from the BondingCurve struct. This reduced the struct size by 64 bits (8 bytes), from 2176 to 2112 bits, matching what Anchor expected.

The Config struct worked fine because its padding was already correctly sized for the alignment requirements.


---

What pool_authority is

The pool_authority is a Program Derived Address (PDA) that acts as the signing authority for the AMM pool. It's a special account that can sign transactions on behalf of the pool
without having a private key.

How it works

1. Pre-computed PDA: In const_pda.rs, the pool authority PDA is pre-computed at compile time using:
   const POOL_AUTHORITY_AND_BUMP: ([u8; 32], u8) = ed25519::derive_program_address(
   &[b"pool_authority"],
   &crate::ID_CONST.to_bytes(),
   );
2. The address constraint: When you see:
   #[account(address = const_pda::pool_authority::ID)]
   pub pool_authority: AccountInfo<'info>,

2. This is an Anchor constraint that validates that the account passed in has exactly the address const_pda::pool_authority::ID. It's ensuring that the correct PDA is being used.

Why it's used this way

The pool authority PDA is used to:
- Sign token transfers from pool vaults (see transfer_from_pool in token.rs)
- Mint tokens when initializing pools
- Act as the authority for pool-owned token accounts

When the program needs to perform actions on behalf of the pool (like transferring tokens), it uses:
let seeds = pool_authority_seeds!(const_pda::pool_authority::BUMP);
invoke_signed(&instruction, &account_infos, &[&seeds[..]]);

This allows the program to "sign" transactions using the PDA without needing a private key.

Benefits

- Security: Only the program can derive and use this PDA
- Efficiency: Pre-computing the PDA saves compute units during runtime
- Consistency: All pools use the same authority PDA, simplifying the architecture

  Why not use Anchor's init_if_needed style

  The pool authority PDA is not an account that holds data - it's just an address used for signing. Here's why the pre-computed approach is better:

  1. No Account Data = No Initialization Needed

  // This would be wasteful - we're not storing anything!
  #[account(
  init_if_needed,
  payer = payer,
  space = 8, // wasted space
  seeds = [b"pool_authority"],
  bump
  )]
  pub pool_authority: Account<'info, PoolAuthority>, // ❌ Unnecessary

  The pool authority is just used as a signer, not to store data. Creating an account would waste lamports on rent.

  2. Significant Compute Unit Savings

  // Runtime PDA derivation (Anchor style)
  let (pda, bump) = Pubkey::find_program_address(&[b"pool_authority"], program_id);
  // This costs ~1,500 compute units per call!

  // Pre-computed (const_pda style)
  pub const ID: Pubkey = Pubkey::new_from_array(POOL_AUTHORITY_AND_BUMP.0);
  // This costs 0 compute units - it's compile-time!

  3. Used Frequently Across Many Instructions

  The pool authority is used in almost every instruction:
  - Swaps
  - Liquidity operations
  - Token transfers
  - Migrations

  Pre-computing saves compute units on every single call.

  4. Deterministic and Program-Wide

  There's only ONE pool authority for the entire program:
  // All pools share the same authority
  seeds = [b"pool_authority"] + program_id

  Unlike pool-specific PDAs that need unique seeds, this is a singleton.

  Benefits Summary

  1. Performance: Saves ~1,500 CUs per instruction
  2. Cost: No rent for unnecessary accounts
  3. Simplicity: Just pass the address, no derivation needed
  4. Type Safety: Can't accidentally pass wrong PDA
  5. Gas Optimization: Critical for high-frequency trading AMMs

  When to use each approach

  Use Anchor's init_if_needed when:
  - You need to store data in the PDA account
  - The PDA is unique per user/pool/entity
  - You need the account to exist on-chain

  Use pre-computed PDAs when:
  - The PDA is only used for signing
  - It's a program-wide singleton
  - Performance is critical
  - No data storage needed

  This is a common pattern in performance-optimized Solana programs, especially DeFi protocols where every compute unit matters!

---
# Program Deployment Cost
```shell
make build-deploy
solana confirm 5b7NCqzPcJd3kDDUCMrY2cr6Nk3Gd8Hf91Uy9a1LLNBRrxLv1RqXUun7FMp84Cm19JEYM6GtsrpwiYEKf6rMS5GD --url localhost --verbose
```

Compute Units:
- 2,970 compute units consumed out of the default 200,000 limit

Costs:
- Transaction fee: 0.00001 SOL (10,000 lamports)
- Rent for program account: 0.00114144 SOL (1,141,440 lamports) - this is rent-exempt deposit for the program account
- Total cost: ~0.00115144 SOL

For mainnet deployment, expect:
- Similar compute units (~3,000 CU)
- Transaction fee: ~0.00001 SOL (varies with network congestion)
- Rent-exempt deposit: ~0.00114 SOL (fixed based on account size)
- Total mainnet cost estimate: ~0.00115-0.0015 SOL (depending on network conditions)