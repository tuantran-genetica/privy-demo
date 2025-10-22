// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public value;

    event Increment(address indexed caller, uint256 newValue);
    event Decrement(address indexed caller, uint256 newValue);

    function increase() external {
        unchecked { value += 1; }
        emit Increment(msg.sender, value);
    }

    function decrease() external {
        require(value > 0, "UNDERFLOW");
        unchecked { value -= 1; }
        emit Decrement(msg.sender, value);
    }

    function alwaysRevert() external pure {
        revert("INTENTIONAL_REVERT");
    }
}


