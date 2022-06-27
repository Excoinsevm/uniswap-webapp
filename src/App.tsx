import './App.css';
import 'bootstrap/dist/css/bootstrap.css';

import Immutable from 'immutable';

import { Navbar, Container, Accordion, Button, Form, Table } from 'react-bootstrap'

import { ethers, BigNumber, constants } from "ethers";
import React, { useState, FC } from 'react';

import erc20 from '@lobanov/uniswap-v2-periphery/build/ERC20.json';
import uniswapV2Router from '@lobanov/uniswap-v2-periphery/build/UniswapV2Router02.json';
import uniswapV2Pair from '@lobanov/uniswap-v2-core/build/UniswapV2Pair.json';
import uniswapV2Factory from '@lobanov/uniswap-v2-core/build/UniswapV2Factory.json';

declare global {
  namespace NodeJS {
    export interface ProcessEnv {
      REACT_APP_NETWORK_CHAIN_ID: string;
      REACT_APP_FACTORY_CONTRACT: string;
      REACT_APP_ROUTER_CONTRACT: string;
      REACT_APP_WETH_CONTRACT: string;
      REACT_APP_BOOTSTRAP_ERC20_CONTRACTS: string;
    }
  }
  
  interface Window {
    ethereum?: any
  }
}

interface IWalletAsset {
  address: string,
  symbol: string,
  decimals: number,
  factor: BigNumber,
  balance: BigNumber
}

interface ILiquidityPair {
  name: string,
  token0Symbol: string,
  token1Symbol: string,
  token0Decimals: number,
  token1Decimals: number,
  token0Reserve: BigNumber,
  token1Reserve: BigNumber,
  liquidityTokenOwned: BigNumber,
  reserveRatio: BigNumber
}

