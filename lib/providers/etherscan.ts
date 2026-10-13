import { fetchJson } from "../http";

const API = "https://api.etherscan.io/v2/api";
// Free tier allows a few calls per second; space requests out globally.
const MIN_GAP_MS = 220;
let nextSlot = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

export class EtherscanUnsupported extends Error {}

interface EsResponse<T> {
  status: string;
  message: string;
  result: T | string;
}

async function call<T>(key: string, chainId: number, params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams({ chainid: String(chainId), ...params, apikey: key });
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const j = await fetchJson<EsResponse<T[]>>(`${API}?${qs}`);
    if (Array.isArray(j.result)) return j.result;
    const msg = String(j.result ?? j.message);
    // "No transactions found" / "No records found" come back as status 0 with an empty-ish result.
    if (/no (transactions|records) found/i.test(j.message) || /no (transactions|records) found/i.test(msg)) return [];
    if (/rate limit/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (/not supported|unsupported|upgrade|(?:free|paid|subscription|api) plan|plan.*(?:access|support)|access.*plan/i.test(msg)) throw new EtherscanUnsupported(msg);
    throw new Error(`Etherscan: ${msg}`);
  }
  throw new Error("Etherscan: rate limited");
}

export interface EsTx {
  hash: `0x${string}`;
  from: string;
  to: string;
  nonce: string;
  blockNumber: string;
}

/** First transactions touching the address (oldest first); caller filters by `from`. */
export function txList(key: string, chainId: number, address: string, offset = 100) {
  return call<EsTx>(key, chainId, {
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "latest",
    page: "1",
    offset: String(offset),
    sort: "asc",
  });
}

export interface EsLog {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: string;
}

/** Logs anywhere on the chain where `topicN` equals the given value. */
export async function logsByTopic(key: string, chainId: number, position: 1 | 2 | 3, topic: string, offset = 1000) {
  const logs: EsLog[] = [];
  // Bound browser work, but never report a capped scan as complete.
  for (let page = 1; page <= 20; page++) {
    const batch = await call<EsLog>(key, chainId, {
      module: "logs",
      action: "getLogs",
      fromBlock: "0",
      toBlock: "latest",
      [`topic${position}`]: topic,
      page: String(page),
      offset: String(offset),
    });
    logs.push(...batch);
    if (batch.length < offset) return logs;
  }
  throw new Error("Etherscan log scan incomplete: pagination limit reached");
}
