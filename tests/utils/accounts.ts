import { getCreateAssociatedTokenInstructionAsync } from '@solana-program/token'
import {
  type Address,
  type KeyPairSigner,
  type SolanaClient,
  address,
  fetchEncodedAccount,
  getAddressEncoder,
  getProgramDerivedAddress,
} from 'gill'
import { TOKEN_2022_PROGRAM_ADDRESS, TOKEN_METADATA_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from 'gill/programs'
import { getAssociatedTokenAccountAddress } from 'gill/programs/token'

import { DAMM_V2_PROGRAM_ID, DYNAMIC_BONDING_CURVE_PROGRAM_ID, SEEDS } from './constants.ts'
import { TradeDirection } from './swap-quote.ts'

const addressEncoder = getAddressEncoder()

// To fix IDL generation: https://github.com/coral-xyz/anchor/issues/3209
export function maxKey(left: Address, right: Address) {
  const leftBytes = addressEncoder.encode(left)
  const rightBytes = addressEncoder.encode(right)

  // Compare bytes lexicographically
  for (let i = 0; i < 32; i++) {
    if (leftBytes[i] > rightBytes[i]) return leftBytes
    if (leftBytes[i] < rightBytes[i]) return rightBytes
  }
  return leftBytes // They are equal
}

export function minKey(left: Address, right: Address) {
  const leftBytes = addressEncoder.encode(left)
  const rightBytes = addressEncoder.encode(right)

  // Compare bytes lexicographically
  for (let i = 0; i < 32; i++) {
    if (leftBytes[i] < rightBytes[i]) return leftBytes
    if (leftBytes[i] > rightBytes[i]) return rightBytes
  }
  return leftBytes // They are equal
}

/**
 * Get the first key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The first key
 */
export function getFirstKey(key1: Address, key2: Address) {
  const buf1 = Buffer.from(addressEncoder.encode(key1))
  const buf2 = Buffer.from(addressEncoder.encode(key2))
  // Buf1 > buf2
  if (Buffer.compare(buf1, buf2) === 1) {
    return buf1
  }
  return buf2
}

/**
 * Get the second key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The second key
 */
export function getSecondKey(key1: Address, key2: Address) {
  const buf1 = Buffer.from(addressEncoder.encode(key1))
  const buf2 = Buffer.from(addressEncoder.encode(key2))
  // Buf1 > buf2
  if (Buffer.compare(buf1, buf2) === 1) {
    return buf2
  }
  return buf1
}

export async function getAmmConfigPda(programId: Address, index: number) {
  // Convert index to big-endian bytes (2 bytes for u16)
  const indexBuffer = Buffer.allocUnsafe(2)
  indexBuffer.writeUInt16BE(index, 0)

  return await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from(SEEDS.CONFIG_PREFIX), indexBuffer],
  })
}

export async function getCurvePda({
  configAddress,
  baseMint,
  quoteMint,
  programId,
}: {
  configAddress: Address
  baseMint: Address
  quoteMint: Address
  programId: Address
}) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      Buffer.from(SEEDS.CURVE_PREFIX),
      addressEncoder.encode(configAddress),
      maxKey(baseMint, quoteMint),
      minKey(baseMint, quoteMint),
    ],
  })
}

/**
 * Derive curve authority
 * @returns The curve authority
 */
export async function getCurveAuthority({
  programId,
}: {
  programId: Address
}) {
  return await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from(SEEDS.CURVE_AUTHORITY_PREFIX)],
  })
}

export async function getCurveVaultPda({
  curvePda,
  mint,
  programId,
}: {
  curvePda: Address
  mint: Address
  programId: Address
}) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from(SEEDS.TOKEN_VAULT), addressEncoder.encode(mint), addressEncoder.encode(curvePda)],
  })
}

export async function getMetadataPda({ mint }: { mint: Address }) {
  return getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      Buffer.from('metadata'),
      addressEncoder.encode(TOKEN_METADATA_PROGRAM_ADDRESS),
      addressEncoder.encode(mint),
    ],
  })
}

