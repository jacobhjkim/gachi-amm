// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LibFeeCalculator} from "./libraries/LibFeeCalculator.sol";
import {KimchiToken} from "./tokens/KimchiToken.sol";
import {
    Config,
    FeeConfig,
    BondingCurve,
    MigrationStatus,
    Constants
} from "./storage/AppStorage.sol";

/**
 * @title KimchiFactory
 * @notice Factory contract for creating tokens and managing protocol configuration
 * @dev Handles one-time initialization and token deployment with CREATE2
 */
contract KimchiFactory is Ownable {
    // ============ Storage ============

    /// @notice Protocol configuration
    Config public config;

    /// @notice Bonding curves: baseToken => BondingCurve
    mapping(address => BondingCurve) public curves;

    /// @notice Track if a curve exists
    mapping(address => bool) public curveExists;

    /// @notice Cashback contract reference
    address public cashbackContract;

    /// @notice AMM contract reference (authorized to modify curves)
    address public ammContract;

    /// @notice Salt nonce for CREATE2 deployment
    uint256 private _saltNonce;

    // ============ Events ============

    event ConfigInitialized(address admin, address feeClaimer, address quoteToken);
    event FeeClaimerUpdated(address oldFeeClaimer, address newFeeClaimer);
    event FeesUpdated(
        uint16 feeBasisPoints,
        uint16 l1ReferralFeeBasisPoints,
        uint16 l2ReferralFeeBasisPoints,
        uint16 l3ReferralFeeBasisPoints
    );
    event CashbackContractSet(address cashbackContract);
    event AMMContractSet(address ammContract);
    event CurveCreated(
        address indexed creator,
        address indexed baseToken,
        string name,
        string symbol,
        uint256 initialBaseReserve,
        uint256 initialVirtualBaseReserve,
        uint256 initialVirtualQuoteReserve
    );

    // ============ Errors ============

    error AlreadyInitialized();
    error NotInitialized();
    error InvalidAddress();
    error InvalidTokenParams();
    error CurveAlreadyExists();
    error NotAMMContract();

    // ============ Modifiers ============

    modifier whenInitialized() {
        if (!config.isInitialized) revert NotInitialized();
        _;
    }

    modifier onlyAmm() {
        if (msg.sender != ammContract) revert NotAMMContract();
        _;
    }

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {}

    // ============ Configuration Functions ============

    /// @notice Initialize the protocol configuration (one-time only)
    /// @param feeClaimer Address to receive protocol fees
    /// @param quoteToken WETH address on Optimism
    function initializeConfig(address feeClaimer, address quoteToken) external onlyOwner {
        if (config.isInitialized) revert AlreadyInitialized();
        if (feeClaimer == address(0) || quoteToken == address(0)) revert InvalidAddress();

        config.quoteToken = quoteToken;
        config.feeClaimer = feeClaimer;
        config.baseTokenDecimals = 6;
        config.quoteTokenDecimals = 18;

        _setFeeConfig();
        _setThresholds();

        config.isInitialized = true;

        // Create FeeConfig for validation to avoid stack depth issues
        FeeConfig memory feeConfig = FeeConfig({
            feeBasisPoints: config.feeBasisPoints,
            l1ReferralFeeBasisPoints: config.l1ReferralFeeBasisPoints,
            l2ReferralFeeBasisPoints: config.l2ReferralFeeBasisPoints,
            l3ReferralFeeBasisPoints: config.l3ReferralFeeBasisPoints,
            refereeDiscountBasisPoints: config.refereeDiscountBasisPoints,
            creatorFeeBasisPoints: config.creatorFeeBasisPoints
        });
        LibFeeCalculator.validateFeeConfig(feeConfig);

        emit ConfigInitialized(msg.sender, feeClaimer, quoteToken);
    }

    function _setFeeConfig() internal {
        config.feeBasisPoints = 1500;
        config.l1ReferralFeeBasisPoints = 300;
        config.l2ReferralFeeBasisPoints = 30;
        config.l3ReferralFeeBasisPoints = 20;
        config.refereeDiscountBasisPoints = 100;
        config.creatorFeeBasisPoints = 500;
        config.migrationFeeBasisPoints = 5000;
    }

    function _setThresholds() internal {
        config.migrationBaseThreshold = 200_000_000_000_000;
        config.migrationQuoteThreshold = 115_005_359_056 ether / 1e9;
        config.initialVirtualQuoteReserve = 30 ether;
        config.initialVirtualBaseReserve = 1_073_000_000_000_000;
    }

    /// @notice Set the cashback contract address
    /// @param _cashbackContract Address of the cashback contract
    function setCashbackContract(address _cashbackContract) external onlyOwner {
        if (_cashbackContract == address(0)) revert InvalidAddress();
        cashbackContract = _cashbackContract;
        emit CashbackContractSet(_cashbackContract);
    }

    /// @notice Set the AMM contract address
    /// @param _ammContract Address of the AMM contract
    function setAmmContract(address _ammContract) external onlyOwner {
        if (_ammContract == address(0)) revert InvalidAddress();
        ammContract = _ammContract;
        emit AMMContractSet(_ammContract);
    }

    /// @notice Update the fee claimer address
    /// @param newFeeClaimer New fee claimer address
    function updateFeeClaimer(address newFeeClaimer) external onlyOwner whenInitialized {
        if (newFeeClaimer == address(0)) revert InvalidAddress();

        address oldFeeClaimer = config.feeClaimer;
        config.feeClaimer = newFeeClaimer;

        emit FeeClaimerUpdated(oldFeeClaimer, newFeeClaimer);
    }

    /// @notice Update fee configuration
    function updateFees(
        uint16 feeBasisPoints,
        uint16 l1ReferralFeeBasisPoints,
        uint16 l2ReferralFeeBasisPoints,
        uint16 l3ReferralFeeBasisPoints
    ) external onlyOwner whenInitialized {
        config.feeBasisPoints = feeBasisPoints;
        config.l1ReferralFeeBasisPoints = l1ReferralFeeBasisPoints;
        config.l2ReferralFeeBasisPoints = l2ReferralFeeBasisPoints;
        config.l3ReferralFeeBasisPoints = l3ReferralFeeBasisPoints;

        // Create FeeConfig for validation to avoid stack depth issues
        FeeConfig memory feeConfig = FeeConfig({
            feeBasisPoints: config.feeBasisPoints,
            l1ReferralFeeBasisPoints: config.l1ReferralFeeBasisPoints,
            l2ReferralFeeBasisPoints: config.l2ReferralFeeBasisPoints,
            l3ReferralFeeBasisPoints: config.l3ReferralFeeBasisPoints,
            refereeDiscountBasisPoints: config.refereeDiscountBasisPoints,
            creatorFeeBasisPoints: config.creatorFeeBasisPoints
        });
        LibFeeCalculator.validateFeeConfig(feeConfig);

        emit FeesUpdated(feeBasisPoints, l1ReferralFeeBasisPoints, l2ReferralFeeBasisPoints, l3ReferralFeeBasisPoints);
    }

    // ============ Curve Factory Functions ============

    /// @notice Create a new bonding curve with a new token (using CREATE2)
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param salt Salt for CREATE2 deployment
    /// @return baseToken Address of the created token
    function createCurve(string memory name, string memory symbol, bytes32 salt)
        external
        whenInitialized
        returns (address baseToken)
    {
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidTokenParams();

        baseToken = _deployToken(name, symbol, salt);
        if (curveExists[baseToken]) revert CurveAlreadyExists();

        _initializeCurve(baseToken, name, symbol);
    }

    /// @notice Deploy token using CREATE2
    function _deployToken(string memory name, string memory symbol, bytes32 salt) internal returns (address baseToken) {
        bytes32 finalSalt = keccak256(abi.encodePacked(salt, _saltNonce++));
        bytes memory bytecode = abi.encodePacked(type(KimchiToken).creationCode, abi.encode(name, symbol, address(this)));

        assembly ("memory-safe") {
            baseToken := create2(0, add(bytecode, 32), mload(bytecode), finalSalt)
        }

        if (baseToken == address(0)) revert InvalidTokenParams();
    }

    /// @notice Initialize bonding curve for a token
    function _initializeCurve(address baseToken, string memory name, string memory symbol) internal {
        BondingCurve storage curve = curves[baseToken];
        curve.creator = msg.sender;
        curve.baseToken = baseToken;
        curve.baseReserve = Constants.TOKEN_TOTAL_SUPPLY;
        curve.quoteReserve = 0;
        curve.virtualBaseReserve = config.initialVirtualBaseReserve;
        curve.virtualQuoteReserve = config.initialVirtualQuoteReserve;
        curve.protocolFee = 0;
        curve.creatorFee = 0;
        curve.migrationStatus = MigrationStatus.PreBondingCurve;
        curve.curveFinishTimestamp = 0;

        curveExists[baseToken] = true;

        emit CurveCreated(msg.sender, baseToken, name, symbol, curve.baseReserve, curve.virtualBaseReserve, curve.virtualQuoteReserve);
    }

    // ============ AMM Functions (Only callable by AMM contract) ============

    /// @notice Update curve reserves after buy (only AMM)
    /// @dev params: [quoteIn, baseOut, protocolFee, creatorFee]
    function updateCurveAfterBuy(address baseToken, uint256[4] calldata params) external onlyAmm {
        BondingCurve storage curve = curves[baseToken];
        curve.quoteReserve += params[0];
        curve.virtualQuoteReserve += params[0];
        curve.baseReserve -= params[1];
        curve.virtualBaseReserve -= params[1];
        curve.protocolFee += params[2];
        curve.creatorFee += params[3];
    }

    /// @notice Update curve reserves after sell (only AMM)
    /// @dev params: [baseIn, quoteOut, protocolFee, creatorFee]
    function updateCurveAfterSell(address baseToken, uint256[4] calldata params) external onlyAmm {
        BondingCurve storage curve = curves[baseToken];
        curve.baseReserve += params[0];
        curve.virtualBaseReserve += params[0];
        curve.quoteReserve -= params[1];
        curve.virtualQuoteReserve -= params[1];
        curve.protocolFee += params[2];
        curve.creatorFee += params[3];
    }

    /// @notice Mark curve as graduated (only AMM)
    function graduateCurve(address baseToken) external onlyAmm {
        BondingCurve storage curve = curves[baseToken];
        curve.migrationStatus = MigrationStatus.PostBondingCurve;
        curve.curveFinishTimestamp = uint64(block.timestamp);
    }

    /// @notice Reset protocol fee after claiming (only AMM)
    function resetProtocolFee(address baseToken) external onlyAmm {
        curves[baseToken].protocolFee = 0;
    }

    /// @notice Reset creator fee after claiming (only AMM)
    function resetCreatorFee(address baseToken) external onlyAmm {
        curves[baseToken].creatorFee = 0;
    }

    // ============ View Functions ============

    /// @notice Compute the CREATE2 address for a token before deployment
    function computeTokenAddress(string memory name, string memory symbol, bytes32 salt)
        external
        view
        returns (address predictedAddress)
    {
        bytes memory bytecode = abi.encodePacked(
            type(KimchiToken).creationCode,
            abi.encode(name, symbol, address(this))
        );

        bytes32 finalSalt = keccak256(abi.encodePacked(salt, _saltNonce));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), finalSalt, keccak256(bytecode)));

        predictedAddress = address(uint160(uint256(hash)));
    }

    /// @notice Get protocol configuration
    function getConfig() external view returns (Config memory) {
        return config;
    }

    /// @notice Get bonding curve information
    function getCurve(address baseToken) external view returns (BondingCurve memory curve) {
        curve = curves[baseToken];
    }

    /// @notice Get current price for a bonding curve
    function getPrice(address baseToken) external view returns (uint256 price) {
        BondingCurve storage curve = curves[baseToken];

        if (curve.virtualBaseReserve == 0) return 0;

        uint256 virtualBaseScaled = curve.virtualBaseReserve * Constants.DECIMAL_SCALE;
        price = (curve.virtualQuoteReserve * 1e18) / virtualBaseScaled;
    }
}
