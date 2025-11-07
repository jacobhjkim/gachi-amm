// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KimchiToken} from "../../src/tokens/KimchiToken.sol";
import {Constants} from "../../src/storage/AppStorage.sol";

/**
 * @title KimchiTokenTest
 * @notice Tests for ERC20 token with EIP-2612 Permit functionality
 */
contract KimchiTokenTest is Test {
    KimchiToken public token;

    address public constant FACTORY = address(0x1);
    address public constant ALICE = address(0x2);
    address public constant BOB = address(0x3);
    address public constant CHARLIE = address(0x4);

    // Private key for permit testing
    uint256 constant ALICE_PRIVATE_KEY = 0xA11CE;
    address aliceAddr;

    function setUp() public {
        // Create Alice's address from private key
        aliceAddr = vm.addr(ALICE_PRIVATE_KEY);

        // Deploy token with FACTORY as recipient
        token = new KimchiToken("Test Token", "TEST", FACTORY);
    }

    // =============================================================
    //                  BASIC ERC20 TESTS
    // =============================================================

    function test_name() public {
        assertEq(token.name(), "Test Token", "Name should be 'Test Token'");
    }

    function test_symbol() public {
        assertEq(token.symbol(), "TEST", "Symbol should be 'TEST'");
    }

    function test_decimals() public {
        assertEq(token.decimals(), 6, "Decimals should be 6");
    }

    function test_totalSupply() public {
        assertEq(
            token.totalSupply(),
            Constants.TOKEN_TOTAL_SUPPLY,
            "Total supply should be 1 billion with 6 decimals"
        );
    }

    function test_initialBalance() public {
        assertEq(
            token.balanceOf(FACTORY),
            Constants.TOKEN_TOTAL_SUPPLY,
            "Factory should have all tokens initially"
        );
    }

    function test_transfer() public {
        uint256 amount = 1_000_000_000; // 1M tokens

        vm.prank(FACTORY);
        bool success = token.transfer(ALICE, amount);

        assertTrue(success, "Transfer should succeed");
        assertEq(token.balanceOf(ALICE), amount, "Alice should have received tokens");
        assertEq(
            token.balanceOf(FACTORY),
            Constants.TOKEN_TOTAL_SUPPLY - amount,
            "Factory balance should decrease"
        );
    }

    function test_transfer_InsufficientBalance() public {
        uint256 amount = Constants.TOKEN_TOTAL_SUPPLY + 1;

        vm.prank(FACTORY);
        vm.expectRevert();
        token.transfer(ALICE, amount);
    }

    function test_approve() public {
        uint256 amount = 1_000_000_000;

        vm.prank(FACTORY);
        bool success = token.approve(ALICE, amount);

        assertTrue(success, "Approve should succeed");
        assertEq(token.allowance(FACTORY, ALICE), amount, "Allowance should be set");
    }

    function test_transferFrom() public {
        uint256 amount = 1_000_000_000;

        // Factory approves Alice to spend tokens
        vm.prank(FACTORY);
        token.approve(ALICE, amount);

        // Alice transfers from Factory to Bob
        vm.prank(ALICE);
        bool success = token.transferFrom(FACTORY, BOB, amount);

        assertTrue(success, "TransferFrom should succeed");
        assertEq(token.balanceOf(BOB), amount, "Bob should have received tokens");
        assertEq(token.allowance(FACTORY, ALICE), 0, "Allowance should be consumed");
    }

    function test_transferFrom_InsufficientAllowance() public {
        uint256 amount = 1_000_000_000;

        // No approval given

        vm.prank(ALICE);
        vm.expectRevert();
        token.transferFrom(FACTORY, BOB, amount);
    }

    // =============================================================
    //                  EIP-2612 PERMIT TESTS
    // =============================================================

    function test_permit_ValidSignature() public {
        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Transfer tokens to Alice first
        vm.prank(FACTORY);
        token.transfer(aliceAddr, amount);

        // Get permit signature
        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );

        // Anyone can submit the permit
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);

        // Verify allowance was set
        assertEq(token.allowance(aliceAddr, BOB), amount, "Allowance should be set via permit");

        // Verify nonce was incremented
        assertEq(token.nonces(aliceAddr), 1, "Nonce should be incremented");
    }

    function test_permit_InvalidSignature() public {
        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Get valid signature for Alice
        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );

        // Try to use it for ALICE (different address)
        vm.expectRevert();
        token.permit(ALICE, BOB, amount, deadline, v, r, s);
    }

    function test_permit_ExpiredDeadline() public {
        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp - 1; // Expired

        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );

        vm.expectRevert();
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);
    }

    function test_permit_InvalidNonce() public {
        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Get signature with wrong nonce (1 instead of 0)
        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            1, // Wrong nonce
            deadline,
            ALICE_PRIVATE_KEY
        );

        vm.expectRevert();
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);
    }

    function test_permit_ReplayProtection() public {
        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Transfer tokens to Alice
        vm.prank(FACTORY);
        token.transfer(aliceAddr, amount * 2);

        // Get permit signature
        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );

        // Use permit once
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);

        // Try to replay the same signature
        vm.expectRevert();
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);
    }

    function test_permit_MultiplePermits() public {
        uint256 amount1 = 1_000_000_000;
        uint256 amount2 = 2_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Transfer tokens to Alice
        vm.prank(FACTORY);
        token.transfer(aliceAddr, amount1 + amount2);

        // First permit to BOB
        (uint8 v1, bytes32 r1, bytes32 s1) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount1,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );
        token.permit(aliceAddr, BOB, amount1, deadline, v1, r1, s1);

        // Second permit to CHARLIE (nonce is now 1)
        (uint8 v2, bytes32 r2, bytes32 s2) = _getPermitSignature(
            aliceAddr,
            CHARLIE,
            amount2,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );
        token.permit(aliceAddr, CHARLIE, amount2, deadline, v2, r2, s2);

        // Verify both allowances
        assertEq(token.allowance(aliceAddr, BOB), amount1, "Bob allowance should be set");
        assertEq(token.allowance(aliceAddr, CHARLIE), amount2, "Charlie allowance should be set");
        assertEq(token.nonces(aliceAddr), 2, "Nonce should be 2");
    }

    function test_permit_ThenTransferFrom() public {
        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Transfer tokens to Alice
        vm.prank(FACTORY);
        token.transfer(aliceAddr, amount);

        // Get permit signature
        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );

        // Submit permit
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);

        // Bob uses the allowance to transfer to Charlie
        vm.prank(BOB);
        token.transferFrom(aliceAddr, CHARLIE, amount);

        assertEq(token.balanceOf(CHARLIE), amount, "Charlie should receive tokens");
        assertEq(token.balanceOf(aliceAddr), 0, "Alice should have 0 tokens");
        assertEq(token.allowance(aliceAddr, BOB), 0, "Allowance should be consumed");
    }

    function test_DOMAIN_SEPARATOR() public {
        bytes32 domainSeparator = token.DOMAIN_SEPARATOR();

        // Domain separator should be non-zero
        assertTrue(domainSeparator != bytes32(0), "Domain separator should not be zero");

        // Should be deterministic
        assertEq(token.DOMAIN_SEPARATOR(), domainSeparator, "Domain separator should be constant");
    }

    function test_nonces() public {
        // Initial nonce should be 0
        assertEq(token.nonces(aliceAddr), 0, "Initial nonce should be 0");

        uint256 amount = 1_000_000_000;
        uint256 deadline = block.timestamp + 1 hours;

        // Transfer tokens to Alice
        vm.prank(FACTORY);
        token.transfer(aliceAddr, amount);

        // Submit permit (increments nonce)
        (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(
            aliceAddr,
            BOB,
            amount,
            token.nonces(aliceAddr),
            deadline,
            ALICE_PRIVATE_KEY
        );
        token.permit(aliceAddr, BOB, amount, deadline, v, r, s);

        // Nonce should be incremented
        assertEq(token.nonces(aliceAddr), 1, "Nonce should be 1 after permit");
    }

    // =============================================================
    //                  EDGE CASES
    // =============================================================

    function test_transfer_ZeroAmount() public {
        vm.prank(FACTORY);
        bool success = token.transfer(ALICE, 0);

        assertTrue(success, "Zero amount transfer should succeed");
        assertEq(token.balanceOf(ALICE), 0, "Alice should have 0 tokens");
    }

    function test_approve_ZeroAmount() public {
        vm.prank(FACTORY);
        bool success = token.approve(ALICE, 0);

        assertTrue(success, "Zero amount approval should succeed");
        assertEq(token.allowance(FACTORY, ALICE), 0, "Allowance should be 0");
    }

    function test_multipleTransfers() public {
        uint256 amount = 100_000_000;

        // Factory -> Alice
        vm.prank(FACTORY);
        token.transfer(ALICE, amount);

        // Alice -> Bob
        vm.prank(ALICE);
        token.transfer(BOB, amount);

        // Bob -> Charlie
        vm.prank(BOB);
        token.transfer(CHARLIE, amount);

        assertEq(token.balanceOf(CHARLIE), amount, "Charlie should have tokens");
        assertEq(token.balanceOf(BOB), 0, "Bob should have 0");
        assertEq(token.balanceOf(ALICE), 0, "Alice should have 0");
    }

    // =============================================================
    //                  HELPER FUNCTIONS
    // =============================================================

    function _getPermitSignature(
        address owner,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline,
        uint256 privateKey
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                value,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));

        (v, r, s) = vm.sign(privateKey, digest);
    }
}
