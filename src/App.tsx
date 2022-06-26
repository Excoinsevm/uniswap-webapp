import './App.css';
import 'bootstrap/dist/css/bootstrap.css';

import { Navbar, Container, Accordion } from 'react-bootstrap'

function App() {
  return (
    <Container>
      <Navbar bg="light">
        <Container>
          <Navbar.Brand>Forked Uniswap v2 by <a href="https://github.com/lobanov/uniswap-webapp">@lobanov</a></Navbar.Brand>
          <Navbar.Collapse className="justify-content-end">
            <Navbar.Text>
              Signed in as: <a href="#login">Mark Otto</a>
            </Navbar.Text>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Accordion>
        <Accordion.Item eventKey="0">
          <Accordion.Header>List pairs</Accordion.Header>
          <Accordion.Body>Lorem ipsum</Accordion.Body>
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
