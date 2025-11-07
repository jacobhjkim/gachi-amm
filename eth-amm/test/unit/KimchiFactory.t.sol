// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KimchiFactory} from "../../src/KimchiFactory.sol";
import {KimchiToken} from "../../src/tokens/KimchiToken.sol";
import {MockWETH} from "../helpers/MockWETH.sol";
import {Config, BondingCurve, MigrationStatus, Constants} from "../../src/storage/AppStorage.sol";

/**
 * @title KimchiFactoryTest
 * @notice Tests for factory contract - token creation, config management
 */
contract KimchiFactoryTest is Test {
    KimchiFactory public factory;
    MockWETH public weth;

    address public constant OWNER = address(0x1);
    address public constant FEE_CLAIMER = address(0x2);
    address public constant AMM_CONTRACT = address(0x3);
    address public constant CASHBACK_CONTRACT = address(0x4);
    address public constant ALICE = address(0x5);
    address public constant BOB = address(0x6);

    event ConfigInitialized(address admin, address feeClaimer, address quoteToken);
    event CurveCreated(
        address indexed creator,
        address indexed baseToken,
        string name,
        string symbol,
        uint256 initialBaseReserve,
        uint256 initialVirtualBaseReserve,
        uint256 initialVirtualQuoteReserve
    );
    event FeeClaimerUpdated(address oldFeeClaimer, address newFeeClaimer);
    event FeesUpdated(
        uint16 feeBasisPoints,
        uint16 l1ReferralFeeBasisPoints,
        uint16 l2ReferralFeeBasisPoints,
        uint16 l3ReferralFeeBasisPoints
    );

    function setUp() public {
        weth = new MockWETH();

        vm.prank(OWNER);
        factory = new KimchiFactory();
    }

    // =============================================================
    //                  INITIALIZATION TESTS
    // =============================================================

    function test_initializeConfig() public {
        vm.prank(OWNER);
        vm.expectEmit(true, true, true, true);
        emit ConfigInitialized(OWNER, FEE_CLAIMER, address(weth));
        factory.initializeConfig(FEE_CLAIMER, address(weth));

        Config memory config = factory.getConfig();

        assertTrue(config.isInitialized, "Should be initialized");
        assertEq(config.feeClaimer, FEE_CLAIMER, "Fee claimer should be set");
        assertEq(config.quoteToken, address(weth), "Quote token should be WETH");
        assertEq(config.baseTokenDecimals, 6, "Base decimals should be 6");
        assertEq(config.quoteTokenDecimals, 18, "Quote decimals should be 18");

        // Check fee config
        assertEq(config.feeBasisPoints, 1500, "Fee should be 1.5%");
        assertEq(config.l1ReferralFeeBasisPoints, 300, "L1 fee should be 0.3%");
        assertEq(config.l2ReferralFeeBasisPoints, 30, "L2 fee should be 0.03%");
        assertEq(config.l3ReferralFeeBasisPoints, 20, "L3 fee should be 0.02%");
        assertEq(config.refereeDiscountBasisPoints, 100, "Discount should be 0.1%");
        assertEq(config.creatorFeeBasisPoints, 500, "Creator fee should be 0.5%");

        // Check thresholds
        assertEq(config.migrationBaseThreshold, 200_000_000_000_000, "Base threshold should be 200M");
        assertEq(config.initialVirtualQuoteReserve, 30 ether, "Initial virtual quote should be 30 ETH");
        assertEq(config.initialVirtualBaseReserve, 1_073_000_000_000_000, "Initial virtual base should be 1.073B");
    }

    function test_initializeConfig_OnlyOwner() public {
        vm.prank(ALICE);
        vm.expectRevert();
        factory.initializeConfig(FEE_CLAIMER, address(weth));
    }

    function test_initializeConfig_CannotReinitialize() public {
        vm.startPrank(OWNER);
        factory.initializeConfig(FEE_CLAIMER, address(weth));

        vm.expectRevert(KimchiFactory.AlreadyInitialized.selector);
        factory.initializeConfig(FEE_CLAIMER, address(weth));
        vm.stopPrank();
    }

    function test_initializeConfig_InvalidAddress() public {
        vm.startPrank(OWNER);

        // Zero fee claimer
        vm.expectRevert(KimchiFactory.InvalidAddress.selector);
        factory.initializeConfig(address(0), address(weth));

        // Zero quote token
        vm.expectRevert(KimchiFactory.InvalidAddress.selector);
        factory.initializeConfig(FEE_CLAIMER, address(0));

        vm.stopPrank();
    }

    // =============================================================
    //                  CONTRACT SETUP TESTS
    // =============================================================

    function test_setCashbackContract() public {
        _initializeFactory();

        vm.prank(OWNER);
        factory.setCashbackContract(CASHBACK_CONTRACT);

        assertEq(factory.cashbackContract(), CASHBACK_CONTRACT, "Cashback contract should be set");
    }

    function test_setCashbackContract_OnlyOwner() public {
        _initializeFactory();

        vm.prank(ALICE);
        vm.expectRevert();
        factory.setCashbackContract(CASHBACK_CONTRACT);
    }

    function test_setAmmContract() public {
        _initializeFactory();

        vm.prank(OWNER);
        factory.setAmmContract(AMM_CONTRACT);

        assertEq(factory.ammContract(), AMM_CONTRACT, "AMM contract should be set");
    }

    function test_setAmmContract_OnlyOwner() public {
        _initializeFactory();

        vm.prank(ALICE);
        vm.expectRevert();
        factory.setAmmContract(AMM_CONTRACT);
    }

    // =============================================================
    //                  TOKEN CREATION TESTS
    // =============================================================

    function test_createCurve() public {
        _initializeFactory();

        string memory name = "Test Token";
        string memory symbol = "TEST";
        bytes32 salt = keccak256("salt1");

        vm.prank(ALICE);
        // Don't test exact event values, just check creation succeeds
        address tokenAddress = factory.createCurve(name, symbol, salt);

        assertTrue(tokenAddress != address(0), "Token should be created");
        assertTrue(factory.curveExists(tokenAddress), "Curve should exist");

        // Verify token properties
        KimchiToken token = KimchiToken(tokenAddress);
        assertEq(token.name(), name, "Token name should match");
        assertEq(token.symbol(), symbol, "Token symbol should match");
        assertEq(token.decimals(), 6, "Token should have 6 decimals");
        assertEq(token.totalSupply(), Constants.TOKEN_TOTAL_SUPPLY, "Total supply should be 1B");
        assertEq(token.balanceOf(address(factory)), Constants.TOKEN_TOTAL_SUPPLY, "Factory should hold all tokens");

        // Verify curve state
        BondingCurve memory curve = factory.getCurve(tokenAddress);
        assertEq(curve.creator, ALICE, "Creator should be Alice");
        assertEq(curve.baseToken, tokenAddress, "Base token should match");
        assertEq(curve.baseReserve, Constants.TOKEN_TOTAL_SUPPLY, "Base reserve should be 1B");
        assertEq(curve.quoteReserve, 0, "Quote reserve should start at 0");
        assertEq(curve.virtualBaseReserve, 1_073_000_000_000_000, "Virtual base should match config");
        assertEq(curve.virtualQuoteReserve, 30 ether, "Virtual quote should be 30 ETH");
        assertEq(uint(curve.migrationStatus), uint(MigrationStatus.PreBondingCurve), "Should be PreBondingCurve");
    }

    function test_createCurve_RequiresInitialization() public {
        vm.prank(ALICE);
        vm.expectRevert(KimchiFactory.NotInitialized.selector);
        factory.createCurve("Test", "TEST", bytes32(0));
    }

    function test_createCurve_InvalidParams() public {
        _initializeFactory();

        vm.startPrank(ALICE);

        // Empty name
        vm.expectRevert(KimchiFactory.InvalidTokenParams.selector);
        factory.createCurve("", "TEST", bytes32(0));

        // Empty symbol
        vm.expectRevert(KimchiFactory.InvalidTokenParams.selector);
        factory.createCurve("Test", "", bytes32(0));

        vm.stopPrank();
    }

    function test_createCurve_DeterministicAddress() public {
        _initializeFactory();

        string memory name = "Test Token";
        string memory symbol = "TEST";
        bytes32 salt = keccak256("salt1");

        // Compute address before creation
        address expectedAddress = factory.computeTokenAddress(name, symbol, salt);

        // Create token
        vm.prank(ALICE);
        address actualAddress = factory.createCurve(name, symbol, salt);

        assertEq(actualAddress, expectedAddress, "Address should match computed address");
    }

    function test_createCurve_MultipleTokens() public {
        _initializeFactory();

        vm.startPrank(ALICE);
        address token1 = factory.createCurve("Token1", "TK1", keccak256("salt1"));
        address token2 = factory.createCurve("Token2", "TK2", keccak256("salt2"));
        address token3 = factory.createCurve("Token3", "TK3", keccak256("salt3"));
        vm.stopPrank();

        assertTrue(token1 != token2, "Tokens should have different addresses");
        assertTrue(token2 != token3, "Tokens should have different addresses");
        assertTrue(token1 != token3, "Tokens should have different addresses");

        assertTrue(factory.curveExists(token1), "Curve 1 should exist");
        assertTrue(factory.curveExists(token2), "Curve 2 should exist");
        assertTrue(factory.curveExists(token3), "Curve 3 should exist");
    }

    // =============================================================
    //                  CURVE UPDATE TESTS (AMM ONLY)
    // =============================================================

    function test_updateCurveAfterBuy() public {
        address token = _createTestToken();
        _setupAMM();

        uint256[4] memory params;
        params[0] = 1 ether;      // quoteIn
        params[1] = 10_000_000_000; // baseOut
        params[2] = 0.005 ether;  // protocolFee
        params[3] = 0.001 ether;  // creatorFee

        vm.prank(AMM_CONTRACT);
        factory.updateCurveAfterBuy(token, params);

        BondingCurve memory curve = factory.getCurve(token);
        assertEq(curve.quoteReserve, 1 ether, "Quote reserve should increase");
        assertEq(curve.virtualQuoteReserve, 31 ether, "Virtual quote should increase");
        assertEq(curve.baseReserve, Constants.TOKEN_TOTAL_SUPPLY - 10_000_000_000, "Base reserve should decrease");
        assertEq(curve.protocolFee, 0.005 ether, "Protocol fee should accumulate");
        assertEq(curve.creatorFee, 0.001 ether, "Creator fee should accumulate");
    }

    function test_updateCurveAfterBuy_OnlyAMM() public {
        address token = _createTestToken();

        uint256[4] memory params;
        params[0] = 1 ether;
        params[1] = 10_000_000_000;
        params[2] = 0.005 ether;
        params[3] = 0.001 ether;

        vm.prank(ALICE);
        vm.expectRevert(KimchiFactory.NotAMMContract.selector);
        factory.updateCurveAfterBuy(token, params);
    }

    function test_updateCurveAfterSell() public {
        address token = _createTestToken();
        _setupAMM();

        // First do a buy to have some quote reserve
        uint256[4] memory buyParams;
        buyParams[0] = 2 ether;
        buyParams[1] = 10_000_000_000;
        buyParams[2] = 0.01 ether;
        buyParams[3] = 0.002 ether;
        vm.prank(AMM_CONTRACT);
        factory.updateCurveAfterBuy(token, buyParams);

        // Now do a sell
        // Note: params[0] is baseIn, params[1] is quoteOut
        uint256[4] memory sellParams;
        sellParams[0] = 5_000_000_000; // baseIn (tokens going back)
        sellParams[1] = 0.5 ether;     // quoteOut (ETH going out)
        sellParams[2] = 0.0025 ether;  // protocolFee
        sellParams[3] = 0.0005 ether;   // creatorFee

        vm.prank(AMM_CONTRACT);
        factory.updateCurveAfterSell(token, sellParams);

        BondingCurve memory curve = factory.getCurve(token);
        // Quote reserve should be 2 ETH - 0.5 ETH = 1.5 ETH
        assertEq(curve.quoteReserve, 1.5 ether, "Quote reserve should decrease after sell");
        // Base reserve: started at 1B, bought 10B, sold 5B = 1B - 10B + 5B
        assertEq(
            curve.baseReserve,
            Constants.TOKEN_TOTAL_SUPPLY - 10_000_000_000 + 5_000_000_000,
            "Base reserve should increase after sell"
        );
    }

    function test_graduateCurve() public {
        address token = _createTestToken();
        _setupAMM();

        vm.prank(AMM_CONTRACT);
        factory.graduateCurve(token);

        BondingCurve memory curve = factory.getCurve(token);
        assertEq(uint(curve.migrationStatus), uint(MigrationStatus.PostBondingCurve), "Should be PostBondingCurve");
        assertGt(curve.curveFinishTimestamp, 0, "Finish timestamp should be set");
    }

    function test_resetProtocolFee() public {
        address token = _createTestToken();
        _setupAMM();

        // Accumulate some fees
        uint256[4] memory params;
        params[0] = 1 ether;
        params[1] = 10_000_000_000;
        params[2] = 0.005 ether;
        params[3] = 0.001 ether;
        vm.prank(AMM_CONTRACT);
        factory.updateCurveAfterBuy(token, params);

        // Reset
        vm.prank(AMM_CONTRACT);
        factory.resetProtocolFee(token);

        BondingCurve memory curve = factory.getCurve(token);
        assertEq(curve.protocolFee, 0, "Protocol fee should be reset");
    }

    function test_resetCreatorFee() public {
        address token = _createTestToken();
        _setupAMM();

        // Accumulate some fees
        uint256[4] memory params;
        params[0] = 1 ether;
        params[1] = 10_000_000_000;
        params[2] = 0.005 ether;
        params[3] = 0.001 ether;
        vm.prank(AMM_CONTRACT);
        factory.updateCurveAfterBuy(token, params);

        // Reset
        vm.prank(AMM_CONTRACT);
        factory.resetCreatorFee(token);

        BondingCurve memory curve = factory.getCurve(token);
        assertEq(curve.creatorFee, 0, "Creator fee should be reset");
    }

    // =============================================================
    //                  CONFIG UPDATE TESTS
    // =============================================================

    function test_updateFeeClaimer() public {
        _initializeFactory();

        address newClaimer = address(0x999);

        vm.prank(OWNER);
        vm.expectEmit(true, true, true, true);
        emit FeeClaimerUpdated(FEE_CLAIMER, newClaimer);
        factory.updateFeeClaimer(newClaimer);

        Config memory config = factory.getConfig();
        assertEq(config.feeClaimer, newClaimer, "Fee claimer should be updated");
    }

    function test_updateFeeClaimer_OnlyOwner() public {
        _initializeFactory();

        vm.prank(ALICE);
        vm.expectRevert();
        factory.updateFeeClaimer(address(0x999));
    }

    function test_updateFees() public {
        _initializeFactory();

        vm.prank(OWNER);
        vm.expectEmit(true, true, true, true);
        emit FeesUpdated(1400, 250, 25, 15);
        factory.updateFees(1400, 250, 25, 15);

        Config memory config = factory.getConfig();
        assertEq(config.feeBasisPoints, 1400, "Fee should be updated");
        assertEq(config.l1ReferralFeeBasisPoints, 250, "L1 fee should be updated");
        assertEq(config.l2ReferralFeeBasisPoints, 25, "L2 fee should be updated");
        assertEq(config.l3ReferralFeeBasisPoints, 15, "L3 fee should be updated");
    }

    function test_updateFees_OnlyOwner() public {
        _initializeFactory();

        vm.prank(ALICE);
        vm.expectRevert();
        factory.updateFees(1400, 250, 25, 15);
    }

    // =============================================================
    //                  VIEW FUNCTION TESTS
    // =============================================================

    function test_getConfig() public {
        _initializeFactory();

        Config memory config = factory.getConfig();

        assertTrue(config.isInitialized, "Should be initialized");
        assertEq(config.quoteToken, address(weth), "Quote token should match");
    }

    function test_getCurve() public {
        address token = _createTestToken();

        BondingCurve memory curve = factory.getCurve(token);

        assertEq(curve.baseToken, token, "Base token should match");
        assertEq(curve.creator, ALICE, "Creator should match");
    }

    function test_getPrice() public {
        address token = _createTestToken();

        uint256 price = factory.getPrice(token);

        assertGt(price, 0, "Price should be > 0");

        // Price should be in a reasonable range (similar to bonding curve tests)
        assertGt(price, 27 ether, "Price should be > 27");
        assertLt(price, 29 ether, "Price should be < 29");
    }

    function test_computeTokenAddress() public {
        _initializeFactory();

        string memory name = "Test Token";
        string memory symbol = "TEST";
        bytes32 salt = keccak256("salt1");

        address computed = factory.computeTokenAddress(name, symbol, salt);

        vm.prank(ALICE);
        address actual = factory.createCurve(name, symbol, salt);

        assertEq(computed, actual, "Computed address should match actual");
    }

    // =============================================================
    //                  HELPER FUNCTIONS
    // =============================================================

    function _initializeFactory() internal {
        vm.prank(OWNER);
        factory.initializeConfig(FEE_CLAIMER, address(weth));
    }

    function _setupAMM() internal {
        vm.prank(OWNER);
        factory.setAmmContract(AMM_CONTRACT);
    }

    function _createTestToken() internal returns (address) {
        _initializeFactory();

        vm.prank(ALICE);
        return factory.createCurve("Test Token", "TEST", keccak256("salt1"));
    }
}
