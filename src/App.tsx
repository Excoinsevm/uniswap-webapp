import './App.css';
import 'bootstrap/dist/css/bootstrap.css';

import { Navbar, Container, Accordion, Button } from 'react-bootstrap'

import { ethers, BigNumber } from "ethers";
import { useState } from 'react';

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
  symbol: string,
  decimals: number,
  balance: BigNumber
}

function App() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);

  const [ selectedAccount, setSelectedAccount ] = useState();
  const [ accountBalance, setAccountBalance ] = useState("");

  const [ walletAssets, setWalletAssets ] = useState<IWalletAsset[]>([] as IWalletAsset[]);

  const connectToMetaMask = async () => {
    console.log("Connecting to MetaMask");
    const accounts = await provider.send("eth_requestAccounts", []);
    const myAccount = accounts[0];
    setSelectedAccount(myAccount);
    const ethBalance = await provider.getBalance(myAccount);
    setAccountBalance(ethers.utils.formatEther(ethBalance));

    const bootstrapTokenContracts = process.env.REACT_APP_BOOTSTRAP_ERC20_CONTRACTS.split(',')
      .concat([ process.env.REACT_APP_WETH_CONTRACT ]);

    console.log('Bootstrap token contracts', bootstrapTokenContracts);
    const tokenContracts = bootstrapTokenContracts.map((address) => 
      new ethers.Contract(address, erc20.abi, provider));

    const assets = await Promise.all(tokenContracts.map(async (contract) => {
      return Promise.all([ contract.symbol(), contract.decimals(), contract.balanceOf(myAccount) ])
        .then((results) => {
          return {
            symbol: results[0] as string,
            decimals: results[1] as number,
            balance: BigNumber.from(results[2])
          } as IWalletAsset
        })
    }));
    setWalletAssets(assets);
  }

  function UserInfo() {
    if (selectedAccount === undefined) {
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
      <Accordion defaultActiveKey="0">
        <Accordion.Item eventKey="0">
          <Accordion.Header>Contracts and tokens</Accordion.Header>
          <Accordion.Body>
            <p>Uniswap V2 Factory contract @ { process.env.REACT_APP_FACTORY_CONTRACT }</p>
            <p>Uniswap V2 Router contract @ { process.env.REACT_APP_ROUTER_CONTRACT }</p>
            <p>Token balances in your wallet:</p>
            <WalletAssets />
            <p>The above shows balances of all tokens for which there is a liquidity pool, plus a few standard ones.
              Use this form to add more ERC-20 token contracts:</p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey="1">
          <Accordion.Header>Add liquidity</Accordion.Header>
          <Accordion.Body>Lorem ipsum</Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey="2">
          <Accordion.Header>Exchange</Accordion.Header>
          <Accordion.Body>Lorem ipsum</Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </Container>
  );
}

export default App;
