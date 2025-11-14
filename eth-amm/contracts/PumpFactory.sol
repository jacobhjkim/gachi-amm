pragma solidity ^0.8.30;

import {IPumpFactory} from "./interfaces/IPumpFactory.sol";
import {PumpToken} from "./PumpToken.sol";
import {PumpCurve} from "./PumpCurve.sol";
import {EfficientHashLib} from "solady/utils/EfficientHashLib.sol";

contract PumpFactory is IPumpFactory {
    // ============ Storage ============

    /// @inheritdoc IPumpFactory
    mapping(address => address) public override getCurve;

    /// @notice The quote token used for all trading pairs (USDC)
    address public immutable quoteToken;

    /// @notice Uniswap v3 factory address for liquidity migration
    address public immutable uniswapV3Factory;

    /// @notice The reward contract address
    address public immutable override rewardContract;

    constructor(address _quoteToken, address _uniswapV3Factory, address _rewardContract) {
        require(_quoteToken != address(0), "Invalid quote token");
        require(_uniswapV3Factory != address(0), "Invalid Uniswap v3 factory");
        require(_rewardContract != address(0), "Invalid reward contract");
        quoteToken = _quoteToken;
        uniswapV3Factory = _uniswapV3Factory;
        rewardContract = _rewardContract;
    }

    /// @inheritdoc IPumpFactory
    function mintTokenAndCreateCurve(string memory name, string memory symbol, bytes32 requestId)
        external
        returns (address token, address curve)
    {
        // Create unique salt for this deployment using EfficientHashLib for gas efficiency
        // Salt binds to msg.sender for front-run protection
        bytes32 tokenSalt = EfficientHashLib.hash(bytes32(bytes20(uint160(msg.sender))), requestId, bytes32("TOKEN"));
        bytes32 curveSalt = EfficientHashLib.hash(bytes32(bytes20(uint160(msg.sender))), requestId, bytes32("CURVE"));

        // Step 1: Deploy token with factory as temporary recipient
        // This breaks the circular dependency between token and curve addresses
        // Pass factory address to enable setCurve and transfer restrictions
        bytes memory tokenInitCode =
            abi.encodePacked(type(PumpToken).creationCode, abi.encode(name, symbol, address(this), address(this)));

        assembly {
            token := create2(0, add(tokenInitCode, 0x20), mload(tokenInitCode), tokenSalt)
            if iszero(token) { revert(0, 0) }
        }

        // Step 2: Deploy curve with the actual token address
        bytes memory curveInitCode = abi.encodePacked(
            type(PumpCurve).creationCode, abi.encode(token, quoteToken, msg.sender, uniswapV3Factory, rewardContract)
        );

        assembly {
            curve := create2(0, add(curveInitCode, 0x20), mload(curveInitCode), curveSalt)
            if iszero(curve) { revert(0, 0) }
        }

        // Step 3: Set the curve address on the token (enables transfer restrictions)
        PumpToken(token).setCurve(curve);

        // Step 4: Transfer all tokens from factory to curve
        require(PumpToken(token).transfer(curve, PumpToken(token).TOTAL_SUPPLY()), "Token transfer failed");

        // Store the mapping
        getCurve[token] = curve;

        // Emit event with sorted token addresses for indexing
        (address token0, address token1) = token < quoteToken ? (token, quoteToken) : (quoteToken, token);

        emit CurveCreated(msg.sender, token0, token1, curve);
    }
}
