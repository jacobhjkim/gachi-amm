---
description: Use cheatcodes to manipulate blockchain state, test reverts, and verify events in your smart contract tests.
---

## Cheatcodes

Most of the time, simply testing your smart contracts outputs isn't enough. To manipulate the state of the blockchain, as well as test for specific reverts and events, Foundry is shipped with a set of cheatcodes.

Cheatcodes allow you to change the block number, your identity, and more. They are invoked by calling specific functions on a specially designated address: `0x7109709ECfa91a80626fF3989D68f67F5b1DD12D`.

You can access cheatcodes easily via the `vm` instance available in Forge Standard Library's `Test` contract. Forge Standard Library is explained in greater detail in the following [section](/forge/tests/forge-std).

Let's write a test for a smart contract that is only callable by its owner.

```solidity
pragma solidity 0.8.10;

import {Test} from "forge-std/Test.sol";

error Unauthorized();

contract OwnerUpOnly {
    address public immutable owner;
    uint256 public count;

    constructor() {
        owner = msg.sender;
    }

    function increment() external {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        count++;
    }
}

contract OwnerUpOnlyTest is Test {
    OwnerUpOnly upOnly;

    function setUp() public {
        upOnly = new OwnerUpOnly();
    }

    function test_IncrementAsOwner() public {
        assertEq(upOnly.count(), 0);
        upOnly.increment();
        assertEq(upOnly.count(), 1);
    }
}
```

If we run `forge test` now, we will see that the test passes, since `OwnerUpOnlyTest` is the owner of `OwnerUpOnly`.

```sh
forge test
```

Let's make sure that someone who is definitely not the owner can't increment the count, by using the `expectRevert` cheatcode:

```solidity
contract OwnerUpOnlyTest is Test {
    OwnerUpOnly upOnly;

    // ...

    function test_RevertWhen_CallerIsNotOwner() public {
        vm.expectRevert(Unauthorized.selector);
        vm.prank(address(0));
        upOnly.increment();
    }
}
```

If we run `forge test` one last time, we see that the test still passes, but this time we are sure that it will always fail if we revert for any other reason.

```bash
forge test
No files changed, compilation skipped
 
Ran 1 test for test/OwnerUpOnly.t.sol:OwnerUpOnlyTest
[PASS] test_IncrementAsOwner() (gas: 29808)
Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 234.58µs (44.34µs CPU time)
 
Ran 1 test suite in 7.92ms (234.58µs CPU time): 1 tests passed, 0 failed, 0 skipped (1 total tests)
```

Another cheatcode that is perhaps not so intuitive is the `expectEmit` function. Before looking at `expectEmit`, we need to understand what an event is.

Events are inheritable members of contracts. When you emit an event, the arguments are stored on the blockchain. The `indexed` attribute can be added to a maximum of three parameters of an event to form a data structure known as a "topic." Topics allow users to search for events on the blockchain.

```solidity
pragma solidity 0.8.10;

import {Test} from "forge-std/Test.sol";

contract EmitContractTest is Test {
    event Transfer(address indexed from, address indexed to, uint256 amount);

    function test_ExpectEmit() public {
        ExpectEmit emitter = new ExpectEmit();
        // Check that topic 1, topic 2, and data are the same as the following emitted event.
        // Checking topic 3 here doesn't matter, because `Transfer` only has 2 indexed topics.
        vm.expectEmit(true, true, false, true);
        // The event we expect
        emit Transfer(address(this), address(1337), 1337);
        // The event we get
        emitter.t();
    }

    function test_ExpectEmit_DoNotCheckData() public {
        ExpectEmit emitter = new ExpectEmit();
        // Check topic 1 and topic 2, but do not check data
        vm.expectEmit(true, true, false, false);
        // The event we expect
        emit Transfer(address(this), address(1337), 1338);
        // The event we get
        emitter.t();
    }
}

contract ExpectEmit {
    event Transfer(address indexed from, address indexed to, uint256 amount);

    function t() public {
        emit Transfer(msg.sender, address(1337), 1337);
    }
}
```

When we call `vm.expectEmit(true, true, false, true);`, we want to check the 1st and 2nd `indexed` topic for the next event.

The expected `Transfer` event in `test_ExpectEmit()` means we are expecting that `from` is `address(this)`, and `to` is `address(1337)`. This is compared against the event emitted from `emitter.t()`.

In other words, we are checking that the first topic from `emitter.t()` is equal to `address(this)`. The 3rd argument in `expectEmit` is set to `false` because there is no need to check the third topic in the `Transfer` event, since there are only two. It does not matter even if we set to `true`.

The 4th argument in `expectEmit` is set to `true`, which means that we want to check "non-indexed topics", also known as data.

For example, we want the data from the expected event in `test_ExpectEmit` - which is `amount` - to equal to the data in the actual emitted event. In other words, we are asserting that `amount` emitted by `emitter.t()` is equal to `1337`. If the fourth argument in `expectEmit` was set to `false`, we would not check `amount`.

In other words, `test_ExpectEmit_DoNotCheckData` is a valid test case, even though the amounts differ, since we do not check the data.

<br></br>

:::info
See the [Cheatcodes Reference](/reference/cheatcodes/overview) for a complete overview of all the available cheatcodes.
:::