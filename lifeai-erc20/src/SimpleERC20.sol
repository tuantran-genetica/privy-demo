// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract SimpleERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_, address initialHolder, uint256 supply)
        ERC20(name_, symbol_)
    {
        _mint(initialHolder, supply);
    }
}


