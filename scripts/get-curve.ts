import {getCurveAuthority, getCurvePda} from "../tests/utils/accounts";
import {address} from "@solana/kit";
import {WSOL_MINT} from "../tests/utils/constants";
import {AMM_PROGRAM_ADDRESS} from "../clients/js/src/generated";

async function main() {
  const foo = await getCurvePda({
    configAddress: address('4scMumAHaZDgJMRc9aQ1UKGpduPDtD6vqqPuAb3CD2S4'),
    baseMint: address('8RTpY5unWtu1HDuWCpocjcnVJQVWXKbVCtqzMwZtHrXn'),
    quoteMint: WSOL_MINT,
    programId: AMM_PROGRAM_ADDRESS, // Replace with actual program ID
  })
  console.log(foo)

  const curveAuthority = await getCurveAuthority({
    programId: AMM_PROGRAM_ADDRESS,
  })
  console.log(curveAuthority)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
