// this script fixes this issue:
// https://github.com/codama-idl/codama/issues/607

import Bun from 'bun'

const IDL_PATH = './target/idl/amm.json'

async function main() {
  const idl = await Bun.file(IDL_PATH).text()
  const newIdl = idl.replace(
    `            "program": {
              "kind": "account",
              "path": "token_metadata_program"
            }`,
    `            "program": {
              "kind": "const",
              "value": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
            }`,
  )
  await Bun.write(IDL_PATH, newIdl)
  console.log('updated anchor IDL for codama')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