/**
 * Derive DAMM V2 pool authority
 * @returns The pool authority
 */
export async function deriveDammV2PoolAuthority() {
  return getProgramDerivedAddress({
    programAddress: DAMM_V2_PROGRAM_ID,
    seeds: [Buffer.from(SEEDS.POOL_AUTHORITY)],
  })
}

/**
 * Derive DAMM V2 event authority
 * @returns The event authority
 */
export function deriveDammV2EventAuthority() {
  return getProgramDerivedAddress({
    programAddress: DAMM_V2_PROGRAM_ID,
    seeds: [Buffer.from(SEEDS.EVENT_AUTHORITY)],
  })
}

/**
 * Derive DAMM V2 migration metadata address
 * @param curve - The bonding curve address
 * @returns The DAMM migration metadata address
 */
export function deriveDammV2MigrationMetadataAddress(curve: Address) {
  return getProgramDerivedAddress({
    programAddress: DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    seeds: [Buffer.from(SEEDS.DAMM_V2_MIGRATION_METADATA), addressEncoder.encode(curve)],
  })
}

/**
 * Derive DAMM V2 pool address
 * @param config - The config
 * @param tokenAMint - The token A mint
 * @param tokenBMint - The token B mint
 * @returns The DAMM V2 pool address
 */
export function deriveDammV2PoolAddress({
  config,
  tokenAMint,
  tokenBMint,
}: {
  config: Address
  tokenAMint: Address
  tokenBMint: Address
}) {
  return getProgramDerivedAddress({
    programAddress: DAMM_V2_PROGRAM_ID,
    seeds: [
      Buffer.from(SEEDS.POOL),
      addressEncoder.encode(config),
      getFirstKey(tokenAMint, tokenBMint),
      getSecondKey(tokenAMint, tokenBMint),
    ],
  })
}

/**
 * Derive DAMM V2 position address
 * @param positionNft - The position NFT
 * @returns The DAMM V2 position address
 */
export function derivePositionAddress(positionNft: Address) {
  return getProgramDerivedAddress({
    programAddress: DAMM_V2_PROGRAM_ID,
    seeds: [Buffer.from(SEEDS.POSITION), addressEncoder.encode(positionNft)],
  })
}

/**
 * Derive DAMM V2 position NFT account
 * @param positionNftMint - The position NFT mint
 * @returns The DAMM V2 position NFT account
 */
export function derivePositionNftAccount(positionNftMint: Address) {
  return getProgramDerivedAddress({
    programAddress: DAMM_V2_PROGRAM_ID,
    seeds: [Buffer.from(SEEDS.POSITION_NFT_ACCOUNT), addressEncoder.encode(positionNftMint)],
  })
}

/**
 * Derive DAMM V2 token vault address
 * @param pool - The pool
 * @param mint - The mint
 * @returns The token vault
 */
export function deriveDammV2TokenVaultAddress({
  pool,
  mint,
}: {
  pool: Address
  mint: Address
}) {
  return getProgramDerivedAddress({
    programAddress: DAMM_V2_PROGRAM_ID,
    seeds: [Buffer.from(SEEDS.TOKEN_VAULT), addressEncoder.encode(mint), addressEncoder.encode(pool)],
  })
}

// Helper to derive user cashback account PDA
export async function getUserCashbackAccountPda({
  userAddress,
  programId,
}: { userAddress: Address; programId: Address }) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from(SEEDS.CASHBACK_PREFIX), addressEncoder.encode(userAddress)],
  })
}

export async function prepareTokenAccounts({
  rpc,
  owner,
  payer,
  tokenAMint,
  tokenBMint,
  tokenAProgram,
  tokenBProgram,
}: {
  rpc: SolanaClient<'localnet' | 'devnet'>['rpc']
  owner: Address
  payer: KeyPairSigner
  tokenAMint: Address
  tokenBMint: Address
  tokenAProgram: Address
  tokenBProgram: Address
}) {
  const instructions = []
  const [{ ata: ataTokenA, ix: createAtaTokenAIx }, { ata: ataTokenB, ix: createAtaTokenBIx }] = await Promise.all([
    getOrCreateATAInstruction(rpc, tokenAMint, owner, payer, tokenAProgram),
    getOrCreateATAInstruction(rpc, tokenBMint, owner, payer, tokenBProgram),
  ])
  createAtaTokenAIx && instructions.push(createAtaTokenAIx)
  createAtaTokenBIx && instructions.push(createAtaTokenBIx)

  return { ataTokenA, ataTokenB, instructions }
}

