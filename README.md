# Kimchi.fun AMM (Automated Market Maker)

## Troubleshooting

### "Unsupported program id" Error for Metaplex Token Metadata

If tests fail with "Unsupported program id" for `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`, the Metaplex Token Metadata program is not available on your local validator.

**Solution:** Start your local validator with the Metaplex program cloned from devnet:

```shell
# Stop any running validator
pkill -f solana-test-validator

# Start validator with Metaplex program from devnet
solana-test-validator --clone metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s --clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s --url devnet --reset

# Rebuild and deploy your program
make build-deploy

# Run tests
bun test
```

## Programs

- meteora DAMM v2
  - devnet: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
  - mainnet: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
- metaplex
  - `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`

# TODOs
- graduation logic is fucked
- re-read buy/sell helpers and logic
- fix swap.test.ts


## Deploy cost calculation
```shell
du -k target/deploy/amm.so | awk '{print $1 * 1024}'
765952

solana rent 765952
Rent-exempt minimum: 5.3319168 SOL
```
