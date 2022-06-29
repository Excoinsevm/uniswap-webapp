import './App.css';
import 'bootstrap/dist/css/bootstrap.css';

import Immutable from 'immutable';

import { Navbar, Container, Accordion, Button, Form, Table, Card, Row, Col, Stack, ListGroup } from 'react-bootstrap'

import { ethers, BigNumber, constants } from "ethers";
import React, { useState, FC } from 'react';

import erc20 from '@lobanov/uniswap-v2-periphery/build/ERC20.json';
import uniswapV2Router from '@lobanov/uniswap-v2-periphery/build/UniswapV2Router02.json';
import uniswapV2Pair from '@lobanov/uniswap-v2-core/build/UniswapV2Pair.json';
import uniswapV2Factory from '@lobanov/uniswap-v2-core/build/UniswapV2Factory.json';

import { Fraction } from '@uniswap/sdk'

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
  factor: BigNumber, // decimals ** 10
  balance: BigNumber
}

interface ILiquidityPair {
  name: string,
  address: string,
  token0Address: string,
  token1Address: string,
  token0Symbol: string,
  token1Symbol: string,
  token0Decimals: number,
  token1Decimals: number,
  token0Reserve: BigNumber,
  token1Reserve: BigNumber,
  liquidityTokenOwned: BigNumber,
  reserveRatio: Fraction,
  tokenPriceInEther: Fraction
}

const provider = new ethers.providers.Web3Provider(window.ethereum, "any");

