import { beforeAll, describe, expect, test } from 'bun:test'
import { fetchMint } from '@solana-program/token-2022'
import { type Address, type KeyPairSigner, generateKeyPairSigner } from 'gill'
import { fetchMetadata } from 'gill/programs'
import { type BondingCurve, fetchBondingCurve } from '~/clients'
import { getCurveVaultPda, getMetadataPda } from './utils/accounts'
import {
  DEFAULT_CONFIG_ARGS,
  DEFAULT_TOKEN,
  TOKEN_DECIMALS,
  TOKEN_TOTAL_SUPPLY,
  VALIDATION,
  WSOL_MINT,
} from './utils/constants'
import { TestContextClass } from './utils/context.ts'

const expectBondingCurveValues = (
  bondingCurve: Awaited<ReturnType<typeof fetchBondingCurve>>,
  expected: Omit<BondingCurve, 'discriminator' | 'padding1'>,
) => {
  if (expected.config !== undefined) {
    expect(bondingCurve.data.config).toEqual(expected.config)
  }
  if (expected.creator !== undefined) {
    expect(bondingCurve.data.creator).toEqual(expected.creator)
  }
  if (expected.baseMint !== undefined) {
    expect(bondingCurve.data.baseMint).toEqual(expected.baseMint)
  }
  if (expected.baseVault !== undefined) {
    expect(bondingCurve.data.baseVault).toEqual(expected.baseVault)
  }
  if (expected.quoteVault !== undefined) {
    expect(bondingCurve.data.quoteVault).toEqual(expected.quoteVault)
  }
  if (expected.baseReserve !== undefined) {
    expect(bondingCurve.data.baseReserve).toEqual(expected.baseReserve)
  }
  if (expected.virtualBaseReserve !== undefined) {
    expect(bondingCurve.data.virtualBaseReserve).toEqual(expected.virtualBaseReserve)
  }
  if (expected.quoteReserve !== undefined) {
    expect(bondingCurve.data.quoteReserve).toEqual(expected.quoteReserve)
  }
  if (expected.virtualQuoteReserve !== undefined) {
    expect(bondingCurve.data.virtualQuoteReserve).toEqual(expected.virtualQuoteReserve)
  }
  if (expected.curveType !== undefined) {
    expect(bondingCurve.data.curveType).toEqual(expected.curveType)
  }
  if (expected.isMigrated !== undefined) {
    expect(bondingCurve.data.isMigrated).toEqual(expected.isMigrated)
  }
  if (expected.migrationStatus !== undefined) {
    expect(bondingCurve.data.migrationStatus).toEqual(expected.migrationStatus)
  }
  if (expected.curveFinishTimestamp !== undefined) {
    expect(bondingCurve.data.curveFinishTimestamp).toEqual(expected.curveFinishTimestamp)
  }
  if (expected.creatorFee !== undefined) {
    expect(bondingCurve.data.creatorFee).toEqual(expected.creatorFee)
  }
  if (expected.protocolFee !== undefined) {
    expect(bondingCurve.data.protocolFee).toEqual(expected.protocolFee)
  }
}

