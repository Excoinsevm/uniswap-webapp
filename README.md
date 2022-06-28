# uniswap-webapp

Custom web UI for the forked Uniswap V2 smart contract

This project uses `create-react-app`, `ethers.js`, and `hardhat`. 

This project uses forked Uniswap V2 repos for the [core](https://github.com/lobanov/uniswap-v2-core) and [periphery](https://github.com/lobanov/uniswap-v2-periphery).

## Development

All local development was done using VSCode Docker-Remote plugin to ensure consistent development setup. See `.devcontainer` directory for the configuration of the containerised local development environment.

It should be possible to build this project on any machine that can run `node.js` and `npm`, but it's not guaranteed.

## Running locally

The following assumes the use of `node@>=10`.

### Install Dependencies

`npm install`

### Run Harthat Network locally

Harthat network is used for local development and testing. Start it with the following command.

`npx hardhat node`

### Bootsrap local network

This is required when working locally as Hardhat network will be empty. The following command will deploy uniswap core and periphery contracts, WETH contract, and a TEST ERC-20 token.

`npx hardhat run --network localhost scripts/local-bootstrap.js`

This command will write contract details into `.env.development.local` file, which will be picked up by the webapp.

### Run webapp

`npm start`

### Interact with the webapp

Configure MetaMask to connect to the network at `http://localhost:8545`.

Note there are 20 test accounts with privates keys printed in the log when Harthat network starts. You will need to Account #0 to MetaMask or other compatible wallet. This account is the owner of the Uniswap factory, the WETH-TEST liquidity pool, and a balance of TEST tokens.
