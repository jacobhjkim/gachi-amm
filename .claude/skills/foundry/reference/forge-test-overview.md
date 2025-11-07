---
description: Test smart contract using forge test.
---

## Tests

Forge can run your tests with the [`forge test`](/forge/reference/test) command. All tests are written in Solidity.

Forge will look for the tests anywhere in your source directory. Any contract with a function that starts with `test` is considered to be a test. Usually, tests will be placed in `test/` by convention and end with `.t.sol`.

Here's an example of running `forge test` in a freshly created project, that only has the default test:

```sh
$ forge test
No files changed, compilation skipped
 
Ran 2 tests for test/Counter.t.sol:CounterTest
[PASS] testFuzz_SetNumber(uint256) (runs: 256, μ: 28045, ~: 29289)
[PASS] test_Increment() (gas: 28783)
Suite result: ok. 2 passed; 0 failed; 0 skipped; finished in 6.86ms (6.57ms CPU time)
 
Ran 1 test suite in 10.62ms (6.86ms CPU time): 2 tests passed, 0 failed, 0 skipped (2 total tests)
```

You can also run specific tests by passing a filter:

```sh
$ forge test --match-contract ComplicatedContractTest --match-test test_Deposit
Compiling 24 files with Solc 0.8.10
Solc 0.8.10 finished in 691.09ms
Compiler run successful!
 
Ran 2 tests for test/ComplicatedContract.t.sol:ComplicatedContractTest
[PASS] test_DepositERC20() (gas: 179207)
[PASS] test_DepositETH() (gas: 107628)
Suite result: ok. 2 passed; 0 failed; 0 skipped; finished in 1.33ms (1.71ms CPU time)
 
Ran 1 test suite in 8.36ms (1.33ms CPU time): 2 tests passed, 0 failed, 0 skipped (2 total tests)
```

This will run the tests in the `ComplicatedContractTest` test contract with `testDeposit` in the name.
Inverse versions of these flags also exist (`--no-match-contract` and `--no-match-test`).

You can run tests in filenames that match a glob pattern with `--match-path`.

```sh
$ forge test --match-contract ComplicatedContractTest --match-test test_Deposit
Compiling 24 files with Solc 0.8.10
Solc 0.8.10 finished in 691.09ms
Compiler run successful!
 
Ran 2 tests for test/ComplicatedContract.t.sol:ComplicatedContractTest
[PASS] test_DepositERC20() (gas: 179207)
[PASS] test_DepositETH() (gas: 107628)
Suite result: ok. 2 passed; 0 failed; 0 skipped; finished in 1.33ms (1.71ms CPU time)
 
Ran 1 test suite in 8.36ms (1.33ms CPU time): 2 tests passed, 0 failed, 0 skipped (2 total tests)
```

The inverse of the `--match-path` flag is `--no-match-path`.

### Logs and traces

The default behavior for `forge test` is to only display a summary of passing and failing tests. You can control this behavior by increasing the verbosity (using the `-v` flag). Each level of verbosity adds more information:

- **Level 2 (`-vv`)**: Logs emitted during tests are also displayed. That includes assertion errors from tests, showing information such as expected vs actual.
- **Level 3 (`-vvv`)**: Stack traces for failing tests are also displayed.
- **Level 4 (`-vvvv`)**: Stack traces for all tests are displayed, and setup traces for failing tests are displayed.
- **Level 5 (`-vvvvv`)**: Stack traces and setup traces are always displayed.

### Watch mode

Forge can re-run your tests when you make changes to your files using `forge test --watch`.

By default, only changed test files are re-run. If you want to re-run all tests on a change, you can use `forge test --watch --run-all`.