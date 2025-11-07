// Auto-generated from KimchiCashback.sol
// Do not edit manually

export const KimchiCashbackAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_quoteToken',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addCashback',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
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
    name: 'canClaimCashback',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'canClaim',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'timeUntilClaim',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'cashbacks',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'tier',
        type: 'uint8',
        internalType: 'enum CashbackTier',
      },
      {
        name: 'accumulated',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'lastClaimTimestamp',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'exists',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claimCashback',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createCashback',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAccumulatedCashback',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'accumulated',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCashbackAccount',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'account',
        type: 'tuple',
        internalType: 'struct CashbackAccount',
        components: [
          {
            name: 'tier',
            type: 'uint8',
            internalType: 'enum CashbackTier',
          },
          {
            name: 'accumulated',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'lastClaimTimestamp',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'exists',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserTier',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'tier',
        type: 'uint8',
        internalType: 'enum CashbackTier',
      },
    ],
    stateMutability: 'view',
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
    name: 'quoteToken',
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
    name: 'reclaimInactiveCashback',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
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
    type: 'function',
    name: 'updateCashbackTier',
    inputs: [
      {
        name: 'user',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'newTier',
        type: 'uint8',
        internalType: 'enum CashbackTier',
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
    name: 'CashbackAccountCreated',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'tier',
        type: 'uint8',
        indexed: false,
        internalType: 'enum CashbackTier',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CashbackAdded',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CashbackClaimed',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CashbackTierUpdated',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'oldTier',
        type: 'uint8',
        indexed: false,
        internalType: 'enum CashbackTier',
      },
      {
        name: 'newTier',
        type: 'uint8',
        indexed: false,
        internalType: 'enum CashbackTier',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'InactiveCashbackReclaimed',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
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
    type: 'error',
    name: 'AccountAlreadyExists',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AccountNotFound',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AccountNotInactive',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ClaimCooldownNotMet',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NoCashbackToClaim',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotAMMContract',
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
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
] as const

export const KimchiCashbackBytecode =
  '0x6080346100ff57601f610d6838819003918201601f19168301916001600160401b03831184841017610103578084926020946040528339810103126100ff57516001600160a01b03808216918290036100ff5760017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f005533156100e7575f549060018060a01b03199133838216175f55604051913391167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e05f80a382156100d857506003541617600355604051610c5090816101188239f35b63e6c4247b60e01b8152600490fd5b604051631e4fbdf760e01b81525f6004820152602490fd5b5f80fd5b634e487b7160e01b5f52604160045260245ffdfe604060808152600480361015610013575f80fd5b5f3560e01c80630922156f1461089a5780631bfb40bf1461086e5780631c955f421461079f578063217a4b70146107775780633bfc26871461074f57806370faad3214610646578063715018a6146105ef57806381d60b641461047e578063824e0802146103f85780638da5cb5b146103d1578063b64fb2f5146102dc578063b6c846b81461026f578063cab2ea29146101bd578063d0d66d391461018d578063e4d2620e1461015a5763f2fde38b146100cb575f80fd5b34610156576020366003190112610156576100e46109ae565b906100ed610b71565b6001600160a01b039182169283156101405750505f54826bffffffffffffffffffffffff60a01b8216175f55167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e05f80a3005b905f6024925191631e4fbdf760e01b8352820152fd5b5f80fd5b82346101565760203660031901126101565760209061018b61018261017d6109ae565b610b05565b915180926109c4565bf35b8234610156576020366003190112610156576101af6101aa6109ae565b610a8f565b825191151582526020820152f35b5090346101565780600319360112610156576101d76109ae565b91602435926007841015610156576101ed610b71565b60018060a01b031692835f526001602052825f209160ff6002840154851c161561026157509061025e826102487f33dffa87c7182434f19a40d53b9fdf8867ee02fc27395e80efd9e3c638066819959460ff85541694610a77565b610254845180946109c4565b60208301906109c4565ba2005b8351637d5d475f60e11b8152fd5b8234610156576020366003190112610156576080906001600160a01b036102946109ae565b165f52600160205260ff815f20818154169260026001830154920154916102bd825180966109c4565b602085015267ffffffffffffffff8216818501521c1615156060820152f35b5034610156575f36600319011261015657335f52600160205260ff6002835f200154831c166103c35767ffffffffffffffff90610317610a43565b915f835260208301925f8452848101938242168552606082019360018552335f526001602052865f2092519060078210156103b057509061035b8392600294610a77565b5160018201550192511660ff60401b835492511515851b169168ffffffffffffffffff191617179055515f81527f6e23d741ec26a93049357ebdc9f68c8d1fbae7fbd3af0c2512b2469abd19d99360203392a2005b602190634e487b7160e01b5f525260245ffd5b90516369783db760e01b8152fd5b8234610156575f366003190112610156575f5490516001600160a01b039091168152602090f35b509034610156576020366003190112610156576104136109ae565b61041b610b71565b6001600160a01b0316918215610470577f4f4381730fecd01da3818f9471de26fb7eb40e7e2fcda82d61a1056949c6023260208484816bffffffffffffffffffffffff60a01b600254161760025551908152a1005b905163e6c4247b60e01b8152fd5b5090346101565780600319360112610156576104986109ae565b60025460243592916001600160a01b0391821633036105df571691825f5260019160209280845260ff6002835f200154831c1615610527575b845f52808452815f2001805490838201809211610514577fb0f3106e1c10a1d80066699104da7e3d2f86db9840ae772508b4ee1496b61efe9596505551908152a2005b601187634e487b7160e01b5f525260245ffd5b67ffffffffffffffff610538610a43565b905f8252858201905f82528483019281421684526060810192858452895f52858952865f20915160078110156105cc57906105768392600294610a77565b51868201550192511660ff60401b835492511515861b169168ffffffffffffffffff191617179055847f6e23d741ec26a93049357ebdc9f68c8d1fbae7fbd3af0c2512b2469abd19d9938584515f8152a26104d1565b60218c634e487b7160e01b5f525260245ffd5b8251636c0f9f7f60e11b81528590fd5b34610156575f36600319011261015657610607610b71565b5f80546001600160a01b0319811682556001600160a01b03167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08280a3005b509034610156575f36600319011261015657610660610b2f565b335f526001602052805f20600281019081549060ff82851c161561073f5767ffffffffffffffff90816106948185166109e5565b16421061072f57600101805495861561072157505f905542169067ffffffffffffffff19161790556106d1823360018060a01b0360035416610b9c565b519081527fdfbec0477bd6ec4ed511951f322a036776fa0d097d957ee84e1d1ac2c00558b260203392a260017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f0055005b8551632676571960e01b8152fd5b8451637c17012360e01b81528690fd5b50505051637d5d475f60e11b8152fd5b8234610156575f3660031901126101565760025490516001600160a01b039091168152602090f35b8234610156575f3660031901126101565760035490516001600160a01b039091168152602090f35b509034610156576020366003190112610156576107ba6109ae565b5f60606107c5610a43565b8281528260208201528285820152015260018060a01b03165f526001602052805f20906107f0610a43565b9060ff83541692600784101561085b576080945083835260026001820154916020850192835201549267ffffffffffffffff9160ff60608584019385881685520195851c1615158552610845845180976109c4565b5160208601525116908301525115156060820152f35b602185634e487b7160e01b5f525260245ffd5b82346101565760203660031901126101565760209061089361088e6109ae565b610a14565b9051908152f35b5034610156576020366003190112610156576108b46109ae565b916108bd610b2f565b6108c5610b71565b6001600160a01b039283165f8181526001602052829020600281015491949180841c60ff161561073f576301e1338067ffffffffffffffff8092160181811161099b5716421061098d57600101805493841561097f575091610954847fb23ed7b57d31aa628f605c1b73e6b3948045a074d7e5d00b0285a5af90893a9995935f60209655600354163390610b9c565b51908152a260017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f0055005b8351632676571960e01b8152fd5b505051628a861b60e21b8152fd5b601186634e487b7160e01b5f525260245ffd5b600435906001600160a01b038216820361015657565b9060078210156109d15752565b634e487b7160e01b5f52602160045260245ffd5b9062093a8067ffffffffffffffff80931601918211610a0057565b634e487b7160e01b5f52601160045260245ffd5b60018060a01b03165f52600160205260405f2060ff600282015460401c1615610a3e576001015490565b505f90565b604051906080820182811067ffffffffffffffff821117610a6357604052565b634e487b7160e01b5f52604160045260245ffd5b9060078110156109d15760ff80198354169116179055565b60018060a01b03165f52600160205260405f2060028101549060ff8260401c1615908115610af8575b50610af157610ad167ffffffffffffffff8092166109e5565b16428111610ae157506001905f90565b90428203918211610a00575f9190565b505f905f90565b600191500154155f610ab8565b60018060a01b03165f52600160205260405f2060ff600282015460401c1615610a3e575460ff1690565b7f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f006002815414610b5f5760029055565b604051633ee5aeb560e01b8152600490fd5b5f546001600160a01b03163303610b8457565b60405163118cdaa760e01b8152336004820152602490fd5b60405163a9059cbb60e01b5f9081526001600160a01b039384166004526024949094529260209060448180855af160015f5114811615610bfb575b8360405215610be557505050565b635274afe760e01b835216600482015260249150fd5b6001811516610c1157813b15153d151616610bd7565b833d5f823e3d90fdfea26469706673582212207980614b952983549b893753edde1c05693546fe553799c1ac47b1701d5274a764736f6c63430008180033' as const
