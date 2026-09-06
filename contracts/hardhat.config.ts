import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
import type { HardhatUserConfig } from "hardhat/config";

// Load the shared repo-root .env (PRIVATE_KEY / SEPOLIA_RPC_URL / ETHERSCAN_API_KEY), then let a
// local contracts/.env override it if present.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const MNEMONIC: string = process.env.MNEMONIC ?? "test test test test test test test test test test test junk";
const PRIVATE_KEY: string | undefined = process.env.PRIVATE_KEY;
const SEPOLIA_RPC_URL: string = process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";
const ETHERSCAN_API_KEY: string = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    sepolia: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : { mnemonic: MNEMONIC, path: "m/44'/60'/0'/0/", count: 10 },
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.30",
    settings: {
      metadata: {
        bytecodeHash: "none",
      },
      optimizer: {
        enabled: true,
        runs: 800,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
