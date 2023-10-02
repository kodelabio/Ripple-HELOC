require("@nomicfoundation/hardhat-toolbox");

require('dotenv').config({ path: __dirname + '/.env' })

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        },
      },

      {
        version: "0.5.15",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
          },
      },
      {
        version: "0.4.13",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        },
      },
    ],
    overrides: {
      "contracts/IlkRegistry.sol": {
        version: "0.6.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000000
          }
        }
      },
      "contracts/DssAutoLine.sol": {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    }
  },
  networks: {
    mainnet: {
      url: process.env.RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
    goerli: {
      url: process.env.RPC_URL,
      accounts: [process.env.PRIVATE_KEY,process.env.PRIVATE_KEY2],
    },
    sepolia:{
      url: process.env.RPC_URL,
      gasPrice: 2000000000,
      accounts: [process.env.PRIVATE_KEY,process.env.PRIVATE_KEY2],
    },

  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ABI_KEY,
      goerli: process.env.ABI_KEY,
      sepolia: process.env.ABI_KEY,
    },
  }

}
