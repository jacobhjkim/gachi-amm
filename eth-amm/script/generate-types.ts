/**
 * Generate TypeScript types from compiled Solidity contracts
 * Reads ABIs from out/ directory and creates typed exports
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const CONTRACTS = ['PumpCurve', 'PumpFactory', 'PumpReward', 'PumpToken'] as const

const MOCK_CONTRACTS = ['MockUSDC'] as const

const OUT_DIR = join(import.meta.dir, '../out')
const TYPES_DIR = join(import.meta.dir, '../types')

async function generateTypes() {
	console.log('Generating TypeScript types from ABIs...\n')

	// Ensure types directory exists
	if (!existsSync(TYPES_DIR)) {
		mkdirSync(TYPES_DIR, { recursive: true })
	}

	const exports: string[] = []

	// Process main contracts
	for (const contractName of CONTRACTS) {
		const abiPath = join(OUT_DIR, `${contractName}.sol/${contractName}.json`)

		if (!existsSync(abiPath)) {
			console.warn(`⚠️  Warning: ${contractName}.json not found, skipping...`)
			continue
		}

		try {
			// Read and parse the JSON file
			const jsonFile = await Bun.file(abiPath).json()
			const abi = jsonFile.abi
			const bytecode = jsonFile.bytecode?.object || '0x'

			// Generate TypeScript file
			const tsContent = `// Auto-generated from ${contractName}.sol
// Do not edit manually

export const ${contractName}Abi = ${JSON.stringify(abi, null, 2)} as const;

export const ${contractName}Bytecode = "${bytecode}" as const;
`

			const outputPath = join(TYPES_DIR, `${contractName}.ts`)
			writeFileSync(outputPath, tsContent)

			exports.push(`export { ${contractName}Abi, ${contractName}Bytecode } from "./${contractName}";`)

			console.log(`✓ Generated types for ${contractName}`)
		} catch (error) {
			console.error(`✗ Error processing ${contractName}:`, error)
		}
	}

	// Process mock contracts
	for (const contractName of MOCK_CONTRACTS) {
		const abiPath = join(OUT_DIR, `${contractName}.sol/${contractName}.json`)

		if (!existsSync(abiPath)) {
			console.warn(`⚠️  Warning: ${contractName}.json not found, skipping...`)
			continue
		}

		try {
			// Read and parse the JSON file
			const jsonFile = await Bun.file(abiPath).json()
			const abi = jsonFile.abi
			const bytecode = jsonFile.bytecode?.object || '0x'

			// Generate TypeScript file
			const tsContent = `// Auto-generated from ${contractName}.sol
// Do not edit manually

export const ${contractName}Abi = ${JSON.stringify(abi, null, 2)} as const;

export const ${contractName}Bytecode = "${bytecode}" as const;
`

			const outputPath = join(TYPES_DIR, `${contractName}.ts`)
			writeFileSync(outputPath, tsContent)

			exports.push(`export { ${contractName}Abi, ${contractName}Bytecode } from "./${contractName}";`)

			console.log(`✓ Generated types for ${contractName}`)
		} catch (error) {
			console.error(`✗ Error processing ${contractName}:`, error)
		}
	}

	// Generate index file
	const indexContent = `// Auto-generated exports
// Do not edit manually

${exports.join('\n')}
`

	writeFileSync(join(TYPES_DIR, 'index.ts'), indexContent)
	console.log('\n✓ Generated index.ts')

	console.log(`\n✅ Type generation complete! Files in ${TYPES_DIR}`)
}

generateTypes().catch(console.error)
