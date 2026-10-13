import type { Finding } from "./types";

export type Verdict = "exposed" | "likely" | "none" | "inconclusive";

export function verdict(findings: Finding[]): Verdict {
  if (findings.some((f) => f.status === "exposed")) return "exposed";
  if (findings.some((f) => f.status === "likely")) return "likely";
  // Optional coverage gaps alone do not invalidate successful checks.
  if (findings.some((f) =>
    f.status === "error" ||
    (f.vector === "onchain-signature" && f.status === "info")
  )) return "inconclusive";
  return findings.some((f) => f.status === "clear") ? "none" : "inconclusive";
}

export function recoveredKey(findings: Finding[]): Finding | undefined {
  // Prefer an on-chain tx as proof, then any other source.
  return findings.find((f) => f.publicKey && f.id === "proof:tx") ?? findings.find((f) => f.publicKey);
}
