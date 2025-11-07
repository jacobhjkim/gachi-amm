// Auto-generated from MockWETH.sol
// Do not edit manually

export const MockWETHAbi = [
  {
    type: 'constructor',
    inputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'receive',
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'spender',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      {
        name: 'spender',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint8',
        internalType: 'uint8',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'mint',
    inputs: [
      {
        name: 'to',
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
    name: 'name',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      {
        name: 'to',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      {
        name: 'from',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'to',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      {
        name: 'wad',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'spender',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      {
        name: 'dst',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'wad',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      {
        name: 'from',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'to',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdrawal',
    inputs: [
      {
        name: 'src',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'wad',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'ERC20InsufficientAllowance',
    inputs: [
      {
        name: 'spender',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'allowance',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'needed',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      {
        name: 'sender',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'balance',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'needed',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InvalidApprover',
    inputs: [
      {
        name: 'approver',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InvalidReceiver',
    inputs: [
      {
        name: 'receiver',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InvalidSender',
    inputs: [
      {
        name: 'sender',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InvalidSpender',
    inputs: [
      {
        name: 'spender',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
] as const

export const MockWETHBytecode =
  '0x60803462000321576040906001600160401b0390808301828111828210176200030d578352600d81526020916c2bb930b83832b21022ba3432b960991b83830152835192848401848110838211176200030d578552600493848152630ae8aa8960e31b82820152835190838211620002fa576003928354926001968785811c95168015620002ef575b83861014620002dc578190601f9586811162000289575b50839086831160011462000226575f926200021a575b50505f1982871b1c191690871b1784555b8151948511620002075786548681811c91168015620001fc575b82821014620001e957838111620001a1575b50809285116001146200013757509383949184925f956200012b575b50501b925f19911b1c19161790555b516108ec9081620003268239f35b015193505f806200010e565b92919084601f198116885f52855f20955f905b898383106200018657505050106200016c575b50505050811b0190556200011d565b01519060f8845f19921b161c191690555f8080806200015d565b8587015189559097019694850194889350908101906200014a565b875f52815f208480880160051c820192848910620001df575b0160051c019087905b828110620001d3575050620000f2565b5f8155018790620001c3565b92508192620001ba565b602288634e487b7160e01b5f525260245ffd5b90607f1690620000e0565b604187634e487b7160e01b5f525260245ffd5b015190505f80620000b5565b90899350601f19831691885f52855f20925f5b878282106200027257505084116200025a575b505050811b018455620000c6565b01515f1983891b60f8161c191690555f80806200024c565b8385015186558d9790950194938401930162000239565b909150865f52835f208680850160051c820192868610620002d2575b918b91869594930160051c01915b828110620002c35750506200009f565b5f81558594508b9101620002b3565b92508192620002a5565b602289634e487b7160e01b5f525260245ffd5b94607f169462000088565b604186634e487b7160e01b5f525260245ffd5b634e487b7160e01b5f52604160045260245ffd5b5f80fdfe6080604090808252600480361015610029575b505050361561001f575f80fd5b610027610730565b005b5f3560e01c91826306fdde03146105e557508163095ea7b31461053d57816318160ddd1461051f57816323b872dd1461042d5781632e1a7d4d146102de578163313ce567146102c357816340c10f191461029f57816370a082311461026957816395d89b411461014a57508063a9059cbb1461011a578063d0e30db0146101075763dd62ed3e146100bb578080610012565b346101035780600319360112610103576020906100d6610704565b6100de61071a565b9060018060a01b038091165f5260018452825f2091165f528252805f20549051908152f35b5f80fd5b5f36600319011261010357610027610730565b5034610103578060031936011261010357602090610143610139610704565b6024359033610768565b5160018152f35b8234610103575f366003190112610103578051905f835460018160011c906001831692831561025f575b602093848410811461024c5783885290811561023057506001146101dc575b505050829003601f01601f191682019267ffffffffffffffff8411838510176101c957508291826101c59252826106bd565b0390f35b604190634e487b7160e01b5f525260245ffd5b5f878152929350837f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b5b83851061021c5750505050830101848080610193565b805488860183015293019284908201610206565b60ff1916878501525050151560051b8401019050848080610193565b602289634e487b7160e01b5f525260245ffd5b91607f1691610174565b8234610103576020366003190112610103576020906001600160a01b0361028e610704565b165f525f8252805f20549051908152f35b823461010357366003190112610103576100276102ba610704565b60243590610842565b8234610103575f366003190112610103576020905160128152f35b9050346101035760208060031936011261010357813591335f525f825282845f2054106103f55733156103df57335f525f8252835f2054908382106103b457508290335f525f835203835f205581600254036002555f83518381527fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef833392a3815f81156103ab575b5f80809381933390f1156103a1577f7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b659192519283523392a2005b82513d5f823e3d90fd5b506108fc610367565b845163391434e360e21b81523391810191825260208201929092526040810184905281906060010390fd5b6024905f855191634b637e8f60e11b8352820152fd5b60649184519162461bcd60e51b83528201526014602482015273496e73756666696369656e742062616c616e636560601b6044820152fd5b90503461010357606036600319011261010357610448610704565b61045061071a565b906044359260018060a01b038216805f526001602052855f20335f52602052855f2054915f19831061048b575b602087610143888888610768565b8583106104f35781156104dd5733156104c757505f9081526001602090815286822033835281529086902091859003909155829061014361047d565b6024905f885191634a1406b160e11b8352820152fd5b6024905f88519163e602df0560e01b8352820152fd5b8651637dc7a0d960e11b8152339181019182526020820193909352604081018690528291506060010390fd5b8234610103575f366003190112610103576020906002549051908152f35b8234610103578060031936011261010357610556610704565b6024359033156105cf576001600160a01b03169081156105b95760209350335f5260018452825f20825f52845280835f205582519081527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925843392a35160018152f35b8251634a1406b160e11b81525f81860152602490fd5b825163e602df0560e01b81525f81860152602490fd5b8334610103575f366003190112610103575f60035460018160011c90600183169283156106b3575b602093848410811461024c57838852908115610230575060011461065d57505050829003601f01601f191682019267ffffffffffffffff8411838510176101c957508291826101c59252826106bd565b60035f908152929350837fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b5b83851061069f5750505050830101848080610193565b805488860183015293019284908201610689565b91607f169161060d565b602080825282518183018190529093925f5b8281106106f057505060409293505f838284010152601f8019910116010190565b8181018601518482016040015285016106cf565b600435906001600160a01b038216820361010357565b602435906001600160a01b038216820361010357565b61073a3433610842565b6040513481527fe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c60203392a2565b916001600160a01b0380841692831561082a571692831561081257825f525f60205260405f2054908282106107e05750817fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef92602092855f525f84520360405f2055845f5260405f20818154019055604051908152a3565b60405163391434e360e21b81526001600160a01b03919091166004820152602481019190915260448101829052606490fd5b60405163ec442f0560e01b81525f6004820152602490fd5b604051634b637e8f60e11b81525f6004820152602490fd5b6001600160a01b031690811561081257600254908082018092116108a25760207fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef915f9360025584845283825260408420818154019055604051908152a3565b634e487b7160e01b5f52601160045260245ffdfea2646970667358221220f69864ce61798e43004b98845a2d168eb43a5a6b130ee2425b6002d72852b3ee64736f6c63430008180033' as const
