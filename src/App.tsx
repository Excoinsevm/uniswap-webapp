import './App.css';
import 'bootstrap/dist/css/bootstrap.css';

import { Navbar, Container, Accordion, Button, Form } from 'react-bootstrap'

import { ethers, BigNumber } from "ethers";
import { Provider, useState } from 'react';

import erc20 from '@lobanov/uniswap-v2-periphery/build/ERC20.json';

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
  balance: BigNumber
}

interface IAddTokenFormState {
  contractAddress: string
}

function App() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);

  const [ connected, setConnected ] = useState(false);
  const [ selectedAccount, setSelectedAccount ] = useState("");
  const [ accountBalance, setAccountBalance ] = useState("");

  const [ walletAssets, setWalletAssets ] = useState<IWalletAsset[]>([] as IWalletAsset[]);

  const [ tokenAddressFormState, setTokenAddressFormState ] = useState<IAddTokenFormState>({ contractAddress: "" });

  async function connectToMetaMask() {
    console.log("Connecting to MetaMask");
    const accounts = await provider.send("eth_requestAccounts", []);
    const myAccount = accounts[0];
    setSelectedAccount(myAccount);
    const ethBalance = await provider.getBalance(myAccount);
    setAccountBalance(ethers.utils.formatEther(ethBalance));

    const bootstrapTokenContracts = process.env.REACT_APP_BOOTSTRAP_ERC20_CONTRACTS.split(',');

    console.log('Bootstrap token contracts', bootstrapTokenContracts);
    const tokenContracts = bootstrapTokenContracts.map((address) => 
      new ethers.Contract(address, erc20.abi, provider));

    const assets = await Promise.all(tokenContracts.map(async (contract) => describeWalletAsset(contract, myAccount)));
    setWalletAssets(assets);

    setConnected(true);
  }

  function addWalletAsset(asset: IWalletAsset) {
    setWalletAssets((prev) => {
      if (prev.find((v) => v.symbol === asset.symbol)) {
        return prev;
      } else {
        return [ ...prev, asset ];
      }
    });
  }

  function describeWalletAsset(contract: ethers.Contract, walletAddress: string): Promise<IWalletAsset> {
    return Promise.all([ contract.symbol(), contract.decimals(), contract.balanceOf(walletAddress) ])
      .then((results) => {
        return {
          address: contract.address,
          symbol: results[0] as string,
          decimals: results[1] as number,
          balance: BigNumber.from(results[2])
        } as IWalletAsset
      })
  }

  function UserInfo() {
    if (!connected) {
      return <Button onClick={connectToMetaMask}>Connect to MetaMask</Button>
    } else {
      return <Container>{`${selectedAccount} (balance: ${accountBalance})`}</Container>
    }
  }

  function WalletAssets() {
    const items = walletAssets.map((asset) =>
      <li key={asset.symbol}>
        <b>{ asset.symbol }</b>{ ': ' + ethers.utils.formatUnits(asset.balance, asset.decimals) }
      </li>
    );
    return <ul>{ items }</ul>;
  }

  function updateTokenAddressFormState(event: React.SyntheticEvent, property: string) {
    event.preventDefault();

    const target = event.target as HTMLInputElement;
    setTokenAddressFormState((prevState) => ({
      ...prevState,
      [property]: target.value,
    }))
  }

  async function handleAddToken(event: React.FormEvent) {
    event.preventDefault();

    const tokenContract = new ethers.Contract(tokenAddressFormState.contractAddress, erc20.abi, provider);
    const asset = await describeWalletAsset(tokenContract, selectedAccount);
    console.log("Adding new ERC20 asset: ", asset);

    addWalletAsset(asset);
  }

  const TokensAndBalances = () =>
    <Accordion.Item eventKey="0">
      <Accordion.Header>Tokens and balances</Accordion.Header>
      <Accordion.Body>
        <p>Uniswap V2 Factory contract @ { process.env.REACT_APP_FACTORY_CONTRACT }</p>
        <p>Uniswap V2 Router contract @ { process.env.REACT_APP_ROUTER_CONTRACT }</p>
        <p>Token balances in your wallet:</p>
        <WalletAssets />
        <p>The above shows balances of all tokens for which there is a liquidity pool, plus a few standard ones.</p>
        <p>Use this form to add more ERC-20 token contracts, which could be used in other operations:</p>
        <Form onSubmit={handleAddToken}>
          <Form.Group className="mb-3" controlId="formBasicEmail">
            <Form.Label>Contract address</Form.Label>
            <Form.Control value={tokenAddressFormState.contractAddress}
                onChange={(e) => updateTokenAddressFormState(e, 'contractAddress')}
                type="string" placeholder="Enter ERC20 contract address starting with 0x" />
            <Form.Text className="text-muted">
              E.g. WETH9 contract is deployed @ { process.env.REACT_APP_WETH_CONTRACT }
            </Form.Text>
          </Form.Group>
          <Button variant="primary" type="submit">
            Submit
          </Button>
        </Form>
      </Accordion.Body>
    </Accordion.Item>

  function WorkingArea() {
    if (!connected) {
      return <p>Not connect to a provider</p>
    }
    return <Accordion defaultActiveKey="0">
      <TokensAndBalances />
      <Accordion.Item eventKey="1">
        <Accordion.Header>Add liquidity</Accordion.Header>
        <Accordion.Body>Lorem ipsum</Accordion.Body>
      </Accordion.Item>
      <Accordion.Item eventKey="2">
        <Accordion.Header>Exchange</Accordion.Header>
        <Accordion.Body>Lorem ipsum</Accordion.Body>
      </Accordion.Item>
    </Accordion>
  }

  return (
    <Container>
      <Navbar bg="light">
        <Container>
          <Navbar.Brand>Forked Uniswap v2 by <a href="https://github.com/lobanov/uniswap-webapp">@lobanov</a></Navbar.Brand>
          <Navbar.Collapse className="justify-content-end">
            <Navbar.Text>
              <UserInfo />
            </Navbar.Text>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <WorkingArea />      
    </Container>
  );
}

export default App;
