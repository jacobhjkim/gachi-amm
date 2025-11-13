/**
 * TypeScript implementation of PumpCurve swap math
 * Matches the Solidity implementation in PumpCurve.sol
 */

const MAX_BASIS_POINTS = 10000n

/**
 * Multiply two numbers and divide by a third with specified rounding
 * Matches Solidity's Math.mulDiv function
 *
 * @param x First multiplicand
 * @param y Second multiplicand
 * @param denominator Divisor
 * @param roundUp Whether to round up (true) or down (false)
 * @returns Result of (x * y) / denominator with proper rounding
 */
function mulDiv(x: bigint, y: bigint, denominator: bigint, roundUp: boolean): bigint {
	if (denominator === 0n) {
		throw new Error('Division by zero')
	}

	const product = x * y
	const result = product / denominator

	if (roundUp) {
		// Round up if there's a remainder
		const remainder = product % denominator
		return remainder > 0n ? result + 1n : result
	}

	// Round down (default BigInt division behavior)
	return result
}

/**
 * Calculate base output amount when buying with quote tokens (quote → base)
 * Implements constant product formula: x * y = k
 *
 * @param virtualQuote Current virtual quote reserve
 * @param virtualBase Current virtual base reserve
 * @param amountIn Quote tokens being swapped in
 * @returns Base tokens to be received
 */
export function getSwapAmountFromQuoteToBase(virtualQuote: bigint, virtualBase: bigint, amountIn: bigint): bigint {
	// New virtual quote after adding input
	const newVirtualQuote = virtualQuote + amountIn

	// Calculate new virtual base maintaining k = virtualQuote * virtualBase
	// Round UP: makes newVirtualBase larger → user receives less tokens (protocol favored, k preserved)
	const newVirtualBase = mulDiv(virtualQuote, virtualBase, newVirtualQuote, true)

	// Output is the difference
	const baseOut = virtualBase - newVirtualBase

	return baseOut
}

/**
 * Calculate quote output amount when selling base tokens (base → quote)
 * Implements constant product formula: x * y = k
 *
 * @param virtualQuote Current virtual quote reserve
 * @param virtualBase Current virtual base reserve
 * @param amountIn Base tokens being swapped in
 * @returns Quote tokens to be received
 */
export function getSwapAmountFromBaseToQuote(virtualQuote: bigint, virtualBase: bigint, amountIn: bigint): bigint {
	// New virtual base after adding input
	const newVirtualBase = virtualBase + amountIn

	// Calculate new virtual quote maintaining k = virtualQuote * virtualBase
	// Round UP: makes newVirtualQuote larger → user receives less tokens (protocol favored, k preserved)
	const newVirtualQuote = mulDiv(virtualQuote, virtualBase, newVirtualBase, true)

	// Output is the difference
	const quoteOut = virtualQuote - newVirtualQuote

	return quoteOut
}

/**
 * Calculate swap output amount for either direction
 *
 * @param virtualQuote Current virtual quote reserve
 * @param virtualBase Current virtual base reserve
 * @param amountIn Amount of tokens being swapped in
 * @param quoteToBase Direction: true for buy (quote → base), false for sell (base → quote)
 * @returns Amount of tokens to be received
 */
export function calculateSwapOutput(
	virtualQuote: bigint,
	virtualBase: bigint,
	amountIn: bigint,
	quoteToBase: boolean,
): bigint {
	if (quoteToBase) {
		// Buying: quote → base
		return getSwapAmountFromQuoteToBase(virtualQuote, virtualBase, amountIn)
	} else {
		// Selling: base → quote
		return getSwapAmountFromBaseToQuote(virtualQuote, virtualBase, amountIn)
	}
}

/**
 * Calculate price impact of a swap
 *
 * @param virtualQuote Current virtual quote reserve
 * @param virtualBase Current virtual base reserve
 * @param amountIn Amount of tokens being swapped in
 * @param quoteToBase Direction: true for buy (quote → base), false for sell (base → quote)
 * @returns Price impact in basis points (1 bp = 0.01%)
 */
