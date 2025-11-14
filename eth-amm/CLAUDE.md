# ETH AMM

- run anvil localnet with `anvil`
- build contracts with `forge build`
- deploy contracts with `./script/deploy-local.sh`
  - this script automatically restarts `anvil` and redeploys all the necessary contracts.
- generate types with `bun run ./script/generate-types.ts`
- run tests with `bun test`, or to run specific test run `bun test ./test/integration/trading.test.ts`
  - reset the localnet with `./script/deploy-local.sh` before running tests to ensure a fresh state.

## Typescript conventions
- use Promise.all() where applicable
- we test with Bun test suites.
- we use viem for interacting with the EVM and smart contracts.
