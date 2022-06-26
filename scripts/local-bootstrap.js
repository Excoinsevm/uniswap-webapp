// This script initializes empty local Harthat network with relevant contracts

const { ContractFactory, BigNumber, utils, constants } = require('ethers');

const weth9Artifact = require('@lobanov/uniswap-v2-periphery/build/WETH9.json');
const uniswapV2FactoryArtifact = require('@lobanov/uniswap-v2-core/build/UniswapV2Factory.json');
const uniswapV2RouterArtifact = require('@lobanov/uniswap-v2-periphery/build/UniswapV2Router02.json');

async function main() {
  const allSigners = await hre.ethers.getSigners();
  const deployingSigner = allSigners[0];
  console.log(`All deployed contracts will be signed by ${deployingSigner.address}`);

  const weth9Factory = new ContractFactory(weth9Artifact.abi, weth9Artifact.bytecode, deployingSigner);
  const uniswapV2FactoryFactory = new ContractFactory(uniswapV2FactoryArtifact.abi, uniswapV2FactoryArtifact.bytecode, deployingSigner);
  const uniswapV2RouterFactory = new ContractFactory(uniswapV2RouterArtifact.abi, uniswapV2RouterArtifact.bytecode, deployingSigner);

  const weth9Contract = await weth9Factory.deploy(); // no args
  await weth9Contract.deployed();

  console.log("WETH9 deployed to: ", weth9Contract.address);

  const uniswapV2FactoryContract = await uniswapV2FactoryFactory.deploy(deployingSigner.address); // args: feeToSetter address
  await uniswapV2FactoryContract.deployed();

  console.log("UniswapV2Factory deployed to: ", uniswapV2FactoryContract.address);

  const uniswapV2RouterContract = await uniswapV2RouterFactory.deploy(uniswapV2FactoryContract.address, weth9Contract.address); // args: factory address, weth address
  await uniswapV2RouterContract.deployed();

  console.log("UniswapV2Router deployed to: ", uniswapV2RouterContract.address);

  const testTokenFactory = await hre.ethers.getContractFactory("TestERC20");
  const testTokenContract = await testTokenFactory.deploy(BigNumber.from(1000).mul(constants.WeiPerEther));

  await testTokenContract.deployed();

  console.log("TestERC20 deployed to: ", testTokenContract.address);

  const symbol = await testTokenContract.symbol();
  const balanceRaw = await testTokenContract.balanceOf(deployingSigner.address);
  const balance = utils.formatUnits(BigNumber.from(balanceRaw), 18);
  console.log(`Address ${deployingSigner.address} has the balance of ${balance} ${symbol}`);
}
  
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
