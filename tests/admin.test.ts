import { beforeAll, describe, expect, test } from 'bun:test'
import type { Address } from 'gill'
import { generateKeyPairSigner } from 'gill'
import type { Config, CreateConfigInstructionDataArgs, fetchConfig } from '~/clients'
import {
  CREATOR_FEE_BASIS_POINTS,
  DEFAULT_CONFIG_ARGS,
  FEE_BASIS_POINTS,
  L1_REFERRAL_FEE_BASIS_POINTS,
  L2_REFERRAL_FEE_BASIS_POINTS,
  L3_REFERRAL_FEE_BASIS_POINTS,
  MEME_FEE_BASIS_POINTS,
  MIGRATION_FEE_BASIS_POINTS,
  REFEREE_DISCOUNT_BASIS_POINTS,
  WSOL_MINT,
} from './utils/constants'
import { TestContextClass } from './utils/context.ts'

const expectConfigValues = (
  config: Awaited<ReturnType<typeof fetchConfig>>,
  expected: Omit<Config, 'discriminator' | 'padding1' | 'padding2' | 'padding3'>,
) => {
  if (expected.quoteMint !== undefined) {
    expect(config.data.quoteMint.toString()).toEqual(expected.quoteMint)
  }
  if (expected.feeClaimer !== undefined) {
    expect(config.data.feeClaimer.toString()).toEqual(expected.feeClaimer)
  }
  if (expected.baseTokenFlag !== undefined) {
    expect(config.data.baseTokenFlag).toEqual(expected.baseTokenFlag)
  }
  if (expected.quoteTokenFlag !== undefined) {
    expect(config.data.quoteTokenFlag).toEqual(expected.quoteTokenFlag)
  }
  if (expected.baseDecimal !== undefined) {
    expect(config.data.baseDecimal).toEqual(expected.baseDecimal)
  }
  if (expected.quoteDecimal !== undefined) {
    expect(config.data.quoteDecimal).toEqual(expected.quoteDecimal)
  }
  if (expected.feeBasisPoints !== undefined) {
    expect(config.data.feeBasisPoints).toEqual(expected.feeBasisPoints)
  }
  if (expected.l1ReferralFeeBasisPoints !== undefined) {
    expect(config.data.l1ReferralFeeBasisPoints).toEqual(expected.l1ReferralFeeBasisPoints)
  }
  if (expected.l2ReferralFeeBasisPoints !== undefined) {
    expect(config.data.l2ReferralFeeBasisPoints).toEqual(expected.l2ReferralFeeBasisPoints)
  }
  if (expected.l3ReferralFeeBasisPoints !== undefined) {
    expect(config.data.l3ReferralFeeBasisPoints).toEqual(expected.l3ReferralFeeBasisPoints)
  }
  if (expected.refereeDiscountBasisPoints !== undefined) {
    expect(config.data.refereeDiscountBasisPoints).toEqual(expected.refereeDiscountBasisPoints)
  }
  if (expected.creatorFeeBasisPoints !== undefined) {
    expect(config.data.creatorFeeBasisPoints).toEqual(expected.creatorFeeBasisPoints)
  }
  if (expected.memeFeeBasisPoints !== undefined) {
    expect(config.data.memeFeeBasisPoints).toEqual(expected.memeFeeBasisPoints)
  }
  if (expected.migrationFeeBasisPoints !== undefined) {
    expect(config.data.migrationFeeBasisPoints).toEqual(expected.migrationFeeBasisPoints)
  }
  if (expected.migrationBaseThreshold !== undefined) {
    expect(config.data.migrationBaseThreshold).toEqual(expected.migrationBaseThreshold)
  }
  if (expected.migrationQuoteThreshold !== undefined) {
    expect(config.data.migrationQuoteThreshold).toEqual(expected.migrationQuoteThreshold)
  }
  if (expected.initialVirtualQuoteReserve !== undefined) {
    expect(config.data.initialVirtualQuoteReserve).toEqual(expected.initialVirtualQuoteReserve)
  }
  if (expected.initialVirtualBaseReserve !== undefined) {
    expect(config.data.initialVirtualBaseReserve).toEqual(expected.initialVirtualBaseReserve)
  }
}

