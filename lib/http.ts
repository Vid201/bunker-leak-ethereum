export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 12_000, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json", ...rest.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.name === "TimeoutError" ? "timed out" : e.message.split("\n")[0];
  return String(e);
}