export enum TokenType {
  SPL = 0,
  Token2022 = 1,
}

export interface PrepareSwapParams {
  inputMint: Address
  outputMint: Address
  inputTokenProgram: Address
  outputTokenProgram: Address
}

/**
 * Get the token program for a given token type
 * @param tokenType - The token type
 * @returns The token program
 */
export function getTokenProgram(tokenType: TokenType): Address {
  return tokenType === TokenType.SPL ? TOKEN_PROGRAM_ADDRESS : TOKEN_2022_PROGRAM_ADDRESS
}

/**
 * Private method to prepare swap parameters
 * @param tradeDirection - The trade direction (BaseToQuote or QuoteToBase)
 * @param virtualCurveState - The virtual pool state
 * @param configState - The pool config state
 * @returns The prepare swap parameters
 */
export function prepareSwapParams(
  tradeDirection: TradeDirection,
  virtualCurveState: {
    baseMint: Address
    curveType: TokenType
  },
  configState: {
    quoteMint: Address
    quoteTokenFlag: TokenType
  },
): PrepareSwapParams {
  if (tradeDirection === TradeDirection.BaseToQuote) {
    return {
      inputMint: address(virtualCurveState.baseMint),
      outputMint: address(configState.quoteMint),
      inputTokenProgram: getTokenProgram(virtualCurveState.curveType),
      outputTokenProgram: getTokenProgram(configState.quoteTokenFlag),
    }
  }
  return {
    inputMint: address(configState.quoteMint),
    outputMint: address(virtualCurveState.baseMint),
    inputTokenProgram: getTokenProgram(configState.quoteTokenFlag),
    outputTokenProgram: getTokenProgram(virtualCurveState.curveType),
  }
}

/**
 * Get or create an ATA instruction using modern Solana client
 * @param rpc - The RPC connection
 * @param tokenMint - The token mint
 * @param owner - The owner
 * @param payer - The payer
 * @param tokenProgram - The token program
 * @returns The ATA instruction
 */
export const getOrCreateATAInstruction = async (
  rpc: SolanaClient<'localnet' | 'devnet'>['rpc'],
  tokenMint: Address,
  owner: Address,
  payer: KeyPairSigner,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
) => {
  const ata = await getAssociatedTokenAccountAddress(tokenMint, owner, tokenProgram)
  const fetchResult = await fetchEncodedAccount(rpc, ata, {
    commitment: 'confirmed',
  })
  if (fetchResult.exists) {
    // If the account exists, return it without creating a new one
    return { ata, ix: undefined }
  }

  const ix = await getCreateAssociatedTokenInstructionAsync({
    payer,
    ata,
    owner,
    mint: tokenMint,
    tokenProgram: tokenProgram,
  })

  return { ata, ix }
}

/**
 * Get cashback accounts for a user
 * @param cashbackAddress - The cashback address
 * @param quoteMint - The quote mint address
 * @param programId - The program ID
 * @returns The cashback PDA and token account
 */
export async function getCashbackAccounts({
  cashbackAddress,
  quoteMint,
  programId,
}: {
  cashbackAddress: Address | undefined
  quoteMint: Address
  programId: Address
}) {
  if (!cashbackAddress) {
    return { cashbackPda: null, cashbackTokenAccount: null }
  }

  const [cashbackPda] = await getUserCashbackAccountPda({
    userAddress: cashbackAddress,
    programId,
  })
  const cashbackTokenAccount = await getAssociatedTokenAccountAddress(quoteMint, cashbackPda, TOKEN_PROGRAM_ADDRESS)

  return { cashbackPda, cashbackTokenAccount }
}
