# Kimchi.fun AMM Development Makefile

.PHONY: help clean build build-deploy client-only test

help:
	@echo "📖 Kimchi.fun AMM Development Commands:"
	@echo ""
	@echo "  help         - Show this help message"
	@echo "  clean        - Clean all build artifacts (anchor, cargo, target, clients)"
	@echo "  build        - Build anchor program and copy clients to web"
	@echo "  build-deploy - Build, deploy anchor program and copy clients to web"
	@echo ""

clean:
	@echo "🧹 Cleaning build artifacts..."
	anchor clean
	cargo clean
	rm -rf target/
	rm -rf .anchor/
	rm -rf clients/

build-deploy:
	@echo "📦 Building and deploying anchor program..."
	anchor build -- --features local
	cp keys/program-key target/deploy/amm-keypair.json
	anchor deploy --provider.cluster localnet
	bun run scripts/fix-codama-issue.ts
	bun codama run js
	rm -rf ../monorepo/packages/sdk/clients
	@mkdir -p ../monorepo/packages/sdk/clients
	cp -r clients/js/src/generated/* ../monorepo/packages/sdk/clients/

build:
	@echo "📦 Building anchor program..."
	anchor build -- --features local
	cp keys/program-key target/deploy/amm-keypair.json
	bun run scripts/fix-codama-issue.ts
	bun codama run js
	rm -rf ../monorepo/packages/sdk/clients
	@mkdir -p ../monorepo/packages/sdk/clients
	cp -r clients/js/src/generated/* ../monorepo/packages/sdk/clients/

build-devnet:
	@echo "📦 Building anchor program for devnet..."
	anchor build -- --features devnet
	cp keys/program-key target/deploy/amm-keypair.json
	bun run scripts/fix-codama-issue.ts
	bun codama run js
	rm -rf ../monorepo/packages/sdk/clients
	@mkdir -p ../monorepo/packages/sdk/clients
	cp -r clients/js/src/generated/* ../monorepo/packages/sdk/clients/

client-only:
	@echo "📦 Copying clients to web..."
	bun run scripts/fix-codama-issue.ts
	bun codama run js
	rm -rf ../monorepo/packages/sdk/clients
	@mkdir -p ../monorepo/packages/sdk/clients
	cp -r clients/js/src/generated/* ../monorepo/packages/sdk/clients/

test:
	bun test --timeout 30000

localnet:
	solana-test-validator \
		--clone metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
		--clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
		--clone cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG \
		--clone-upgradeable-program cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG \
		--clone LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn \
		--clone-upgradeable-program LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn \
		--clone dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN \
		--clone-upgradeable-program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN \
		--clone AeLtDKgw3XnXbr3Kgfbcb7KiZULVCQ5mXaFDiG9n7EgW \
		--url devnet \
		--reset

log:
	solana logs --url localhost > logs.log

damm-idl:
	bun codama run --config codama-dammv2.json js

deploy-devnet:
	anchor deploy --provider.cluster devnet
