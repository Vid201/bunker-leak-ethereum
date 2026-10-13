import { fetchJson } from "../http";

interface BsTx {
  hash: `0x${string}`;
  from: { hash: string };
}

/** Recent transactions *sent* by the address, via Blockscout's keyless v2 API. */
export async function sentTxs(base: string, address: string): Promise<BsTx[]> {
  const j = await fetchJson<{ items: BsTx[] }>(
    `${base}/api/v2/addresses/${address}/transactions?filter=from`,
  );
  return j.items ?? [];
}
