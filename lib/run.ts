import { type Address, getAddress, isAddress } from "viem";
import { normalize } from "viem/ens";
import { recoverFromTxs, scanChains } from "./checks/evm";
import { checkFarcaster } from "./checks/farcaster";
import { checkOnchainSignatures } from "./checks/onchainSignatures";
import { checkSafe } from "./checks/safe";
import { checkSnapshot } from "./checks/snapshot";
import { type ApiKeys, keysFingerprint } from "./keys";
import { ensClient } from "./providers/rpc";
import type { Finding } from "./types";

export async function resolveTarget(input: string): Promise<{ address: Address; ensName?: string }> {
  const q = input.trim();
  if (isAddress(q, { strict: false })) return { address: getAddress(q) };
  if (q.includes(".")) {
    const name = normalize(q);
    const address = await ensClient().getEnsAddress({ name });
    if (!address) throw new Error(`${q} does not resolve to an address`);
    return { address, ensName: name };
  }
  throw new Error("Enter an Ethereum address (0x…) or an ENS name");
}

interface Running {
  checkedAt: number;
  findings: Finding[];
  pending: Promise<void>;
  listeners: Set<(f: Finding) => void>;
}

/** In-flight runs, so a remount (or React strict mode) joins instead of starting over. */
const running = new Map<string, Running>();

interface Handlers {
  /** Called once, before any finding, with when the check started. */
  onStart: (info: { checkedAt: number }) => void;
  onFinding: (f: Finding) => void;
}

/**
 * Runs every check for an address in the browser, or joins one already running,
 * and streams each result to `onFinding`. Completed results are never persisted.
 */
export function runChecks(
  address: Address,
  keys: ApiKeys,
  { onStart, onFinding }: Handlers,
  { force = false } = {},
): { done: Promise<void>; unsubscribe: () => void } {
  const key = `${address.toLowerCase()}|${keysFingerprint(keys)}`;

  const live = running.get(key);
  if (live && !force) {
    onStart({ checkedAt: live.checkedAt });
    live.findings.forEach(onFinding);
    live.listeners.add(onFinding);
    return { done: live.pending, unsubscribe: () => live.listeners.delete(onFinding) };
  }

  const entry = { checkedAt: Date.now(), findings: [] as Finding[], listeners: new Set([onFinding]) } as Running;
  onStart({ checkedAt: entry.checkedAt });
  const emit = (f: Finding) => {
    entry.findings.push(f);
    entry.listeners.forEach((l) => l(f));
  };
  const ctx = { address, emit, keys };

  entry.pending = (async () => {
    try {
      await Promise.all([
        (async () => {
          const states = await scanChains(ctx);
          await Promise.all([recoverFromTxs(ctx, states), checkOnchainSignatures(ctx, states)]);
        })(),
        checkSnapshot(ctx),
        checkSafe(ctx),
        checkFarcaster(ctx),
      ]);
    } finally {
      if (running.get(key) === entry) running.delete(key);
      entry.listeners.clear();
    }
  })();
  running.set(key, entry);
  return { done: entry.pending, unsubscribe: () => entry.listeners.delete(onFinding) };
}
