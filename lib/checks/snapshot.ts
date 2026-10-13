import type { Address, Hex, TypedDataDefinition } from "viem";
import { errorMessage, fetchJson } from "../http";
import { publicKeyFromTypedData } from "../recover";
import type { CheckContext } from "./context";

const HUB = "https://hub.snapshot.org/graphql";
const GATEWAYS = ["https://ipfs.snapshot.box/ipfs"];

interface Envelope {
  address: string;
  sig: Hex;
  data: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; message: Record<string, unknown> };
}

interface Item {
  id: string;
  ipfs: string;
  created: number;
  space: { id: string };
}

export function snapshotTypedData(data: Envelope["data"]): TypedDataDefinition {
  const types = Object.fromEntries(Object.entries(data.types).filter(([k]) => k !== "EIP712Domain"));
  return {
    domain: data.domain,
    types,
    primaryType: Object.keys(types)[0],
    message: data.message,
  } as unknown as TypedDataDefinition;
}

async function envelope(cid: string): Promise<Envelope | null> {
  for (const g of GATEWAYS) {
    try {
      return await fetchJson<Envelope>(`${g}/${cid}`, { timeoutMs: 8_000 });
    } catch {
      /* try next gateway */
    }
  }
  return null;
}

/** Snapshot votes and proposals are EIP-712 signatures stored publicly on IPFS. */
export async function checkSnapshot(ctx: CheckContext) {
  const addr = ctx.address;
  try {
    const query = `query ($a: String!) {
      votes(first: 5, where: { voter: $a }, orderBy: "created", orderDirection: desc) { id ipfs created space { id } }
      proposals(first: 5, where: { author: $a }, orderBy: "created", orderDirection: desc) { id ipfs created space { id } }
    }`;
    const res = await fetchJson<{ data?: { votes: Item[]; proposals: Item[] }; errors?: { message: string }[] }>(HUB, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { a: addr } }),
    });
    if (!res.data) throw new Error(res.errors?.[0]?.message ?? "bad response");
    const items = [
      ...res.data.votes.map((v) => ({ ...v, kind: "vote" })),
      ...res.data.proposals.map((p) => ({ ...p, kind: "proposal" })),
    ];
    if (!items.length) {
      ctx.emit({ id: "snapshot", vector: "snapshot", status: "clear", title: "No Snapshot votes or proposals" });
      return;
    }

    let publicKey: Hex | null = null;
    let proofItem: (typeof items)[number] | undefined;
    for (const it of items.slice(0, 4)) {
      const env = it.ipfs ? await envelope(it.ipfs) : null;
      if (!env) continue;
      publicKey = await publicKeyFromTypedData(snapshotTypedData(env.data), env.sig, addr as Address);
      if (publicKey) {
        proofItem = it;
        break;
      }
    }

    const link = (it: (typeof items)[number]) =>
      it.kind === "proposal"
        ? `https://snapshot.box/#/s:${it.space.id}/proposal/${it.id}`
        : `${GATEWAYS[0]}/${it.ipfs}`;
    ctx.emit({
      id: "snapshot",
      vector: "snapshot",
      status: publicKey ? "exposed" : "likely",
      title: `Signed ${items.length}${items.length === 5 ? "+" : ""} Snapshot vote${items.length === 1 ? "" : "s"}/proposals`,
      detail: publicKey
        ? "Snapshot stores every signed vote on IPFS together with its signature, so anyone can recover the public key."
        : "This address signed Snapshot messages. The key could not be recovered (gateway down, or a smart-contract signature).",
      publicKey: publicKey ?? undefined,
      proof: proofItem ? `Snapshot ${proofItem.kind} in ${proofItem.space.id}` : undefined,
      evidence: items.slice(0, 3).map((it) => ({
        label: `${it.kind} in ${it.space.id} (${new Date(it.created * 1000).toISOString().slice(0, 10)})`,
        url: link(it),
      })),
    });
  } catch (e) {
    ctx.emit({ id: "snapshot", vector: "snapshot", status: "error", title: "Snapshot check failed", detail: errorMessage(e) });
  }
}
