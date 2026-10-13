import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { CHAINS, type ChainConfig } from "../chains";

const clients = new Map<string, PublicClient>();

/**
 * A client per chain that falls back across RPCs. We deliberately don't pass the
 * viem chain object, so transactions come back in standard Ethereum format (no
 * OP-stack / zkSync / Celo formatters) – that's what signature recovery expects.
 */
export function client(chain: ChainConfig, alchemyKey?: string): PublicClient {
  const id = `${chain.id}:${alchemyKey ?? ""}`;
  let c = clients.get(id);
  if (!c) {
    const urls = [...chain.rpcs];
    const key = alchemyKey;
    if (key && chain.alchemy) urls.unshift(`https://${chain.alchemy}.g.alchemy.com/v2/${key}`);
    c = createPublicClient({
      transport: fallback(
        urls.map((u) => http(u, { timeout: 8_000, retryCount: 0 })),
        { retryCount: 0 },
      ),
    });
    clients.set(id, c);
  }
  return c;
}

let ens: PublicClient | undefined;

/** Mainnet client with the chain attached, needed for ENS resolution. */
export function ensClient(): PublicClient {
  const chain = CHAINS[0];
  ens ??= createPublicClient({
    chain: chain.viem,
    transport: fallback(chain.rpcs.map((u) => http(u, { timeout: 8_000, retryCount: 0 }))),
  }) as PublicClient;
  return ens;
}
