import { beforeAll, describe, expect, test } from 'bun:test'
import type { Address } from 'gill'
import type { Config, CreateConfigInstructionDataArgs, fetchConfig } from '~/clients'
import {
  CREATOR_FEE_BASIS_POINTS,
  DEFAULT_CONFIG_ARGS,
  FEE_BASIS_POINTS,
  L1_REFERRAL_FEE_BASIS_POINTS,
  L2_REFERRAL_FEE_BASIS_POINTS,
  L3_REFERRAL_FEE_BASIS_POINTS,
  LOCKED_VESTING,
  MIGRATION_FEE_BASIS_POINTS,
  REFEREE_DISCOUNT_BASIS_POINTS,
  WSOL_MINT,
} from './utils/constants'
import { TestContextClass } from './utils/context.ts'

const expectConfigValues = (
  config: Awaited<ReturnType<typeof fetchConfig>>,
  expected: Omit<
    Config,
    'discriminator' | 'padding1' | 'padding2' | 'migrationSqrtPrice' | 'migrationBaseThreshold' | 'swapBaseAmount'
  >,
) => {
  if (expected.quoteMint !== undefined) {
    expect(config.data.quoteMint.toString()).toEqual(expected.quoteMint)
  }
  if (expected.feeClaimer !== undefined) {
    expect(config.data.feeClaimer.toString()).toEqual(expected.feeClaimer)
  }
  if (expected.tokenType !== undefined) {
    expect(config.data.tokenType).toEqual(expected.tokenType)
  }
  if (expected.quoteTokenFlag !== undefined) {
    expect(config.data.quoteTokenFlag).toEqual(expected.quoteTokenFlag)
  }
  if (expected.tokenDecimal !== undefined) {
    expect(config.data.tokenDecimal).toEqual(expected.tokenDecimal)
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
  if (expected.initialSqrtPrice !== undefined) {
    expect(config.data.initialSqrtPrice).toEqual(expected.initialSqrtPrice)
  }
  if (expected.migrationQuoteThreshold !== undefined) {
    expect(config.data.migrationQuoteThreshold).toEqual(expected.migrationQuoteThreshold)
  }
  if (expected.lockedVestingConfig !== undefined) {
    expect(config.data.lockedVestingConfig).toEqual(expected.lockedVestingConfig)
  }
  if (expected.curve !== undefined) {
    expect(config.data.curve.slice(0, 2)).toEqual(expected.curve)
  }
}

describe('Admin Config Tests', () => {
  let ctx: TestContextClass

  beforeAll(async () => {
    ctx = await TestContextClass.create()
  })

  test('create config - spl token (no vesting)', async () => {
    const createConfigResult = await ctx.createConfig(DEFAULT_CONFIG_ARGS, WSOL_MINT)
    const config = await ctx.getConfigData({ configAddress: createConfigResult.configAddress })

    expectConfigValues(config, {
      quoteMint: WSOL_MINT,
      feeClaimer: createConfigResult.feeClaimer.address,
      tokenType: 0,
      quoteTokenFlag: 0,
      tokenDecimal: 6,
      feeBasisPoints: FEE_BASIS_POINTS,
      l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
      l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
      l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
      refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
      creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
      migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
      initialSqrtPrice: DEFAULT_CONFIG_ARGS.initialSqrtPrice,
      migrationQuoteThreshold: DEFAULT_CONFIG_ARGS.migrationQuoteThreshold,
      lockedVestingConfig: DEFAULT_CONFIG_ARGS.lockedVesting,
      curve: DEFAULT_CONFIG_ARGS.curve,
    })
  })

  test('create config - spl token (with vesting)', async () => {
    const createConfigResult = await ctx.createConfig(
      {
        ...DEFAULT_CONFIG_ARGS,
        lockedVesting: LOCKED_VESTING,
      },
      WSOL_MINT,
    )
    const config = await ctx.getConfigData({ configAddress: createConfigResult.configAddress })

    expectConfigValues(config, {
      quoteMint: WSOL_MINT,
      feeClaimer: createConfigResult.feeClaimer.address,
      tokenType: 0,
      quoteTokenFlag: 0,
      tokenDecimal: 6,
      feeBasisPoints: FEE_BASIS_POINTS,
      l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
      l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
      l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
      refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
      creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
      migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
      initialSqrtPrice: DEFAULT_CONFIG_ARGS.initialSqrtPrice,
      migrationQuoteThreshold: DEFAULT_CONFIG_ARGS.migrationQuoteThreshold,
      lockedVestingConfig: LOCKED_VESTING,
      curve: DEFAULT_CONFIG_ARGS.curve,
    })
  })

  test('create config - base mint token2022', async () => {
    const createConfigResult = await ctx.createConfig(
      {
        ...DEFAULT_CONFIG_ARGS,
        tokenType: 1, // Token 2022
      },
      WSOL_MINT,
    )
    const config = await ctx.getConfigData({ configAddress: createConfigResult.configAddress })

    expectConfigValues(config, {
      quoteMint: WSOL_MINT,
      feeClaimer: createConfigResult.feeClaimer.address,
      tokenType: 1,
      quoteTokenFlag: 0,
      tokenDecimal: 6,
      feeBasisPoints: FEE_BASIS_POINTS,
      l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
      l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
      l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
      refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
      creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
      migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
      initialSqrtPrice: DEFAULT_CONFIG_ARGS.initialSqrtPrice,
      migrationQuoteThreshold: DEFAULT_CONFIG_ARGS.migrationQuoteThreshold,
      lockedVestingConfig: DEFAULT_CONFIG_ARGS.lockedVesting,
      curve: DEFAULT_CONFIG_ARGS.curve,
    })
  })

  test.skip('create config - quote mint token2022', async () => {
    // TODO: mint token 2022
    const createConfigResult = await ctx.createConfig(
      DEFAULT_CONFIG_ARGS,
      WSOL_MINT, // TODO: replace with token 2022 mint address
    )
    const config = await ctx.getConfigData({ configAddress: createConfigResult.configAddress })

    expectConfigValues(config, {
      quoteMint: WSOL_MINT,
      feeClaimer: createConfigResult.feeClaimer.address,
      tokenType: 0,
      quoteTokenFlag: 1, // Token 2022 for quote mint
      tokenDecimal: 6,
      feeBasisPoints: FEE_BASIS_POINTS,
      l1ReferralFeeBasisPoints: L1_REFERRAL_FEE_BASIS_POINTS,
      l2ReferralFeeBasisPoints: L2_REFERRAL_FEE_BASIS_POINTS,
      l3ReferralFeeBasisPoints: L3_REFERRAL_FEE_BASIS_POINTS,
      refereeDiscountBasisPoints: REFEREE_DISCOUNT_BASIS_POINTS,
      creatorFeeBasisPoints: CREATOR_FEE_BASIS_POINTS,
      migrationFeeBasisPoints: MIGRATION_FEE_BASIS_POINTS,
      initialSqrtPrice: DEFAULT_CONFIG_ARGS.initialSqrtPrice,
      migrationQuoteThreshold: DEFAULT_CONFIG_ARGS.migrationQuoteThreshold,
      lockedVestingConfig: DEFAULT_CONFIG_ARGS.lockedVesting,
      curve: DEFAULT_CONFIG_ARGS.curve,
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
          tokenType: 2,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidTokenType',
      },
      {
        name: 'rejects invalid token decimal (< 6)',
        args: {
          ...baseValidArgs,
          tokenDecimal: 5,
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidTokenDecimals',
      },
      {
        name: 'rejects invalid token decimal (> 9)',
        args: {
          ...baseValidArgs,
          tokenDecimal: 10,
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
      {
        name: 'rejects initial sqrt price below minimum',
        args: {
          ...baseValidArgs,
          initialSqrtPrice: 4295048015n, // < MIN_SQRT_PRICE
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects initial sqrt price above maximum',
        args: {
          ...baseValidArgs,
          initialSqrtPrice: 79226673521066979257578248092n, // > MAX_SQRT_PRICE
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects empty curve',
        args: {
          ...baseValidArgs,
          curve: [],
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects curve with too many points (> 3)',
        args: {
          ...baseValidArgs,
          curve: [
            { sqrtPrice: 4295048018n, liquidity: 1000n },
            { sqrtPrice: 4295048019n, liquidity: 2000n },
            { sqrtPrice: 4295048020n, liquidity: 3000n },
            { sqrtPrice: 4295048021n, liquidity: 4000n }, // 4th point, should fail
          ],
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects curve first point price <= initial price',
        args: {
          ...baseValidArgs,
          initialSqrtPrice: 4295048020n,
          curve: [
            { sqrtPrice: 4295048020n, liquidity: 1000n }, // same as initial, should fail
          ],
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects curve with zero liquidity',
        args: {
          ...baseValidArgs,
          curve: [
            { sqrtPrice: 4295048018n, liquidity: 0n }, // zero liquidity, should fail
          ],
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects curve with non-increasing prices',
        args: {
          ...baseValidArgs,
          curve: [
            { sqrtPrice: 4295048020n, liquidity: 1000n },
            { sqrtPrice: 4295048019n, liquidity: 2000n }, // decreasing price, should fail
          ],
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidCurve',
      },
      {
        name: 'rejects vesting with zero frequency but non-zero amounts',
        args: {
          ...baseValidArgs,
          lockedVesting: {
            amountPerPeriod: 1000n,
            cliffDurationFromMigrationTime: 100n,
            frequency: 0n, // zero frequency but non-zero amounts, should fail
            numberOfPeriod: 10n,
            cliffUnlockAmount: 500n,
          },
        },
        quoteMint: WSOL_MINT,
        expectedError: 'InvalidVestingParameters',
      },
      {
        name: 'rejects vesting with zero total amount',
        args: {
          ...baseValidArgs,
          lockedVesting: {
            amountPerPeriod: 0n, // zero amount per period
            cliffDurationFromMigrationTime: 100n,
            frequency: 1n,
            numberOfPeriod: 10n,
            cliffUnlockAmount: 0n, // zero cliff unlock amount
          },
        },
      },
    ]

    for (const { name, args, quoteMint = WSOL_MINT, expectedError } of validationTests) {
      test(name, async () => {
        expect(ctx.createConfig(args, quoteMint)).rejects.toThrow()
      })
    }
  })
})
