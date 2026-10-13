import { type Hex, pad, toEventSelector } from "viem";
import { CHAINS, txUrl } from "../chains";
import { errorMessage } from "../http";
import * as etherscan from "../providers/etherscan";
import type { Finding } from "../types";
import type { ChainState, CheckContext } from "./context";

interface Signal {
  name: string;
  explain: string;
}

/** Event topics identify candidates, not authenticated signatures. Any contract can emit them. */
const BY_TOPIC1: Record<Hex, Signal> = {
  [toEventSelector("Approval(address,address,uint256)")]: {
    name: "Token approval / possible permit",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector("Permit(address,address,address,uint160,uint48,uint48)")]: {
    name: "Possible Permit2 event",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector("AuthorizationUsed(address,bytes32)")]: {
    name: "EIP-3009 transferWithAuthorization (USDC, x402 payments)",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector("Trade(address,address,address,uint256,uint256,uint256,bytes)")]: {
    name: "CoW Protocol order",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector(
    "OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])",
  )]: {
    name: "Seaport / OpenSea order",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector("ApprovalForAll(address,address,bool)")]: {
    name: "Operator approval event",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector("DelegateChanged(address,address,address)")]: {
    name: "Governance delegation (delegateBySig)",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
  [toEventSelector("Transfer(address,address,uint256)")]: {
    name: "Outgoing token transfer without own tx",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
};

const BY_TOPIC3: Record<Hex, Signal> = {
  [toEventSelector("Fill(bytes32,address,address,uint256)")]: {
    name: "UniswapX order",
    explain: "An event references this address. Its emitter and authorization have not been verified; this does not prove a signature or public-key exposure.",
  },
};

export async function checkOnchainSignatures(ctx: CheckContext, states: Map<number, ChainState>) {
  const key = ctx.keys.etherscan;
  if (!key) {
    ctx.emit({
      id: "sig:skipped",
      vector: "onchain-signature",
      status: "skipped",
      title: "Permit-style signature scan skipped",
      detail: "Add an Etherscan API key to scan event logs for permits, Permit2, EIP-3009, CoW, UniswapX and Seaport orders.",
    });
    return;
  }
  // Scan nonce-zero accounts without code. Contracts do not have an EOA key;
  // positive EOA nonces and active delegations are handled by the chain scan.
  const chains = CHAINS.filter((c) => {
    const s = states.get(c.id);
    return s && s.nonce === 0 && (!s.code || s.code === "0x");
  });
  const topic = pad(ctx.address).toLowerCase();
  let scanned = 0;
  let found = 0;
  const failed: string[] = [];
  const skipped: string[] = [];

  await Promise.all(
    chains.map(async (chain) => {
      try {
        const [l1, l3] = await Promise.all([
          etherscan.logsByTopic(key, chain.id, 1, topic),
          etherscan.logsByTopic(key, chain.id, 3, topic),
        ]);
        scanned++;
        const hits = new Map<string, { signal: Signal; txs: Set<Hex> }>();
        const add = (signal: Signal | undefined, tx: Hex) => {
          if (!signal) return;
          const h = hits.get(signal.name) ?? { signal, txs: new Set() };
          h.txs.add(tx);
          hits.set(signal.name, h);
        };
        for (const l of l1) add(BY_TOPIC1[l.topics[0]?.toLowerCase() as Hex], l.transactionHash);
        for (const l of l3) add(BY_TOPIC3[l.topics[0]?.toLowerCase() as Hex], l.transactionHash);

        for (const { signal, txs } of hits.values()) {
          const finding: Finding = {
            id: `sig:${chain.id}:${signal.name}`,
            vector: "onchain-signature",
            status: "info",
            chainId: chain.id,
            chainName: chain.name,
            title: `Unverified: ${signal.name} on ${chain.name}`,
            detail: signal.explain,
            evidence: [...txs].slice(0, 3).map((h) => ({ label: `tx ${h.slice(0, 10)}…`, url: txUrl(chain, h) })),
          };
          found++;
          ctx.emit(finding);
        }
      } catch (e) {
        if (e instanceof etherscan.EtherscanUnsupported) {
          skipped.push(chain.name);
        } else {
          failed.push(`${chain.name}: ${errorMessage(e)}`);
        }
      }
    }),
  );

  ctx.emit({
    id: "sig:summary",
    vector: "onchain-signature",
    status: failed.length ? "error" : skipped.length ? "skipped" : found ? "info" : "clear",
    title: `Scanned ${scanned} chain${scanned === 1 ? "" : "s"} where this address never sent a tx for signatures submitted by others`,
    detail: [
      skipped.length ? `Skipped (unavailable on this Etherscan plan or unsupported by Etherscan): ${skipped.join(", ")}.` : "",
      failed.length ? `Could not scan: ${failed.join(", ")}.` : "",
    ].filter(Boolean).join(" ") || undefined,
  });
}
