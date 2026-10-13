import { type Address, type Hex, isAddressEqual } from "viem";
import { CHAINS, addressUrl, txUrl, type ChainConfig } from "../chains";
import { errorMessage } from "../http";
import * as blockscout from "../providers/blockscout";
import * as etherscan from "../providers/etherscan";
import { client } from "../providers/rpc";
import { publicKeyFromTx } from "../recover";
import type { ChainState, CheckContext } from "./context";

export const DELEGATION_PREFIX = "0xef0100";

/**
 * Vectors A + B: nonce and code on every chain.
 * nonce > 0 means the address signed a tx (or a 7702 authorization) on that chain.
 */
export async function scanChains(ctx: CheckContext): Promise<Map<number, ChainState>> {
  const states = new Map<number, ChainState>();
  await Promise.all(
    CHAINS.map(async (chain) => {
      const base = { chainId: chain.id, chainName: chain.name };
      try {
        const c = client(chain, ctx.keys.alchemy);
        const [nonce, code] = await Promise.all([
          c.getTransactionCount({ address: ctx.address }),
          c.getCode({ address: ctx.address }),
        ]);
        states.set(chain.id, { nonce, code });
        const isContract = Boolean(code && code !== "0x" && !code.startsWith(DELEGATION_PREFIX));

        if (code && code.startsWith(DELEGATION_PREFIX)) {
          const delegate = `0x${code.slice(DELEGATION_PREFIX.length)}` as Address;
          ctx.emit({
            ...base,
            id: `7702:${chain.id}`,
            vector: "eip7702",
            status: "exposed",
            title: `EIP-7702 delegation on ${chain.name}`,
            detail: `This address signed an EIP-7702 authorization delegating to ${delegate}. That signature is public, even if someone else paid for the transaction.`,
            evidence: [{ label: "Delegate contract", url: addressUrl(chain, delegate) }],
          });
        } else if (code && code !== "0x") {
          ctx.emit(contractFinding(chain));
        }

        ctx.emit({
          ...base,
          id: `tx:${chain.id}`,
          vector: "tx",
          status: isContract ? "info" : nonce > 0 ? "exposed" : "clear",
          title: isContract ? `Contract account on ${chain.name}` : nonce > 0 ? `${nonce.toLocaleString()} signed tx${nonce === 1 ? "" : "s"} on ${chain.name}` : `No signed txs on ${chain.name}`,
          evidence: nonce > 0 ? [{ label: "View on explorer", url: addressUrl(chain, ctx.address) }] : undefined,
        });
      } catch (e) {
        ctx.emit({ ...base, id: `tx:${chain.id}`, vector: "tx", status: "error", title: `${chain.name}: RPC failed`, detail: errorMessage(e) });
      }
    }),
  );
  return states;
}

function contractFinding(chain: ChainConfig) {
  return {
    id: `contract:${chain.id}`,
    vector: "contract" as const,
    status: "info" as const,
    chainId: chain.id,
    chainName: chain.name,
    title: `Smart contract on ${chain.name}`,
    detail: "A contract has no private or public key of its own. What matters is the keys that control it. See the controller check.",
  };
}

/**
 * Proof: find one tx actually sent by the address and recover its public key.
 * Tries mainnet first, then other chains, until one works.
 */
export async function recoverFromTxs(ctx: CheckContext, states: Map<number, ChainState>) {
  const candidates = CHAINS.filter((c) => {
    const state = states.get(c.id);
    return state && state.nonce > 0 && (!state.code || state.code === "0x" || state.code.startsWith(DELEGATION_PREFIX));
  });
  if (!candidates.length) return;

  const errors: string[] = [];
  for (const chain of candidates) {
    try {
      for (const hash of await sentTxHashes(chain, ctx.address, ctx.keys.etherscan)) {
        const tx = await client(chain, ctx.keys.alchemy).getTransaction({ hash });
        if (!isAddressEqual(tx.from, ctx.address)) continue;
        const pub = await publicKeyFromTx(tx, ctx.address);
        if (!pub) continue;
        ctx.emit({
          id: "proof:tx",
          vector: "tx",
          status: "exposed",
          chainId: chain.id,
          chainName: chain.name,
          title: "Public key recovered from a transaction",
          detail: "The public key was recovered from this transaction’s signature using its reconstructed signing payload, then verified to hash to this address.",
          publicKey: pub,
          proof: `tx ${hash.slice(0, 10)}… on ${chain.name}`,
          evidence: [{ label: `Transaction on ${chain.name}`, url: txUrl(chain, hash) }],
        });
        return;
      }
    } catch (e) {
      errors.push(`${chain.name}: ${errorMessage(e)}`);
    }
  }
  ctx.emit({
    id: "proof:tx",
    vector: "tx",
    status: "info",
    title: "Couldn't fetch a transaction to show the key",
    detail: `The nonce already proves the key is public. A sample transaction could not be retrieved to display it${
      ctx.keys.etherscan ? "" : " (an Etherscan API key widens coverage)"
    }.${errors.length ? ` ${errors.slice(0, 3).join("; ")}` : ""}`,
  });
}

async function sentTxHashes(chain: ChainConfig, address: Address, etherscanKey?: string): Promise<Hex[]> {
  if (chain.blockscout) {
    try {
      const txs = await blockscout.sentTxs(chain.blockscout, address);
      if (txs.length) return txs.slice(0, 5).map((t) => t.hash);
    } catch {
      /* fall through to Etherscan */
    }
  }
  if (etherscanKey) {
    try {
      const txs = await etherscan.txList(etherscanKey, chain.id, address);
      return txs.filter((t) => isAddressEqual(t.from as Address, address)).slice(0, 5).map((t) => t.hash);
    } catch (e) {
      if (!(e instanceof etherscan.EtherscanUnsupported)) throw e;
    }
  }
  return [];
}
