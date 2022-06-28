require("@nomiclabs/hardhat-ethers");

require("dotenv").config({ path: '.env.local' });

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "localhost",
  networks: {
    localhost: {
      url: "http://localhost:8545"
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [ process.env.ROPSTEN_DEPLOYMENT_ACCOUNT_PRIVATE_KEY ]
    }
  },
  solidity: "0.8.0"
};
