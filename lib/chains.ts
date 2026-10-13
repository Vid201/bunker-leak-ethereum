import type { Chain } from "viem";
import {
  arbitrum,
  avalanche,
  base,
  berachain,
  blast,
  bsc,
  celo,
  gnosis,
  hyperEvm,
  ink,
  linea,
  mainnet,
  mantle,
  optimism,
  polygon,
  scroll,
  sonic,
  unichain,
  worldchain,
  zksync,
} from "viem/chains";

export interface ChainConfig {
  id: number;
  name: string;
  viem: Chain;
  /** Public RPCs tried after Alchemy (if configured). */
  rpcs: string[];
  /** Alchemy network slug, used when ALCHEMY_API_KEY is set. */
  alchemy?: string;
  /** Blockscout instance with a keyless v2 API (used to find a tx sent by the address). */
  blockscout?: string;
  /** Safe Transaction Service short name. */
  safe?: string;
  explorer: string;
  /** L2 / alt-L1 label for the UI. */
  kind: "L1" | "L2" | "alt-L1";
}

const pn = (sub: string) => `https://${sub}.publicnode.com`;

export const CHAINS: ChainConfig[] = [
  { id: 1, name: "Ethereum", viem: mainnet, kind: "L1", rpcs: [pn("ethereum-rpc"), ...mainnet.rpcUrls.default.http], alchemy: "eth-mainnet", blockscout: "https://eth.blockscout.com", safe: "eth", explorer: "https://etherscan.io" },
  { id: 42161, name: "Arbitrum One", viem: arbitrum, kind: "L2", rpcs: [...arbitrum.rpcUrls.default.http, pn("arbitrum-one-rpc")], alchemy: "arb-mainnet", safe: "arb1", explorer: "https://arbiscan.io" },
  { id: 10, name: "OP Mainnet", viem: optimism, kind: "L2", rpcs: [...optimism.rpcUrls.default.http, pn("optimism-rpc")], alchemy: "opt-mainnet", blockscout: "https://explorer.optimism.io", safe: "oeth", explorer: "https://optimistic.etherscan.io" },
  { id: 8453, name: "Base", viem: base, kind: "L2", rpcs: [...base.rpcUrls.default.http, pn("base-rpc")], alchemy: "base-mainnet", safe: "base", explorer: "https://basescan.org" },
  { id: 137, name: "Polygon PoS", viem: polygon, kind: "alt-L1", rpcs: [pn("polygon-bor-rpc"), ...polygon.rpcUrls.default.http], alchemy: "polygon-mainnet", safe: "pol", explorer: "https://polygonscan.com" },
  { id: 324, name: "zkSync Era", viem: zksync, kind: "L2", rpcs: [...zksync.rpcUrls.default.http], alchemy: "zksync-mainnet", blockscout: "https://zksync.blockscout.com", safe: "zksync", explorer: "https://era.zksync.network" },
  { id: 59144, name: "Linea", viem: linea, kind: "L2", rpcs: [...linea.rpcUrls.default.http, pn("linea-rpc")], alchemy: "linea-mainnet", safe: "linea", explorer: "https://lineascan.build" },
  { id: 534352, name: "Scroll", viem: scroll, kind: "L2", rpcs: [...scroll.rpcUrls.default.http, pn("scroll-rpc")], alchemy: "scroll-mainnet", safe: "scr", explorer: "https://scrollscan.com" },
  { id: 130, name: "Unichain", viem: unichain, kind: "L2", rpcs: [...unichain.rpcUrls.default.http, pn("unichain-rpc")], alchemy: "unichain-mainnet", blockscout: "https://unichain.blockscout.com", safe: "unichain", explorer: "https://uniscan.xyz" },
  { id: 57073, name: "Ink", viem: ink, kind: "L2", rpcs: [...ink.rpcUrls.default.http], alchemy: "ink-mainnet", blockscout: "https://explorer.inkonchain.com", safe: "ink", explorer: "https://explorer.inkonchain.com" },
  { id: 480, name: "World Chain", viem: worldchain, kind: "L2", rpcs: [...worldchain.rpcUrls.default.http], alchemy: "worldchain-mainnet", blockscout: "https://worldchain-mainnet.explorer.alchemy.com", safe: "wc", explorer: "https://worldscan.org" },
  { id: 81457, name: "Blast", viem: blast, kind: "L2", rpcs: [...blast.rpcUrls.default.http, pn("blast-rpc")], alchemy: "blast-mainnet", explorer: "https://blastscan.io" },
  { id: 5000, name: "Mantle", viem: mantle, kind: "L2", rpcs: [...mantle.rpcUrls.default.http, pn("mantle-rpc")], alchemy: "mantle-mainnet", safe: "mantle", explorer: "https://mantlescan.xyz" },
  { id: 42220, name: "Celo", viem: celo, kind: "L2", rpcs: [...celo.rpcUrls.default.http, pn("celo-rpc")], alchemy: "celo-mainnet", blockscout: "https://celo.blockscout.com", safe: "celo", explorer: "https://celoscan.io" },
  { id: 56, name: "BNB Chain", viem: bsc, kind: "alt-L1", rpcs: [pn("bsc-rpc"), ...bsc.rpcUrls.default.http], alchemy: "bnb-mainnet", safe: "bnb", explorer: "https://bscscan.com" },
  { id: 43114, name: "Avalanche C", viem: avalanche, kind: "alt-L1", rpcs: [...avalanche.rpcUrls.default.http, pn("avalanche-c-chain-rpc")], alchemy: "avax-mainnet", safe: "avax", explorer: "https://snowtrace.io" },
  { id: 100, name: "Gnosis", viem: gnosis, kind: "alt-L1", rpcs: [...gnosis.rpcUrls.default.http, pn("gnosis-rpc")], alchemy: "gnosis-mainnet", safe: "gno", explorer: "https://gnosisscan.io" },
  { id: 146, name: "Sonic", viem: sonic, kind: "alt-L1", rpcs: [...sonic.rpcUrls.default.http, pn("sonic-rpc")], alchemy: "sonic-mainnet", safe: "sonic", explorer: "https://sonicscan.org" },
  { id: 80094, name: "Berachain", viem: berachain, kind: "alt-L1", rpcs: [...berachain.rpcUrls.default.http, pn("berachain-rpc")], alchemy: "berachain-mainnet", safe: "berachain", explorer: "https://berascan.com" },
  { id: 999, name: "HyperEVM", viem: hyperEvm, kind: "alt-L1", rpcs: [...hyperEvm.rpcUrls.default.http], alchemy: "hyperliquid-mainnet", safe: "hyper", explorer: "https://hyperevmscan.io" },
];

export const CHAIN_BY_ID = new Map(CHAINS.map((c) => [c.id, c]));

export const txUrl = (c: ChainConfig, hash: string) => `${c.explorer}/tx/${hash}`;
export const addressUrl = (c: ChainConfig, address: string) => `${c.explorer}/address/${address}`;