function App() {
  const uniswapFactoryContract = new ethers.Contract(process.env.REACT_APP_FACTORY_CONTRACT, uniswapV2Factory.abi, provider);
  const uniswapRouterContract = new ethers.Contract(process.env.REACT_APP_ROUTER_CONTRACT, uniswapV2Router.abi, provider);

  // operation tabs are not visible unless connected to the wallet
  const [ connected, setConnected ] = useState(false);
  // forms are disabled (busy) when waiting for the current transaction to get confirmed
  const [ busy, setBusy ] = useState(false);

  const [ networkInfo, setNetworkInfo ] = useState<ethers.providers.Network>({} as ethers.providers.Network);
  const [ selectedAccount, setSelectedAccount ] = useState("");
  const [ accounEtherBalance, setAccountEtherBalance ] = useState<BigNumber>(constants.Zero);

  const [ walletAssets, setWalletAssets ] = useState(Immutable.Map<string, IWalletAsset>());
  const [ liquidityPairs, setLiquidityPairs ] = useState(Immutable.Map<string, ILiquidityPair>());

  async function connectToMetaMask() {
    console.log("Connecting to MetaMask");
    const accounts = await provider.send("eth_requestAccounts", []);
    const myAccount = accounts[0];
    setSelectedAccount(myAccount);
    const ethBalance = await provider.getBalance(myAccount);
    setAccountEtherBalance(ethBalance);

    console.log(`Connected to account ${myAccount} with current ETH balance of ${ethBalance.toString()}`);

    const network = await provider.getNetwork();
    console.log('Connected to network:', network);
    setNetworkInfo(network);

    // reload page on network change
    provider.on("network", (newNetwork, oldNetwork) => {
      if (oldNetwork) {
        console.log('Network change detected, reloading');
        window.location.reload();
      }
    })

    // automatically update account ETH balance
    provider.on('block', () => {
      provider.getBalance(myAccount).then((newBalance) => {
        setAccountEtherBalance((oldBalance) => {
          if (!oldBalance.eq(newBalance)) {
            console.log(`ETH balance change detected from  ${ethers.utils.formatEther(oldBalance)} to ${ethers.utils.formatEther(newBalance)}`)
          }
          return newBalance;
        });
      });
    });

    const bootstrapTokenContractAddresses = process.env.REACT_APP_BOOTSTRAP_ERC20_CONTRACTS.split(',');
    console.log('Bootstrap token contract addresses:', bootstrapTokenContractAddresses);

    // obtain all uniswap pairs and lookup their tokens
    const knownPairsCount = (await uniswapFactoryContract.allPairsLength()) as BigNumber;
    const knownPairAddresses = knownPairsCount.isZero()? [] : await Promise.all(
      Array.from(Array(knownPairsCount).keys()) // 0 ... pairsCount - 1
        .map((index) => 
          uniswapFactoryContract.allPairs(index) as Promise<string>
        )
    );

    console.log('Uniswap pairs known to the factory:', knownPairAddresses);

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
    assetsMap.valueSeq().forEach((asset) => updateWalletAsset(asset, myAccount));

    const pairs = await Promise.all(knownPairContracts.map(async (contract) => describeLiquidityPair(contract, myAccount, assetsMap)));
    pairs.forEach((pair) => updateLiquidityPair(pair, myAccount, assetsMap));

    // make operation tabs visible
    setConnected(true);
  }

  function createTransferEventListener(asset: IWalletAsset, assetContract: ethers.Contract, myAccount: string) {
    return async (log: ethers.providers.Log) => {
      // ignore past events
      if (provider.blockNumber === log.blockNumber) {
        const newBalance = await assetContract.balanceOf(myAccount);
        console.log(`Asset balance of ${asset.symbol} has changed`, ethers.utils.formatUnits(newBalance, asset.decimals));

        const newAsset = { ...asset, balance: newBalance };
        updateWalletAsset(newAsset, myAccount);
      }
    };
  }

  function updateWalletAsset(asset: IWalletAsset, myAccount: string) {
    setWalletAssets((prev) => {
      if (!prev.has(asset.address)) {
        const assetContract = new ethers.Contract(asset.address, erc20.abi, provider);

        // listen to transfers from and to the current address
        const transferFromFilter = assetContract.filters.Transfer(myAccount, null, null);
        const transferToFilter = assetContract.filters.Transfer(null, myAccount, null);
        const listener = createTransferEventListener(asset, assetContract, myAccount);
        provider.on(transferFromFilter, listener);
        provider.on(transferToFilter, listener);
      }
      return prev.set(asset.address, asset);
    });
  }

  async function handleAddToken(address: string) {
    setBusy(true);

    const tokenContract = new ethers.Contract(address, erc20.abi, provider);
    const asset = await describeWalletAsset(tokenContract, selectedAccount);
    console.log("Adding new ERC20 asset: ", asset);

    updateWalletAsset(asset, selectedAccount);
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

  function updateLiquidityPair(pair: ILiquidityPair, myAddress: string, assets: Immutable.Map<string, IWalletAsset>) {
    console.log("Adding liquidity pair", pair);
    setLiquidityPairs((prev) => {
      const pairContract = new ethers.Contract(pair.address, uniswapV2Pair.abi, provider);

      // listen to transfers from and to the current address
      const syncFilter = pairContract.filters.Sync();
      provider.on(syncFilter, async (log) => {
        // ignore past events
        if (log.blockNumber === provider.blockNumber) {
          const updatedPair = await describeLiquidityPair(pairContract, myAddress, assets);
          updateLiquidityPair(updatedPair, myAddress, assets);
        }
      });

      return prev.set(pair.name, pair)
    });
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
      console.log("Adding liquidity transaction:", liquidityTx);
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

    const reserveRatio = new Fraction(token0Reserve.toBigInt(), token1Reserve.toBigInt());
    const tokenPriceInEther = (token0Address === process.env.REACT_APP_WETH_CONTRACT)? reserveRatio.invert(): reserveRatio;

    console.log({token0Symbol, token1Symbol, reserveRatio: reserveRatio.toSignificant(3), tokenPriceInEther: tokenPriceInEther.toSignificant(3)});

    return {
      name: `${token0Symbol}-${token1Symbol}`,
      address: contract.address,
      token0Address,
      token1Address,
      token0Symbol,
      token1Symbol,
      token0Decimals: assets.get(token0Address)?.decimals,
      token1Decimals: assets.get(token1Address)?.decimals,
      token0Reserve,
      token1Reserve,
      reserveRatio,
      tokenPriceInEther,
      liquidityTokenOwned: results[3] as BigNumber,
    } as ILiquidityPair;
  }

  async function handleTrade(command: ITradeCommand) {
    setBusy(true);

    const signer = provider.getSigner();

    const asset = walletAssets.get(command.tokenAddress);
    if (asset !== undefined) {
      const tokenAmount = command.tokenAmount;

      if (command.operation === 'buy') {
        const path = [ process.env.REACT_APP_WETH_CONTRACT, command.tokenAddress ];

        console.log("Preparing swapETHForExactTokens:", {
          amountOut: tokenAmount.toString(),
          amountInMax: command.etherAmount.toString(),
          path
        });

        const tradeTx = await uniswapRouterContract.connect(signer).swapETHForExactTokens(
          /* amountOut */ tokenAmount,
          /* path */ path,
          /* to */ selectedAccount,
          /* deadline (10 min) */ Math.floor( Date.now() / 1000) + 600,
          { /* amountInMax */ value: command.etherAmount, gasLimit: 30000000 });

        console.log("Executing transaction:", tradeTx);
        await tradeTx.wait();

      } else if (command.operation === 'sell') {
        const path = [ command.tokenAddress, process.env.REACT_APP_WETH_CONTRACT ];

        console.log("Preparing swapExactTokensForETH:", {
          amountIn: tokenAmount.toString(),
          amountOutMin: command.etherAmount.toString(),
          path
        });

        const assetContract = new ethers.Contract(asset.address, erc20.abi, signer);
        const approveTx = await assetContract.approve(uniswapRouterContract.address, tokenAmount);
        console.log("Approval transaction:", approveTx);
        await approveTx.wait();
  
        const tradeTx = await uniswapRouterContract.connect(signer).swapExactTokensForETH(
          /* amountIn */ tokenAmount,
          /* amountOutMin */ command.etherAmount,
          /* path */ path,
          /* to */ selectedAccount,
          /* deadline (10 min) */ Math.floor( Date.now() / 1000) + 600,
          { gasLimit: 30000000 });

        console.log("Executing transaction:", tradeTx);
        await tradeTx.wait();
      }
    }

    setBusy(false);
  }

  return (
    <Container>
      <Navbar bg="light">
        <Container>
          <Navbar.Brand>Forked Uniswap v2 by <a href="https://github.com/lobanov/uniswap-webapp">@lobanov</a></Navbar.Brand>
          <Navbar.Collapse className="justify-content-end">
            <Navbar.Text>
              <UserWelcome connected={connected} network={networkInfo} account={selectedAccount} onConnect={connectToMetaMask} />
            </Navbar.Text>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container>
        <br/>
        <WorkingArea connected={connected} busy={busy}
          etherBalance={accounEtherBalance}
          walletAssets={walletAssets} handleAddToken={handleAddToken} 
          liquidityPairs={liquidityPairs} handleAddLiquidity={handleAddLiquidity}
          handleTrade={handleTrade} />
      </Container>
    </Container>
  );
}

/**
 * ============================
 * User login and welcome
 * ============================
 */

interface IUserWelcomeProps {
  connected: boolean,
  account: string,
  network: ethers.providers.Network,
  onConnect: () => void
}

const UserWelcome: FC<IUserWelcomeProps> = ({connected, account, network, onConnect}) => {
  if (!connected) {
    return <Button onClick={() => onConnect()}>Connect to Wallet</Button>
  } else {
    return <Container>Welcome, {account} ({network.name} #{network.chainId})</Container>
  }
}

/**
 * ============================
 * Accordion with all forms
 * ============================
 */

interface IWorkingAreaProps extends ITokensAndBalancesProps {
  connected: boolean;
  etherBalance: BigNumber;
  walletAssets: Immutable.Map<string, IWalletAsset>,
  handleAddToken: (address: string) => void,
  liquidityPairs: Immutable.Map<string, ILiquidityPair>,
  handleAddLiquidity: (command: IAddLiquidityCommand) => void,
  handleTrade: (command: ITradeCommand) => void
}

const WorkingArea: FC<IWorkingAreaProps> = ({connected, busy, etherBalance, walletAssets, handleAddToken, liquidityPairs, handleAddLiquidity, handleTrade}) => {
  if (!connected) {
    return <p>Not connected to a provider</p>
  }

  const assets = [{ symbol: 'ETH', balance: ethers.utils.formatEther(etherBalance) }].concat(
    walletAssets.valueSeq().map((asset) => 
      ({ symbol: asset.symbol, balance: ethers.utils.formatUnits(asset.balance, asset.decimals) })
    ).toArray());

  return (
  <Stack gap={3}>
    <Row>
      <Col xs={8}>
        <Card>
          <Card.Header>Liquidity pools</Card.Header>
          <Card.Body>
            <Table>
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Reserve 0</th>
                    <th>Reserve 1</th>
                    <th>Ratio</th>
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
                        <td>{ pair.reserveRatio.toSignificant(3) }</td>
                        <td>{ ethers.utils.formatUnits(pair.liquidityTokenOwned) }</td>
                      </tr>
                    )
                  }
                </tbody>
              </Table>
          </Card.Body>
        </Card>
      </Col>
      <Col>
        <Card>
          <Card.Header>Your wallet</Card.Header>
          <ListGroup>
          {
            assets.map((asset) =>
              <ListGroup.Item key={asset.symbol}>
                <b>{ asset.symbol }</b>{ ': ' + asset.balance }
              </ListGroup.Item>
            )
          }
          </ListGroup>
        </Card>
      </Col>
    </Row>
    <Accordion defaultActiveKey="liquidity">
      <Accordion.Item eventKey="liquidity">
        <Accordion.Header>Add liquidity</Accordion.Header>
        <Accordion.Body>
          <LiquidityForm busy={busy}
            walletAssets={walletAssets.filterNot((asset) => asset.symbol === 'WETH')}
            liquidityPairs={liquidityPairs} handleAddLiquidity={handleAddLiquidity} />
        </Accordion.Body>
      </Accordion.Item>
      <Accordion.Item eventKey="trading">
        <Accordion.Header>Trading</Accordion.Header>
        <Accordion.Body>
          <TradingForm busy={busy}
            walletAssets={walletAssets.filterNot((asset) => asset.symbol === 'WETH')}
            liquidityPairs={liquidityPairs} handleTrade={handleTrade} />
        </Accordion.Body>
      </Accordion.Item>
      <Accordion.Item eventKey="tokens">
        <Accordion.Header>Token contracts</Accordion.Header>
        <Accordion.Body>
          <TokensAndBalancesForm busy={busy} etherBalance={etherBalance}
            walletAssets={walletAssets.filterNot((asset) => asset.symbol === 'WETH')}
            handleAddToken={handleAddToken} />
        </Accordion.Body>
      </Accordion.Item>
      <Accordion.Item eventKey="info">
        <Accordion.Header>Configuration</Accordion.Header>
        <Accordion.Body>
          <p>Uniswap V2 Factory contract @ { process.env.REACT_APP_FACTORY_CONTRACT }</p>
          <p>Uniswap V2 Router contract @ { process.env.REACT_APP_ROUTER_CONTRACT }</p>
          <p>WETH contract @ { process.env.REACT_APP_WETH_CONTRACT }</p>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  </Stack>
  );
}

