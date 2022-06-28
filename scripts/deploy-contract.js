// This script deploys the core and router contracts

const { ContractFactory } = require('ethers');

const uniswapV2FactoryArtifact = require('@lobanov/uniswap-v2-core/build/UniswapV2Factory.json');
const uniswapV2RouterArtifact = require('@lobanov/uniswap-v2-periphery/build/UniswapV2Router02.json');

async function main() {
  const allSigners = await hre.ethers.getSigners();
  const deployingSigner = allSigners[0];
  const myAddress = deployingSigner.address;
  console.log(`All deployed contracts will be signed by ${myAddress}`);

  const weth9ContractAddress = process.env.WETH9_CONTRACT_ADDRESS;
  if (weth9ContractAddress === undefined) {
    console.log("WETH9_CONTRACT_ADDRESS env variable not set");
    return;
  }

  console.log("Using WETH9 contract address:", weth9ContractAddress)

  const uniswapV2FactoryFactory = new ContractFactory(uniswapV2FactoryArtifact.abi, uniswapV2FactoryArtifact.bytecode, deployingSigner);
  const uniswapV2RouterFactory = new ContractFactory(uniswapV2RouterArtifact.abi, uniswapV2RouterArtifact.bytecode, deployingSigner);

  const uniswapV2FactoryContract = await uniswapV2FactoryFactory.deploy(deployingSigner.address); // args: feeToSetter address
  await uniswapV2FactoryContract.deployed();

  console.log("UniswapV2Factory deployed to: ", uniswapV2FactoryContract.address);

  const uniswapV2RouterContract = await uniswapV2RouterFactory.deploy(uniswapV2FactoryContract.address, weth9ContractAddress); // args: factory address, weth address
  await uniswapV2RouterContract.deployed();

  console.log("UniswapV2Router deployed to: ", uniswapV2RouterContract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
