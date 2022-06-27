import './App.css';
import 'bootstrap/dist/css/bootstrap.css';

import { Navbar, Container, Accordion, Button } from 'react-bootstrap'

import { ethers, BigNumber } from "ethers";
import { useState } from 'react';

declare global {
  interface Window {
    ethereum?: any
  }
}

function App() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);

  const [ selectedAccount, setSelectedAccount ] = useState();
  const [ accountBalance, setAccountBalance ] = useState("");

  const connectToMetaMask = async () => {
    console.log("Connecting to MetaMask");
    const accounts = await provider.send("eth_requestAccounts", []);
    setSelectedAccount(accounts[0]);
    const ethBalance = await provider.getBalance(accounts[0]);
    setAccountBalance(ethers.utils.formatEther(ethBalance));
  }

  function UserInfo() {
    if (selectedAccount === undefined) {
      return <Button onClick={connectToMetaMask}>Connect to MetaMask</Button>
    } else {
      return <Container>{`${selectedAccount} (balance: ${accountBalance})`}</Container>
    }
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
      <Accordion>
        <Accordion.Item eventKey="2">
          <Accordion.Header>Contracts</Accordion.Header>
          <Accordion.Body>
            <p>Uniswap V2 Factory contract @ { process.env.REACT_APP_FACTORY_CONTRACT }</p>
            <p>Uniswap V2 Router contract @ { process.env.REACT_APP_ROUTER_CONTRACT }</p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey="0">
          <Accordion.Header>Configure tokens</Accordion.Header>
          <Accordion.Body>
            <p>Use this section to find balances of tokens associated with your account</p>
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
