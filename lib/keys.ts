import { keccak256, toBytes } from "viem";

/**
 * Optional API keys supplied by the user. They live only in this browser's
 * localStorage and are sent directly to each provider, never to us.
 */
export interface ApiKeys {
  etherscan?: string;
  alchemy?: string;
  safe?: string;
  neynar?: string;
}

export const KEY_INFO: { id: keyof ApiKeys; name: string; url: string; unlocks: string }[] = [
  {
    id: "etherscan",
    name: "Etherscan V2",
    url: "https://etherscan.io/apidashboard",
    unlocks: "Scans for permits, Permit2, USDC authorizations and order signatures, and shows the key for txs on more chains.",
  },
  {
    id: "safe",
    name: "Safe",
    url: "https://developer.safe.global",
    unlocks: "Faster Safe multisig checks (the keyless API is heavily rate-limited).",
  },
  {
    id: "alchemy",
    name: "Alchemy",
    url: "https://dashboard.alchemy.com",
    unlocks: "More reliable RPC than the public endpoints.",
  },
  {
    id: "neynar",
    name: "Neynar",
    url: "https://dev.neynar.com",
    unlocks: "Checks Farcaster accounts and recovers keys from verification signatures.",
  },
];

const STORAGE_KEY = "bunker-leak:api-keys";
const EMPTY: ApiKeys = {};
let current: ApiKeys | null = null;
const listeners = new Set<() => void>();

function read(): ApiKeys {
  if (current) return current;
  try {
    current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as ApiKeys;
  } catch {
    current = {};
  }
  return current;
}

export const keyStore = {
  get: (): ApiKeys => (typeof window === "undefined" ? EMPTY : read()),
  getServer: (): ApiKeys => EMPTY,
  set(keys: ApiKeys) {
    const clean = Object.fromEntries(Object.entries(keys).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()])) as ApiKeys;
    current = clean;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      /* storage blocked: keys still work for this session */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Stable credential identity for in-flight deduplication and resetting results when keys change. */
export const keysFingerprint = (keys: ApiKeys) =>
  keccak256(toBytes(JSON.stringify(KEY_INFO.map(({ id }) => [id, keys[id]?.trim() || ""]))));
