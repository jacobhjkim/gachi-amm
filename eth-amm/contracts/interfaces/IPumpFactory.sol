pragma solidity ^0.8.30;

/// @title The interface for the Pump Factory
/// @notice The Pump Factory facilitates creation of Pump bonding curves
interface IPumpFactory {
    // ============ Events ============

    /// @notice Emitted when a bonding curve is created
    /// @param creator The creator of the curve
    /// @param token0 The first token of the curve by address sort order
    /// @param token1 The second token of the curve by address sort order
    /// @param curve The address of the created curve
    event CurveCreated(address indexed creator, address indexed token0, address indexed token1, address curve);

    /// @notice Emitted when the curve graduates to DEX
    /// @param baseToken The base token of the graduated curve
    /// @param timestamp The timestamp when the curve graduated
    event CurveGraduated(address indexed baseToken, uint256 timestamp);

    // ============ Factory Functions ============

    /// @notice Returns the curve address for a given base token, or address 0 if it does not exist
    /// @param baseToken The contract address of the base token
    /// @return curve The curve address
    function getCurve(address baseToken) external view returns (address curve);

    /// @notice Mints an ERC20 token and creates a curve for the metadata
    /// @param name The name of the token
    /// @param symbol The symbol of the token
    /// @param requestId A unique identifier for this deployment (e.g., UUID from server)
    /// @dev The caller becomes the creator of the curve
    /// @dev The requestId is combined with msg.sender to create deterministic addresses via CREATE2
    /// @return token The address of the newly minted token
    /// @return curve The address of the newly created curve
    function mintTokenAndCreateCurve(string memory name, string memory symbol, bytes32 requestId)
        external
        returns (address token, address curve);

    /// @notice Returns the reward contract address
    /// @return The reward contract address
    function rewardContract() external view returns (address);
}
