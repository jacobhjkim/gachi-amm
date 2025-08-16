we are currently getting this error:
│

```                                                                                                                                                                                    │
[Pasted text #1 +47 lines]                                                                                                                                                             │
```                                                                                                                                                                                    │
let's fix it                                                                                                                                                                           │
                                                                                                                                                                                       │
# Task                                                                                                                                                                                 │
- understand how we do the cashback tier progression by checking `programs/amm/src/states/user_cashback.rs`                                                                            │
- understand how we do the fee calculation by reading `programs/amm/src/states/config.rs` `calculate_fees()`                                                                           │
- and how we update cashback data account in both `programs/amm/src/instructions/ix_buy.rs` and `programs/amm/src/instructions.ix_sell.rs` like below:                                 │
```rs                                                                                                                                                                                  │
cashback_account.update_cashback(fee_breakdown.net_sol_amount, fee_breakdown.cashback_fee)?;                                                                                           │
```                                                                                                                                                                                    │
                                                                                                                                                                                       │
- in our `tests/cashback.test.ts`
