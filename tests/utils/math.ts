export enum Rounding {
  Up = 0,
  Down = 1,
}

/**
 * Multiply and divide with rounding using BigInt
 * @param x First number
 * @param y Second number
 * @param denominator Denominator
 * @param rounding Rounding direction
 * @returns (x * y) / denominator
 * @throws If division by zero occurs
 */
export function mulDiv(x: bigint, y: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator === 0n) {
    throw new Error('MulDiv: division by zero')
  }

  // Handle edge cases
  if (x === 0n || y === 0n) {
    return 0n
  }

  if (denominator === 1n) {
    return x * y
  }

  const prod = x * y

  if (rounding === Rounding.Up) {
    // Calculate ceiling division using built-in division
    // (prod + denominator - 1) / denominator, but avoiding overflow
    const remainder = prod % denominator
    if (remainder === 0n) {
      return prod / denominator
    }
    return prod / denominator + 1n
  }
  return prod / denominator
}
