// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {SimpleERC20} from "../src/SimpleERC20.sol";

contract DeploySimpleERC20 is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address beneficiary = vm.addr(pk);

        string memory name_ = vm.envOr("TOKEN_NAME", string("LifeAI Test Token"));
        string memory symbol_ = vm.envOr("TOKEN_SYMBOL", string("LIFETEST"));
        uint256 totalSupply = vm.envOr("TOTAL_SUPPLY", uint256(1_000_000 ether));

        vm.startBroadcast(pk);
        SimpleERC20 token = new SimpleERC20(name_, symbol_, beneficiary, totalSupply);
        vm.stopBroadcast();

        console2.log("Token:", address(token));
        console2.log("Beneficiary:", beneficiary);
        console2.log("Minted:", token.balanceOf(beneficiary));
    }
}


