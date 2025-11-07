// Auto-generated from KimchiMigration.sol
// Do not edit manually

export const KimchiMigrationAbi = [
  {
    type: 'constructor',
    inputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'ammContract',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMigrationInfo',
    inputs: [
      {
        name: 'baseToken',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'migrationStatus',
        type: 'uint8',
        internalType: 'enum MigrationStatus',
      },
      {
        name: 'uniswapV3Pool',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'nftTokenId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isMigrationReady',
    inputs: [
      {
        name: 'baseToken',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'ready',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'baseReserve',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'threshold',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'migrateToUniswapV3',
    inputs: [
      {
        name: 'baseToken',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAmmContract',
    inputs: [
      {
        name: '_ammContract',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'AMMContractSet',
    inputs: [
      {
        name: 'ammContract',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokenMigrated',
    inputs: [
      {
        name: 'baseToken',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'uniswapV3Pool',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'nftTokenId',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'baseAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'quoteAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'migrationFee',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AlreadyMigrated',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CurveNotCompleted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CurveNotFound',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InsufficientReserves',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotImplemented',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'ReentrancyGuardReentrantCall',
    inputs: [],
  },
] as const

export const KimchiMigrationBytecode =
  '0x6080806040523461009c5760017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00553315610087575f8054336001600160a01b03198216811783556040519290916001600160a01b0316907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09080a361036b90816100a18239f35b631e4fbdf760e01b81525f6004820152602490fd5b5f80fdfe608060409080825260049081361015610016575f80fd5b5f3560e01c9081633bfc2687146102e75750806365fa294d14610280578063715018a614610229578063824e0802146101a05780638da5cb5b14610179578063c2d64ec614610142578063f2fde38b146100b25763f362dc2714610078575f80fd5b346100ae5760203660031901126100ae57356001600160a01b038116036100ae57805f6060925191818352816020840152820152f35b5f80fd5b5090346100ae5760203660031901126100ae576001600160a01b038235818116939192908490036100ae576100e561030a565b831561012c5750505f54826bffffffffffffffffffffffff60a01b8216175f55167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e05f80a3005b905f6024925191631e4fbdf760e01b8352820152fd5b50346100ae5760203660031901126100ae57356001600160a01b038116036100ae57805f6060925191818352816020840152820152f35b82346100ae575f3660031901126100ae575f5490516001600160a01b039091168152602090f35b5090346100ae5760203660031901126100ae5781356001600160a01b03811692908390036100ae576101d061030a565b821561021b577f4f4381730fecd01da3818f9471de26fb7eb40e7e2fcda82d61a1056949c6023260208484816bffffffffffffffffffffffff60a01b600154161760015551908152a1005b905163e6c4247b60e01b8152fd5b346100ae575f3660031901126100ae5761024161030a565b5f80546001600160a01b0319811682556001600160a01b03167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08280a3005b5090346100ae5760203660031901126100ae5781356001600160a01b038116036100ae5760027f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f0054146102da575163d623472560e01b8152fd5b51633ee5aeb560e01b8152fd5b346100ae575f3660031901126100ae576001546001600160a01b03168152602090f35b5f546001600160a01b0316330361031d57565b60405163118cdaa760e01b8152336004820152602490fdfea26469706673582212203963375ef904ed39f44a91def7eb0419ec4af4385333ffa1ac06a6ee697b14e364736f6c63430008180033' as const
