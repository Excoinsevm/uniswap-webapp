// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Test1ERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("Test Tokens 1", "TEST1") {
        _mint(msg.sender, initialSupply);
    }
}

contract Test2ERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("Test Tokens 2", "TEST2") {
        _mint(msg.sender, initialSupply);
    }
}
