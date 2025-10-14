import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit'
import { address, createSolanaClient, getExplorerLink, signTransactionMessageWithSigners } from 'gill'
import { loadKeypairSignerFromFile } from 'gill/node'
import { TOKEN_PROGRAM_ADDRESS } from 'gill/programs'
import { getAssociatedTokenAccountAddress } from 'gill/programs/token'
import { AMM_PROGRAM_ADDRESS, getCreateConfigInstructionAsync } from '../clients/js/src/generated'
import { DEFAULT_CONFIG_ARGS, WSOL_MINT } from '../tests/utils/constants'

async function main() {
  const owner = await loadKeypairSignerFromFile()
  const { rpc, rpcSubscriptions, sendAndConfirmTransaction } = createSolanaClient({ urlOrMoniker: 'devnet' })
  const { value: ownerBalance } = await rpc.getBalance(owner.address).send()

  const configKeyPair = await loadKeypairSignerFromFile('./keys/config_2025_10_13')

  console.log(`Account balance: ${ownerBalance}`)
  console.log(`Using config keypair: ${configKeyPair.address}`)

  const feeClaimer = owner // Using owner as fee claimer for deployment
  const quoteMint = WSOL_MINT
  const feeClaimerTokenAccount = await getAssociatedTokenAccountAddress(
    quoteMint,
    feeClaimer.address,
    TOKEN_PROGRAM_ADDRESS,
  )

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
  const programId = address(AMM_PROGRAM_ADDRESS) // Replace with actual program ID

  const ix = await getCreateConfigInstructionAsync({
    /* Protocol configurations */
    config: configKeyPair,
    feeClaimer: feeClaimer.address,
    feeClaimerTokenAccount,
    quoteMint,
    payer: owner,
    program: programId,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    ...DEFAULT_CONFIG_ARGS,
  })

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => appendTransactionMessageInstructions([ix], tx),
    (tx) => setTransactionMessageFeePayerSigner(owner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  )

  const signedTx = await signTransactionMessageWithSigners(tx)
  const signature = await sendAndConfirmTransaction(signedTx)
  console.log(
    'Explorer (initialize amm config):',
    getExplorerLink({
      cluster: 'devnet',
      transaction: signature,
    }),
  )
  console.log('Config address:', configKeyPair.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
