#!/usr/bin/env bun

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Script to update the program ID after deployment
 *
 * Usage:
 * 1. Run `make build-deploy` or `anchor deploy`
 * 2. Copy the deployment output
 * 3. Run: `bun scripts/update-program-id.ts`
 * 4. Paste the deployment output when prompted
 */

const ANCHOR_TOML_PATH = path.join(process.cwd(), 'Anchor.toml')
const LIB_RS_PATH = path.join(process.cwd(), 'programs', 'amm', 'src', 'lib.rs')

async function main() {
  console.log('🚀 Program ID Update Script')
  console.log('===========================\n')

  console.log('Please paste the deployment output (press Ctrl+D when done):')

  // Read from stdin
  const input = await readStdin()

  // Parse the program ID from the deployment output
  const programId = extractProgramId(input)

  if (!programId) {
    console.error('❌ Error: Could not find Program Id in the deployment output')
    console.error('   Make sure the output contains a line like: Program Id: <ADDRESS>')
    process.exit(1)
  }

  console.log(`\n✅ Found Program ID: ${programId}`)

  // Update Anchor.toml
  console.log('\n📝 Updating Anchor.toml...')
  updateAnchorToml(programId)

  // Update lib.rs
  console.log('📝 Updating lib.rs...')
  updateLibRs(programId)

  console.log('\n✨ Successfully updated program ID in all files!')
  console.log('\n⚠️  Remember to:')
  console.log('   1. Run `anchor build` again to regenerate the IDL with the new program ID')
  console.log('   2. Commit these changes to your repository')
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', (chunk) => {
      data += chunk
    })

    process.stdin.on('end', () => {
      resolve(data)
    })
  })
}

function extractProgramId(input: string): string | null {
  // Look for "Program Id: <ADDRESS>" pattern
  const match = input.match(/Program Id:\s*([A-Za-z0-9]{44,})/)
  return match ? match[1] : null
}

function updateAnchorToml(programId: string) {
  try {
    let content = fs.readFileSync(ANCHOR_TOML_PATH, 'utf8')

    // Update the [programs.localnet] section
    content = content.replace(/(\[programs\.localnet\]\s*\namm\s*=\s*)"[^"]+"/, `$1"${programId}"`)

    // Also update [programs.devnet] if it exists
    content = content.replace(/(\[programs\.devnet\]\s*\namm\s*=\s*)"[^"]+"/, `$1"${programId}"`)

    fs.writeFileSync(ANCHOR_TOML_PATH, content)
    console.log('   ✓ Updated Anchor.toml')
  } catch (error) {
    console.error(`   ❌ Error updating Anchor.toml: ${error}`)
    throw error
  }
}

function updateLibRs(programId: string) {
  try {
    let content = fs.readFileSync(LIB_RS_PATH, 'utf8')

    // Update the declare_id! macro
    content = content.replace(/declare_id!\s*\(\s*"[^"]+"\s*\)/, `declare_id!("${programId}")`)

    fs.writeFileSync(LIB_RS_PATH, content)
    console.log('   ✓ Updated lib.rs')
  } catch (error) {
    console.error(`   ❌ Error updating lib.rs: ${error}`)
    throw error
  }
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Script failed:', error)
  process.exit(1)
})
