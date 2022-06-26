// This script initializes empty local Harthat network with relevant contracts

// import { ContractFactory } from 'ethers';
// import { ethers } from "hardhat";

const { ContractFactory } = require('ethers');

const weth9Artifact = require('@lobanov/uniswap-v2-periphery/build/WETH9.json');

async function main() {
  const allSigners = await hre.ethers.getSigners();
  const weth9Factory = new ContractFactory(weth9Artifact.abi, weth9Artifact.bytecode, allSigners[0])
  const weth9Contract = await weth9Factory.deploy();

  await weth9Contract.deployed();

  console.log("WETH9 deployed to:", weth9Contract.address);
}
  
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