function App() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const uniswapFactoryContract = new ethers.Contract(process.env.REACT_APP_FACTORY_CONTRACT, uniswapV2Factory.abi, provider);
  const uniswapRouterContract = new ethers.Contract(process.env.REACT_APP_ROUTER_CONTRACT, uniswapV2Router.abi, provider);

  // operation tabs are not visible unless connected to the wallet
  const [ connected, setConnected ] = useState(false);
  // forms are disabled (busy) when waiting for the current transaction to get confirmed
  const [ busy, setBusy ] = useState(false);

  const [ selectedAccount, setSelectedAccount ] = useState("");
  const [ accountBalance, setAccountBalance ] = useState("");

  const [ walletAssets, setWalletAssets ] = useState(Immutable.Map<string, IWalletAsset>());
  const [ liquidityPairs, setLiquidityPairs ] = useState(Immutable.Map<string, ILiquidityPair>());

  async function connectToMetaMask() {
    console.log("Connecting to MetaMask");
    const accounts = await provider.send("eth_requestAccounts", []);
    const myAccount = accounts[0];
    setSelectedAccount(myAccount);
    const ethBalance = await provider.getBalance(myAccount);
    setAccountBalance(ethers.utils.formatEther(ethBalance));

    const bootstrapTokenContractAddresses = process.env.REACT_APP_BOOTSTRAP_ERC20_CONTRACTS.split(',');
    console.log('Bootstrap token contract addresses:', bootstrapTokenContractAddresses);

    // obtain all uniswap pairs and lookup their tokens
    const knownPairsCount = await uniswapFactoryContract.allPairsLength();
    const knownPairAddresses = await Promise.all(
      Array.from(Array(knownPairsCount).keys()) // 0 ... pairsCount - 1
        .map((index) => 
          uniswapFactoryContract.allPairs(index) as Promise<string>
        )
    );

    const knownPairContracts = knownPairAddresses.map((pairAddress) =>
      new ethers.Contract(pairAddress, uniswapV2Pair.abi, provider));

    const knownTokenContractsAddresses = await Promise.all(
      knownPairContracts.flatMap((pairContract) =>
        [ pairContract.token0() as Promise<string>, pairContract.token1() as Promise<string> ]
      )
    );
    console.log('Token contract addresses known to Uniswap:', knownTokenContractsAddresses);

    // deduplicate
    const allTokenContractAddresses = Immutable.Set<string>(bootstrapTokenContractAddresses.concat(knownTokenContractsAddresses));
    const allTokenContracts = allTokenContractAddresses.map((address) => 
      new ethers.Contract(address, erc20.abi, provider));

    const assets = await Promise.all(allTokenContracts.map(async (contract) => describeWalletAsset(contract, myAccount)));
    const assetsMap = Immutable.Map(assets.map((asset) => [ asset.address, asset ]));
    setWalletAssets(assetsMap);

    const pairs = await Promise.all(knownPairContracts.map(async (contract) => describeLiquidityPair(contract, myAccount, assetsMap)));
    pairs.forEach(putLiquidityPair);

    // make operation tabs visible
    setConnected(true);
  }

  function addWalletAsset(asset: IWalletAsset) {
    setWalletAssets((prev) => {
      if (!prev.has(asset.address)) {
        return prev.set(asset.address, asset);
      }
      return prev;
    });
  }

  async function handleAddToken(address: string) {
    setBusy(true);

    const tokenContract = new ethers.Contract(address, erc20.abi, provider);
    const asset = await describeWalletAsset(tokenContract, selectedAccount);
    console.log("Adding new ERC20 asset: ", asset);

    addWalletAsset(asset);
    setBusy(false);
  }

  async function describeWalletAsset(contract: ethers.Contract, walletAddress: string): Promise<IWalletAsset> {
    const results = await Promise.all([contract.symbol(), contract.decimals(), contract.balanceOf(walletAddress)]);
    const decimals = results[1] as number;
    return {
      address: contract.address,
      symbol: results[0] as string,
      decimals,
      factor: BigNumber.from(10).pow(decimals),
      balance: BigNumber.from(results[2])
    } as IWalletAsset;
  }

  function putLiquidityPair(pair: ILiquidityPair) {
    setLiquidityPairs((prev) => prev.set(pair.name, pair));
  }

  async function handleAddLiquidity(command: IAddLiquidityCommand) {
    setBusy(true);

    const signer = provider.getSigner();

    const asset = walletAssets.get(command.tokenAddress);
    if (asset !== undefined) {
      const balanceToAdd = command.tokenToAdd;
      const balanceToAddMin = balanceToAdd.div(100).mul(95);
      const etherToAdd = command.etherToAdd;
      const etherToAddMin = etherToAdd.div(100).mul(95);
      console.log("Adding liquidity:", {
        balanceToAdd: balanceToAdd.toString(),
        balanceToAddMin: balanceToAddMin.toString(),
        etherToAdd: etherToAdd.toString(),
        etherToAddMin: etherToAddMin.toString()
      });

      const assetContract = new ethers.Contract(asset.address, erc20.abi, signer);
      const approveTx = await assetContract.approve(uniswapRouterContract.address, balanceToAdd);
      console.log("Approval transaction:", approveTx);
      await approveTx.wait();

      const liquidityTx = await uniswapRouterContract.connect(signer).addLiquidityETH(
        /* token */ asset.address,
        /* amountTokenDesired */ balanceToAdd,
        /* amountTokenMin */ balanceToAddMin,
        /* amountETHMin */ etherToAddMin,
        /* liquidityTo */ selectedAccount,
        /* deadline (10 min) */ Math.floor( Date.now() / 1000) + 600,
        { /* amountETHDesired */ value: etherToAdd, gasLimit: 30000000 });
      console.log("Adding liquidity transaction:", approveTx);
      await liquidityTx.wait();
    
    }

    setBusy(false);
  }

  async function describeLiquidityPair(contract: ethers.Contract, walletAddress: string, assets: Immutable.Map<string, IWalletAsset>): Promise<ILiquidityPair> {
    const results = await Promise.all([
      contract.token0(),
      contract.token1(),
      contract.getReserves(),
      contract.balanceOf(walletAddress)
    ]);
    const token0Address = results[0] as string;
    const token1Address = results[1] as string;
    const token0Symbol = assets.get(token0Address)?.symbol
    const token1Symbol = assets.get(token1Address)?.symbol
    const reserves = results[2] as Array<any>;
    const token0Reserve = reserves[0] as BigNumber;
    const token1Reserve = reserves[1] as BigNumber;
    return {
      name: `${token0Symbol}-${token1Symbol}`,
      token0Symbol,
      token1Symbol,
      token0Decimals: assets.get(token0Address)?.decimals,
      token1Decimals: assets.get(token1Address)?.decimals,
      token0Reserve,
      token1Reserve,
      reserveRatio: token0Reserve.div(token1Reserve),
      liquidityTokenOwned: results[3] as BigNumber
    } as ILiquidityPair;
  }

  return (
    <Container>
      <Navbar bg="light">
        <Container>
          <Navbar.Brand>Forked Uniswap v2 by <a href="https://github.com/lobanov/uniswap-webapp">@lobanov</a></Navbar.Brand>
          <Navbar.Collapse className="justify-content-end">
            <Navbar.Text>
              <UserWelcome connected={connected} account={selectedAccount} onConnect={connectToMetaMask} />
            </Navbar.Text>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <WorkingArea connected={connected} busy={busy}
        walletAssets={walletAssets} handleAddToken={handleAddToken} 
        liquidityPairs={liquidityPairs} handleAddLiquidity={handleAddLiquidity}/>
    </Container>
  );
}