/**
 * ============================
 * Token contracts and balances
 * ============================
 */

interface ITokensAndBalancesProps {
  busy: boolean;
  etherBalance: BigNumber;
  walletAssets: Immutable.Map<string, IWalletAsset>,
  handleAddToken: (address: string) => void
}

interface IAddTokenFormState {
  contractAddress: string,
}

const TokensAndBalancesForm: FC<ITokensAndBalancesProps> = ({busy, etherBalance, walletAssets, handleAddToken}) => {
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
      <p>The wallet widget above only shows balances of all tokens for which there is a liquidity pool, plus a few standard ones.</p>
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
        </Form.Group>
        <Button variant="primary" type="submit" disabled={busy}>
          Submit
        </Button>
      </Form>
    </Container>
  )
}

/**
 * ============================
 * Liquidity instruction panel
 * ============================
 */

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
  tokenToAdd: string,
  etherToAdd: string
}

const LiquidityForm: FC<ILiquidityProps> = ({busy, liquidityPairs, walletAssets, handleAddLiquidity}) => {
  const firstToken = walletAssets.get(walletAssets.keySeq().first());
  const [ liquidityFormState, setLiquidityFormState ] = useState<ILiquidityFormState>({
    tokenAddress: firstToken?.address,
    tokenAsset: firstToken,
    tokenToAdd: "0",
    etherToAdd: "0"
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
        tokenToAdd: ethers.utils.parseUnits(liquidityFormState.tokenToAdd, liquidityFormState.tokenAsset.decimals),
        etherToAdd: ethers.utils.parseEther(liquidityFormState.etherToAdd)
      } as IAddLiquidityCommand);
    }
  }

  return (
    <Container>
      <p>Note this form only supports ETH-asset liquidity and assumes slippage tolerance of 5%:</p>
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

/**
 * ==========================
 * Trading instruction panel
 * ==========================
 */

interface ITradeCommand {
  operation: 'buy' | 'sell';
  tokenAddress: string;
  tokenAmount: BigNumber;
  etherAmount: BigNumber; // outMin when selling, in when buying
}

interface ITradingFormProps {
  busy: boolean;
  walletAssets: Immutable.Map<string, IWalletAsset>;
  liquidityPairs: Immutable.Map<string, ILiquidityPair>;
  handleTrade: (command: ITradeCommand) => void;
}

interface ITradingFormState {
  operation: 'buy' | 'sell';
  tokenAsset?: IWalletAsset;
  liquidityPair?: ILiquidityPair;
  tokenAddress: string;
  tokenAmount: string;
  etherAmount: BigNumber;
}

const TradingForm: FC<ITradingFormProps> = ({busy, walletAssets, liquidityPairs, handleTrade}) => {
  const firstToken = walletAssets.get(walletAssets.keySeq().first());
  const [ tradingFormState, setTradingFormState ] = useState<ITradingFormState>({
    tokenAddress: firstToken?.address,
    tokenAsset: firstToken,
    operation: 'buy',
    tokenAmount: "0",
    etherAmount: constants.Zero,
    liquidityPair: findLiquidityPair(firstToken?.address, liquidityPairs)
  } as ITradingFormState);

  function findLiquidityPair(tokenAddress: string | undefined, liquidityPairs: Immutable.Map<string, ILiquidityPair>): ILiquidityPair | undefined {
    if (tokenAddress !== undefined) {
      return liquidityPairs.valueSeq().find((pair) =>
        (pair.token0Address === process.env.REACT_APP_WETH_CONTRACT && pair.token1Address === tokenAddress) ||
        (pair.token0Address === tokenAddress && pair.token1Address === process.env.REACT_APP_WETH_CONTRACT)
      );
    }
  }

  function updateTradingFormState(event: React.SyntheticEvent, property: string) {
    event.preventDefault();

    const target = event.target as HTMLInputElement;
    setTradingFormState((prevState) => {
      const state = { ...prevState, [property]: target.value }

      // recalculate all derived values on any change
      state.tokenAsset = walletAssets.get(state.tokenAddress);
      state.liquidityPair = findLiquidityPair(state.tokenAddress, liquidityPairs);

      if (state.liquidityPair !== undefined && state.tokenAsset !== undefined) {
        const tokenAmount = ethers.utils.parseUnits(state.tokenAmount, state.tokenAsset.decimals);
        const tokenPrice = state.liquidityPair.tokenPriceInEther;
        const etherEstimate = BigNumber.from(tokenPrice.multiply(tokenAmount.toBigInt()).toFixed(0));

        console.log({tokenAmount: tokenAmount.toString(), etherEstimate: etherEstimate.toString()})

        if (state.operation === 'buy') {
          // max ether to spend
          state.etherAmount = etherEstimate.div(100).mul(105);
        } else {
          // min ether to receive
          state.etherAmount = etherEstimate.div(100).mul(95);
        }
      }

      return state;
    });
  }

  function handleTradeSubmit(event: React.FormEvent) {
    event.preventDefault();

    console.log("Executing a trade", tradingFormState);

    if (tradingFormState.tokenAsset !== undefined) {
      handleTrade({
        operation: tradingFormState.operation,
        tokenAddress: tradingFormState.tokenAddress,
        tokenAmount: BigNumber.from(tradingFormState.tokenAmount).mul(tradingFormState.tokenAsset.factor),
        etherAmount: tradingFormState.etherAmount
      } as ITradeCommand);
    }
  }

  return (
    <Container>
      <p>Execute a swap. This form only allowing buying and selling tokens for ETH with maximum slippage of 5%.</p>
      <Form onSubmit={handleTradeSubmit}>
        <Form.Group className="mb-3" controlId="formTradingOperation">
          <Form.Label>Choose operation type</Form.Label>
          <Form.Select value={tradingFormState.operation}
              onChange={(e) => updateTradingFormState(e, 'operation')}
              disabled={busy}>
            <option>buy</option>
            <option>sell</option>
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3" controlId="formTradingToken">
          <Form.Label>Select a token to {tradingFormState.operation}</Form.Label>
          <Form.Select value={tradingFormState.tokenAddress}
              onChange={(e) => updateTradingFormState(e, 'tokenAddress')}
              disabled={busy}>
            {
              walletAssets.valueSeq().map((asset) => 
                <option key={asset.address} value={asset.address}>{asset.symbol}</option>
              )
            }
          </Form.Select>
          <Form.Text className="text-muted">
            {
              tradingFormState.liquidityPair?
                `This trade will use liquidity pair ${tradingFormState.liquidityPair?.name}` :
                'Unable to trade, no such liquidity pair'
            }
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3" controlId="formTradingTokenAmount">
          <Form.Label>Amount of {tradingFormState.tokenAsset?.symbol} to {tradingFormState.operation} for ETH</Form.Label>
          <Form.Control value={tradingFormState.tokenAmount}
              onChange={(e) => updateTradingFormState(e, 'tokenAmount')}
              disabled={busy}
              type="string"/>
          <Form.Text className="text-muted">
            {
              tradingFormState.liquidityPair?
                (
                  tradingFormState.operation === 'buy'?
                    `Maximum ether that will be sent: ${ ethers.utils.formatEther(tradingFormState.etherAmount) }` :
                    `Minimum ether that will be received: ${ ethers.utils.formatEther(tradingFormState.etherAmount) }`
                ) :
                'Unable to trade, no such liquidity pair'
            }
          </Form.Text>
        </Form.Group>
        <Button variant="primary" type="submit" disabled={busy || !tradingFormState.liquidityPair}>
          Submit
        </Button>
      </Form>
    </Container>
  )
}

export default App;