describe('Admin Config Tests', () => {
  let ctx: TestContextClass

  beforeAll(async () => {
    ctx = await TestContextClass.create()
  })

  test('create config - spl token', async () => {
    const createConfigResult = await ctx.createConfig(DEFAULT_CONFIG_ARGS, WSOL_MINT)
    const config = await ctx.getConfigData({ configAddress: createConfigResult.configAddress })

    expectConfigValues(config, {
      quoteMint: WSOL_MINT,
      feeClaimer: createConfigResult.feeClaimer.address,
      baseTokenFlag: 0,
      quoteTokenFlag: 0,
      baseDecimal: 6,
      quoteDecimal: 9,
      feeBasisPoints: FEE_BASIS_POINTS,
      l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
      l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
      l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
      refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
      creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
      memeFeeBasisPoints: MEME_FEE_BASIS_POINTS,
      migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
      migrationBaseThreshold: DEFAULT_CONFIG_ARGS.migrationBaseThreshold,
      migrationQuoteThreshold: DEFAULT_CONFIG_ARGS.migrationQuoteThreshold,
      initialVirtualQuoteReserve: DEFAULT_CONFIG_ARGS.initialVirtualQuoteReserve,
      initialVirtualBaseReserve: DEFAULT_CONFIG_ARGS.initialVirtualBaseReserve,
    })
  })

  test('create config - base mint token2022', async () => {
    const createConfigResult = await ctx.createConfig(
      {
        ...DEFAULT_CONFIG_ARGS,
        baseTokenFlag: 1, // Token 2022
      },
      WSOL_MINT,
    )
    const config = await ctx.getConfigData({ configAddress: createConfigResult.configAddress })

    expectConfigValues(config, {
      quoteMint: WSOL_MINT,
      feeClaimer: createConfigResult.feeClaimer.address,
      baseTokenFlag: 1,
      quoteTokenFlag: 0,
      baseDecimal: 6,
      quoteDecimal: 9,
      feeBasisPoints: FEE_BASIS_POINTS,
      l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
      l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
      l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
      refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
      creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
      memeFeeBasisPoints: MEME_FEE_BASIS_POINTS,
      migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
      migrationBaseThreshold: DEFAULT_CONFIG_ARGS.migrationBaseThreshold,
      migrationQuoteThreshold: DEFAULT_CONFIG_ARGS.migrationQuoteThreshold,
      initialVirtualQuoteReserve: DEFAULT_CONFIG_ARGS.initialVirtualQuoteReserve,
      initialVirtualBaseReserve: DEFAULT_CONFIG_ARGS.initialVirtualBaseReserve,
    })
  })

  test('create config - rejects non-owner creation attempts', async () => {
    const nonOwner = await ctx.createTestTrader()

    expect(ctx.createConfig(DEFAULT_CONFIG_ARGS, WSOL_MINT, nonOwner)).rejects.toThrow()
  })

  describe('create config - validation', () => {
    const baseValidArgs = DEFAULT_CONFIG_ARGS

    const validationTests: {
      name: string
      args: CreateConfigInstructionDataArgs
      quoteMint?: Address
      expectedError?: string
    }[] = [
      {
        name: 'rejects invalid token type (> 1)',
        args: {
          ...baseValidArgs,
          baseTokenFlag: 2,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidTokenType',
      },
      {
        name: 'rejects invalid token decimal (< 6)',
        args: {
          ...baseValidArgs,
          baseDecimal: 5,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidTokenDecimals',
      },
      {
        name: 'rejects invalid token decimal (> 9)',
        args: {
          ...baseValidArgs,
          baseDecimal: 10,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidTokenDecimals',
      },
      {
        name: 'rejects when total referral fees >= trading fee',
        args: {
          ...baseValidArgs,
          feeBasisPoints: 1000,
          l1ReferralFeeBasisPoints: 300,
          l2ReferralFeeBasisPoints: 200,
          l3ReferralFeeBasisPoints: 100,
          creatorFeeBasisPoints: 400, // 300+200+100+400 = 1000, should fail
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidFeeBasisPoints',
      },
      {
        name: 'rejects invalid referral fee hierarchy (L1 <= L2)',
        args: {
          ...baseValidArgs,
          l1ReferralFeeBasisPoints: 100,
          l2ReferralFeeBasisPoints: 150, // L2 > L1, invalid
          l3ReferralFeeBasisPoints: 50,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidAmmConfig',
      },
      {
        name: 'rejects invalid referral fee hierarchy (L2 <= L3)',
        args: {
          ...baseValidArgs,
          l1ReferralFeeBasisPoints: 300,
          l2ReferralFeeBasisPoints: 100,
          l3ReferralFeeBasisPoints: 150, // L3 > L2, invalid
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidAmmConfig',
      },
      {
        name: 'rejects creator fee > 10% (1000 bps)',
        args: {
          ...baseValidArgs,
          creatorFeeBasisPoints: 1001,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCreatorTradingFeePercentage',
      },
      {
        name: 'rejects fee basis points > MAX_FEE_BASIS_POINTS (10000)',
        args: {
          ...baseValidArgs,
          feeBasisPoints: 10001,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidAmmConfig',
      },
      {
        name: 'rejects zero migration quote threshold',
        args: {
          ...baseValidArgs,
          migrationQuoteThreshold: 0n,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidQuoteThreshold',
      },
    ]

    for (const { name, args, quoteMint = WSOL_MINT, expectedError } of validationTests) {
      test(name, async () => {
        expect(ctx.createConfig(args, quoteMint)).rejects.toThrow()
      })
    }
  })

  test('handle_set_fee_type', async () => {
    // Create a fresh config
    const createConfigResult = await ctx.createConfig(DEFAULT_CONFIG_ARGS, WSOL_MINT)
    const configAddress = createConfigResult.configAddress

    // Create a fresh bonding curve with initial fee type as Creator (0)
    const creator = await ctx.createTestTrader()
    const mintKeypair = await generateKeyPairSigner()

    const createCurveResult = await ctx.createBondingCurveAndMintToken({
      configAddress,
      creator,
      mintKeypair,
      feeType: 0, // Start with Creator fee type
      tokenMetadata: {
        name: 'Test Token',
        symbol: 'TEST',
        uri: 'https://test.com/metadata.json',
      },
    })

    // Get initial curve data
    let curveData = await ctx.getCurveData({ curveAddress: createCurveResult.curvePda })
    expect(curveData.data.feeType).toEqual(0) // Should be Creator (0)

    // Change fee type to Meme (1)
    await ctx.setFeeType({
      curveAddress: createCurveResult.curvePda,
      configAddress,
      newFeeType: 1,
    })

    // Verify fee type changed to Meme
    curveData = await ctx.getCurveData({ curveAddress: createCurveResult.curvePda })
    expect(curveData.data.feeType).toEqual(1) // Should be Meme (1)

    // Change fee type to Blocked (2)
    await ctx.setFeeType({
      curveAddress: createCurveResult.curvePda,
      configAddress,
      newFeeType: 2,
    })

    // Verify fee type changed to Blocked
    curveData = await ctx.getCurveData({ curveAddress: createCurveResult.curvePda })
    expect(curveData.data.feeType).toEqual(2) // Should be Blocked (2)

    // Test that trying to set the same fee type fails
    expect(
      ctx.setFeeType({
        curveAddress: createCurveResult.curvePda,
        configAddress,
        newFeeType: 2, // Same as current
      }),
    ).rejects.toThrow()

    // Test that non-owner cannot change fee type
    const nonOwner = await ctx.createTestTrader()
    expect(
      ctx.setFeeType({
        curveAddress: createCurveResult.curvePda,
        configAddress,
        newFeeType: 0,
        payer: nonOwner,
      }),
    ).rejects.toThrow()
  })
})