interface IUserWelcomeProps {
  connected: boolean,
  account: string,
  onConnect: () => void
}

const UserWelcome: FC<IUserWelcomeProps> = ({connected, account, onConnect}) => {
  if (!connected) {
    return <Button onClick={() => onConnect()}>Connect to MetaMask</Button>
  } else {
    return <Container>Welcome, {account}</Container>
  }
}

interface IWorkingAreaProps extends ITokensAndBalancesProps {
  connected: boolean;
  walletAssets: Immutable.Map<string, IWalletAsset>,
  handleAddToken: (address: string) => void,
  liquidityPairs: Immutable.Map<string, ILiquidityPair>,
  handleAddLiquidity: (command: IAddLiquidityCommand) => void
}

const WorkingArea: FC<IWorkingAreaProps> = ({connected, busy, walletAssets, handleAddToken, liquidityPairs, handleAddLiquidity}) => {
  if (!connected) {
    return <p>Not connect to a provider</p>
  }
  return (
    <Accordion defaultActiveKey="tokens">
      <Accordion.Item eventKey="tokens">
        <Accordion.Header>Tokens and balances</Accordion.Header>
        <Accordion.Body>
          <TokensAndBalancesForm busy={busy} walletAssets={walletAssets} handleAddToken={handleAddToken} />
        </Accordion.Body>
      </Accordion.Item>
      <Accordion.Item eventKey="liquidity">
        <Accordion.Header>Liquidity</Accordion.Header>
        <Accordion.Body>
          <LiquidityForm busy={busy} walletAssets={walletAssets.filterNot((asset) => asset.symbol === 'WETH')}
            liquidityPairs={liquidityPairs} handleAddLiquidity={handleAddLiquidity} />
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}

interface ITokensAndBalancesProps {
  busy: boolean;
  walletAssets: Immutable.Map<string, IWalletAsset>,
  handleAddToken: (address: string) => void
}

interface IAddTokenFormState {
  contractAddress: string,
}

const TokensAndBalancesForm: FC<ITokensAndBalancesProps> = ({busy, walletAssets, handleAddToken}) => {
  const [ tokenAddressFormState, setTokenAddressFormState ] = useState<IAddTokenFormState>({ contractAddress: "" });

  function updateTokenAddressFormState(event: React.SyntheticEvent, property: string) {
    event.preventDefault();

    const target = event.target as HTMLInputElement;
    setTokenAddressFormState((prevState) => ({
      ...prevState,
      [property]: target.value,
    }))
  }

  async function handleAddTokenSubmit(event: React.FormEvent) {
    event.preventDefault();

    handleAddToken(tokenAddressFormState.contractAddress);
  }

  return (
    <Container>
      <p>Uniswap V2 Factory contract @ { process.env.REACT_APP_FACTORY_CONTRACT }</p>
      <p>Uniswap V2 Router contract @ { process.env.REACT_APP_ROUTER_CONTRACT }</p>
      <p>Token balances in your wallet:</p>
      <ul>
      {
        walletAssets.valueSeq().map((asset) =>
          <li key={asset.symbol}>
            <b>{ asset.symbol }</b>{ ': ' + ethers.utils.formatUnits(asset.balance, asset.decimals) }
          </li>
        )
      }
      </ul>
      <p>The above shows balances of all tokens for which there is a liquidity pool, plus a few standard ones.</p>
      <p>Use this form to add more ERC-20 token contracts, which could be used in other operations:</p>
      <Form key="addToken" onSubmit={handleAddTokenSubmit}>
        <Form.Group className="mb-3" controlId="formContractAddress">
          <Form.Label>Contract address</Form.Label>
          <Form.Control value={tokenAddressFormState.contractAddress}
              key="formContractAddress"
              onChange={(e) => updateTokenAddressFormState(e, 'contractAddress')}
              disabled={busy}
              type="string"
              placeholder="Enter ERC20 contract address starting with 0x" />
          <Form.Text className="text-muted">
            E.g. WETH9 contract is deployed @ { process.env.REACT_APP_WETH_CONTRACT }
          </Form.Text>
        </Form.Group>
        <Button variant="primary" type="submit" disabled={busy}>
          Submit
        </Button>
      </Form>
    </Container>
  )
}

interface IAddLiquidityCommand {
  tokenAddress: string,
  tokenToAdd: BigNumber,
  etherToAdd: BigNumber
}

interface ILiquidityProps {
  busy: boolean;
  walletAssets: Immutable.Map<string, IWalletAsset>,
  liquidityPairs: Immutable.Map<string, ILiquidityPair>;
  handleAddLiquidity: (command: IAddLiquidityCommand) => void;
}

interface ILiquidityFormState {
  tokenAddress: string,
  tokenAsset?: IWalletAsset,
  tokenToAdd: number,
  etherToAdd: number
}

const LiquidityForm: FC<ILiquidityProps> = ({busy, liquidityPairs, walletAssets, handleAddLiquidity}) => {
  const firstToken = walletAssets.get(walletAssets.keySeq().first());
  const [ liquidityFormState, setLiquidityFormState ] = useState<ILiquidityFormState>({
    tokenAddress: firstToken?.address,
    tokenAsset: firstToken,
    tokenToAdd: 0,
    etherToAdd: 0
  } as ILiquidityFormState);

  function updateLiquidityFormState(event: React.SyntheticEvent, property: string) {
    event.preventDefault();

    const target = event.target as HTMLInputElement;
    setLiquidityFormState((prevState) => {
      const state = { ...prevState, [property]: target.value }

      // recalculate all derived values on any change
      state.tokenAsset = walletAssets.get(state.tokenAddress);

      return state;
    });
  }

  function handleAddLiquiditySubmit(event: React.FormEvent) {
    event.preventDefault();

    console.log("Adding liquidity", liquidityFormState);

    if (liquidityFormState.tokenAsset !== undefined) {
      handleAddLiquidity({
        tokenAddress: liquidityFormState.tokenAddress,
        tokenToAdd: BigNumber.from(liquidityFormState.tokenToAdd).mul(liquidityFormState.tokenAsset.factor),
        etherToAdd: BigNumber.from(liquidityFormState.etherToAdd).mul(constants.WeiPerEther)
      } as IAddLiquidityCommand);
    }
  }

  return (
    <Container>
      <p>Liquidity pool status</p>
      <Table>
        <thead>
          <tr>
            <th>Pair</th>
            <th>Token 0 reserve</th>
            <th>Token 1 reserve</th>
            <th>Mid-price</th>
            <th>Liquidity tokens owned</th>
          </tr>
        </thead>
        <tbody>
          {
            liquidityPairs.valueSeq().map((pair) => 
              <tr key={pair.name}>
                <td>{ pair.name }</td>
                <td>{ ethers.utils.formatUnits(pair.token0Reserve, pair.token0Decimals) } { pair.token0Symbol }</td>
                <td>{ ethers.utils.formatUnits(pair.token1Reserve, pair.token1Decimals) } { pair.token1Symbol }</td>
                <td>{ pair.reserveRatio.toString() }</td>
                <td>{ ethers.utils.formatUnits(pair.liquidityTokenOwned, 18) }</td>
              </tr>
            )
          }
        </tbody>
      </Table>
      <p>Add liquidity. Note this form only supports ETH-asset liquidity and assumes slippage tolerance of 5%:</p>
      <Form onSubmit={handleAddLiquiditySubmit}>
        <Form.Group className="mb-3" controlId="formLiquidityToken">
          <Form.Label>Select a token</Form.Label>
          <Form.Select value={liquidityFormState.tokenAddress}
              onChange={(e) => updateLiquidityFormState(e, 'tokenAddress')}
              disabled={busy}>
            {
              walletAssets.valueSeq().map((asset) => 
                <option key={asset.address} value={asset.address}>{asset.symbol}</option>
              )
            }
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3" controlId="formLiquidityTokenAmount">
          <Form.Label>Amount of { liquidityFormState.tokenAsset?.symbol } to add to the pool</Form.Label>
          <Form.Control value={liquidityFormState.tokenToAdd}
              onChange={(e) => updateLiquidityFormState(e, 'tokenToAdd')}
              disabled={busy}
              type="string"/>
        </Form.Group>
        <Form.Group className="mb-3" controlId="formLiquidityEtherAmount">
          <Form.Label>Amount of ether to add to the pool</Form.Label>
          <Form.Control value={liquidityFormState.etherToAdd}
              onChange={(e) => updateLiquidityFormState(e, 'etherToAdd')}
              disabled={busy}
              type="string"/>
        </Form.Group>
        <Button variant="primary" type="submit" disabled={busy}>
          Submit
        </Button>
      </Form>
    </Container>
  )
}

export default App;