export function calculatePriceImpact(
	virtualQuote: bigint,
	virtualBase: bigint,
	amountIn: bigint,
	quoteToBase: boolean,
): bigint {
	const amountOut = calculateSwapOutput(virtualQuote, virtualBase, amountIn, quoteToBase)

	if (quoteToBase) {
		// Price before: virtualQuote / virtualBase
		// Price after: (virtualQuote + amountIn) / (virtualBase - amountOut)
		const priceBefore = mulDiv(virtualQuote, MAX_BASIS_POINTS, virtualBase, false)
		const priceAfter = mulDiv(virtualQuote + amountIn, MAX_BASIS_POINTS, virtualBase - amountOut, false)

		// Impact = (priceAfter - priceBefore) / priceBefore * 10000 (in basis points)
		const impact = mulDiv((priceAfter - priceBefore) * MAX_BASIS_POINTS, 1n, priceBefore, false)
		return impact
	} else {
		// Price before: virtualBase / virtualQuote
		// Price after: (virtualBase + amountIn) / (virtualQuote - amountOut)
		const priceBefore = mulDiv(virtualBase, MAX_BASIS_POINTS, virtualQuote, false)
		const priceAfter = mulDiv(virtualBase + amountIn, MAX_BASIS_POINTS, virtualQuote - amountOut, false)

		// Impact = (priceAfter - priceBefore) / priceBefore * 10000 (in basis points)
		const impact = mulDiv((priceAfter - priceBefore) * MAX_BASIS_POINTS, 1n, priceBefore, false)
		return impact
	}
}

/**
 * Calculate the effective price per token for a swap
 *
 * @param amountIn Amount of tokens being swapped in
 * @param amountOut Amount of tokens to be received
 * @param quoteToBase Direction: true for buy (quote → base), false for sell (base → quote)
 * @param decimals Number of decimals for price formatting (default 6)
 * @returns Effective price (quote per base token)
 */
export function calculateEffectivePrice(
	amountIn: bigint,
	amountOut: bigint,
	quoteToBase: boolean,
	decimals: number = 6,
): bigint {
	const scale = 10n ** BigInt(decimals)

	if (quoteToBase) {
		// Buying: price = amountIn / amountOut (quote per base)
		return mulDiv(amountIn, scale, amountOut, false)
	} else {
		// Selling: price = amountOut / amountIn (quote per base)
		return mulDiv(amountOut, scale, amountIn, false)
	}
}

/**
 * Calculate the amount of input needed to get a specific output
 * Uses binary search to find the input amount
 *
 * @param virtualQuote Current virtual quote reserve
 * @param virtualBase Current virtual base reserve
 * @param desiredOut Desired output amount
 * @param quoteToBase Direction: true for buy (quote → base), false for sell (base → quote)
 * @returns Amount of input tokens needed
 */
export function calculateRequiredInput(
	virtualQuote: bigint,
	virtualBase: bigint,
	desiredOut: bigint,
	quoteToBase: boolean,
): bigint {
	// For constant product AMM, we can calculate this directly
	if (quoteToBase) {
		// Buying: want to receive desiredOut base tokens
		// newVirtualBase = virtualBase - desiredOut
		// k = virtualQuote * virtualBase
		// newVirtualQuote = k / newVirtualBase
		// amountIn = newVirtualQuote - virtualQuote

		const newVirtualBase = virtualBase - desiredOut
		if (newVirtualBase <= 0n) {
			throw new Error('Desired output exceeds available liquidity')
		}

		// Round up to ensure we get at least the desired output
		const newVirtualQuote = mulDiv(virtualQuote, virtualBase, newVirtualBase, true)
		const amountIn = newVirtualQuote - virtualQuote

		return amountIn
	} else {
		// Selling: want to receive desiredOut quote tokens
		// newVirtualQuote = virtualQuote - desiredOut
		// k = virtualQuote * virtualBase
		// newVirtualBase = k / newVirtualQuote
		// amountIn = newVirtualBase - virtualBase

		const newVirtualQuote = virtualQuote - desiredOut
		if (newVirtualQuote <= 0n) {
			throw new Error('Desired output exceeds available liquidity')
		}

		// Round up to ensure we get at least the desired output
		const newVirtualBase = mulDiv(virtualQuote, virtualBase, newVirtualQuote, true)
		const amountIn = newVirtualBase - virtualBase

		return amountIn
	}
}
