// This script creates a liquidity pair using 10% of ETH and 10% of USDC

// USDC on Ropsten
const USDC_CONTRACT_ADDRESS = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';

const { Contract, ethers } = require('ethers');

const erc20Artifact = require('@lobanov/uniswap-v2-periphery/build/ERC20.json');
const uniswapV2RouterArtifact = require('@lobanov/uniswap-v2-periphery/build/UniswapV2Router02.json');

async function main() {
    const allSigners = await hre.ethers.getSigners();
    const deployingSigner = allSigners[0];
    const myAddress = deployingSigner.address;
    console.log(`All deployed contracts will be signed by ${myAddress}`);

    const ethBalance = await deployingSigner.provider.getBalance(myAddress);
    console.log(`Amount of ETH on the account:`, ethers.utils.formatEther(ethBalance));

    const routerAddress = process.env.REACT_APP_ROUTER_CONTRACT;
    console.log(`Connecting to UniswapV2Router02 contract at ${routerAddress}`);
    const routerContract = new Contract(routerAddress, uniswapV2RouterArtifact.abi, deployingSigner);

    const usdcContract = new Contract(USDC_CONTRACT_ADDRESS, erc20Artifact.abi, deployingSigner);
    const tokenSymbol = await usdcContract.symbol();
    const tokenDecimal = await usdcContract.decimals();
    const tokenBalance = await usdcContract.balanceOf(myAddress);
    console.log(`Adding ETH<>${tokenSymbol} liquidity. Available balance:`, ethers.utils.formatUnits(tokenBalance, tokenDecimal));

    const tokenToAdd = tokenBalance.div(10);
    const ethToAdd = ethBalance.div(10);
    console.log(`Giving router the allowance to use ${ethers.utils.formatUnits(tokenToAdd, tokenDecimal)} of ${tokenSymbol}`);
    const approveTx = await usdcContract.approve(routerAddress, tokenToAdd);
    console.log(`Approval transaction:`, approveTx);
    await approveTx.wait();

    console.log(`Adding ETH<>${tokenSymbol} liquidity using ${ethers.utils.formatEther(ethToAdd)} ETH and ${ethers.utils.formatUnits(tokenToAdd, tokenDecimal)} ${tokenSymbol}`);
    const liquidityTx = await routerContract.addLiquidityETH(
        /* token (USDC) */ usdcContract.address,
        /* amountTokenDesired */ tokenToAdd,
        /* amountTokenMin */ tokenToAdd.div(2),
        /* amountETHMin */ ethToAdd.div(2),
        /* liquidityTo */ myAddress,
        /* deadline (10 min) */ Math.floor( Date.now() / 1000) + 600,
        { /* amountETHDesired */ value: ethToAdd });
    console.log(`Liquidity transaction:`, liquidityTx);
    await liquidityTx.wait();
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  