describe('Bonding Curve Creation Tests', () => {
  let ctx: TestContextClass
  let config: Address
  let feeClaimer: KeyPairSigner
  let creator: KeyPairSigner

  async function verifyTokenMint(
    mintPubkey: Address,
    expectedState: {
      decimals: number
      supply: bigint
    },
  ) {
    const mint = await fetchMint(ctx.rpc, mintPubkey)

    expect(mint.data.decimals).toBe(expectedState.decimals)
    expect(mint.data.supply).toBe(expectedState.supply)
    expect(mint.data.mintAuthority.__option).toBe('None')
    expect(mint.data.freezeAuthority.__option).toBe('None')
  }

  async function verifyTokenMetadata(
    mintPubkey: Address,
    expectedState: {
      name: string
      symbol: string
      uri: string
    },
  ) {
    const [metadataPda] = await getMetadataPda({ mint: mintPubkey })
    const metadata = await fetchMetadata(ctx.rpc, metadataPda)
    expect(metadata.data.data.name).toBe(expectedState.name)
    expect(metadata.data.data.symbol).toBe(expectedState.symbol)
    expect(metadata.data.data.uri).toBe(expectedState.uri)
  }

  // Initialize once before all tests
  beforeAll(async () => {
    ctx = await TestContextClass.create()
    const createConfigResult = await ctx.createConfigOnce(DEFAULT_CONFIG_ARGS)
    config = createConfigResult.configAddress
    feeClaimer = createConfigResult.feeClaimer
    creator = await ctx.createTestTrader()
  })

  test('curve - should create a new token with bonding curve', async () => {
    const mintKeypair = await generateKeyPairSigner()
    const creatorBalanceBefore = await ctx.getBalance(creator.address)

    const { curvePda } = await ctx.createBondingCurveAndMintToken({
      configAddress: config,
      creator,
      mintKeypair,
      tokenMetadata: DEFAULT_TOKEN,
      feeType: 0,
    })

    const [baseVaultAddress] = await getCurveVaultPda({
      curvePda,
      mint: mintKeypair.address,
      programId: ctx.programId,
    })
    const [quoteVaultAddress] = await getCurveVaultPda({
      curvePda,
      mint: WSOL_MINT,
      programId: ctx.programId,
    })

    // Verify bonding curve state
    const bondingCurve = await ctx.getBondingCurveData({ baseMint: mintKeypair.address })
    const configData = await ctx.getConfigData({ configAddress: config })
    expectBondingCurveValues(bondingCurve, {
      config,
      creator: creator.address,
      baseMint: mintKeypair.address,
      baseVault: baseVaultAddress,
      quoteVault: quoteVaultAddress,
      baseReserve: TOKEN_TOTAL_SUPPLY,
      virtualBaseReserve: DEFAULT_CONFIG_ARGS.initialVirtualBaseReserve,
      quoteReserve: 0n,
      virtualQuoteReserve: DEFAULT_CONFIG_ARGS.initialVirtualQuoteReserve,
      curveType: 0, // 0 for Token 2022
      isMigrated: 0,
      migrationStatus: 0,
      curveFinishTimestamp: 0n,
      creatorFee: 0n, // No fee for initial mint
      protocolFee: 0n, // No fee for initial mint
    })

    await verifyTokenMint(mintKeypair.address, {
      decimals: TOKEN_DECIMALS,
      supply: TOKEN_TOTAL_SUPPLY,
    })

    await verifyTokenMetadata(mintKeypair.address, DEFAULT_TOKEN)

    const baseTokenBalance = await ctx.getVaultTokenBalance({ curvePda, mint: mintKeypair.address })
    expect(baseTokenBalance).toBe(TOKEN_TOTAL_SUPPLY)
    const quoteTokenBalance = await ctx.getVaultTokenBalance({ curvePda, mint: WSOL_MINT })
    expect(quoteTokenBalance).toBe(0n)

    const creatorBalanceAfter = await ctx.getBalance(creator.address)
    expect(Number(creatorBalanceBefore)).toBeGreaterThan(Number(creatorBalanceAfter))
    console.log('creatorSpent: ', creatorBalanceBefore - creatorBalanceAfter, ' lamports')
  })

  test('curve - should create token with custom metadata', async () => {
    const mintKeypair = await generateKeyPairSigner()

    const customMetadata = {
      name: 'Custom Token',
      symbol: 'CUSTOM',
      uri: 'https://example.com/custom-metadata.json',
    }

    await ctx.createBondingCurveAndMintToken({
      configAddress: config,
      creator,
      mintKeypair,
      tokenMetadata: customMetadata,
    })

    // Verify token metadata
    await verifyTokenMetadata(mintKeypair.address, customMetadata)
  })

  test('curve - should fail when trying to create token with same mint', async () => {
    const mintKeypair = await generateKeyPairSigner()

    // First creation should succeed
    await ctx.createBondingCurveAndMintToken({
      configAddress: config,
      creator,
      mintKeypair,
    })

    // Second creation with same mint should fail
    expect(
      ctx.createBondingCurveAndMintToken({
        configAddress: config,
        creator,
        mintKeypair,
      }),
    ).rejects.toThrow()
  })

  // Data-driven tests for valid metadata
  const validMetadataTests = [
    {
      name: 'accepts maximum length name',
      metadata: {
        name: 'A'.repeat(VALIDATION.MAX_NAME_LENGTH),
        symbol: 'TEST',
        uri: DEFAULT_TOKEN.uri,
      },
    },
    {
      name: 'accepts maximum length symbol',
      metadata: {
        name: 'Test Token',
        symbol: 'A'.repeat(VALIDATION.MAX_SYMBOL_LENGTH),
        uri: DEFAULT_TOKEN.uri,
      },
    },
    {
      name: 'accepts maximum length URI',
      metadata: {
        name: 'Test Token',
        symbol: 'TEST',
        uri: 'A'.repeat(VALIDATION.MAX_URI_LENGTH),
      },
    },
  ]

  for (const { name, metadata } of validMetadataTests) {
    test(name, async () => {
      const mintKeypair = await generateKeyPairSigner()
      const { curvePda } = await ctx.createBondingCurveAndMintToken({
        configAddress: config,
        creator,
        mintKeypair,
        tokenMetadata: metadata,
      })

      // Verify creation succeeded
      const bondingCurve = await fetchBondingCurve(ctx.rpc, curvePda)
      expect(bondingCurve).toBeDefined()
    })
  }

  const invalidMetadataTests = [
    {
      name: 'rejects name too long',
      metadata: {
        name: 'A'.repeat(VALIDATION.MAX_NAME_LENGTH + 1),
        symbol: 'TEST',
        uri: DEFAULT_TOKEN.uri,
      },
    },
    {
      name: 'rejects empty name',
      metadata: {
        name: '',
        symbol: 'TEST',
        uri: DEFAULT_TOKEN.uri,
      },
    },
    {
      name: 'rejects symbol too long',
      metadata: {
        name: 'Test Token',
        symbol: 'A'.repeat(VALIDATION.MAX_SYMBOL_LENGTH + 1),
        uri: DEFAULT_TOKEN.uri,
      },
    },
    {
      name: 'rejects empty symbol',
      metadata: {
        name: 'Test Token',
        symbol: '',
        uri: DEFAULT_TOKEN.uri,
      },
    },
    {
      name: 'rejects URI too long',
      metadata: {
        name: 'Test Token',
        symbol: 'TEST',
        uri: 'A'.repeat(VALIDATION.MAX_URI_LENGTH + 1),
      },
    },
  ]

  for (const { name, metadata } of invalidMetadataTests) {
    test(name, async () => {
      const mintKeypair = await generateKeyPairSigner()
      expect(
        ctx.createBondingCurveAndMintToken({
          configAddress: config,
          creator,
          mintKeypair,
          tokenMetadata: metadata,
        }),
      ).rejects.toThrow()
    })
  }
})
