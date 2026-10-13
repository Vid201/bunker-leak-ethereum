import { describe, expect, it } from "vitest";
import { keysFingerprint } from "../lib/keys";
import { verdict } from "../lib/verdict";
import type { Finding, Status } from "../lib/types";

const finding = (status: Status, vector: Finding["vector"] = "tx"): Finding => ({ id: status, title: status, status, vector });

describe("verdict coverage", () => {
  it("requires successful checks and never treats failures or unverified events as clean", () => {
    for (const fs of [[], [finding("error")], [finding("skipped")], [finding("clear"), finding("error")], [finding("info", "onchain-signature")], [finding("clear"), finding("info", "onchain-signature")]]) {
      expect(verdict(fs)).toBe("inconclusive");
    }
  });
  it("judges contracts only by their controllers", () => {
    expect(verdict([finding("info", "contract"), finding("skipped")])).toBe("contract-unknown");
    expect(verdict([finding("info", "contract"), finding("clear"), finding("likely", "snapshot")])).toBe("contract-unknown");
    expect(verdict([finding("info", "contract"), finding("exposed", "control")])).toBe("contract-exposed");
    expect(verdict([finding("info", "contract"), finding("likely", "control")])).toBe("contract-likely");
    expect(verdict([finding("info", "contract"), finding("error", "control")])).toBe("inconclusive");
    expect(verdict([finding("info", "contract"), finding("clear", "control")])).toBe("contract-clear");
  });
  it("allows optional skipped checks alongside a successful check", () => {
    expect(verdict([finding("clear"), finding("skipped", "farcaster"), finding("skipped", "onchain-signature")])).toBe("none");
    expect(verdict([finding("clear"), finding("skipped"), finding("error")])).toBe("inconclusive");
  });
  it("preserves positive evidence despite coverage gaps", () => {
    expect(verdict([finding("error"), finding("exposed")])).toBe("exposed");
    expect(verdict([finding("skipped"), finding("likely")])).toBe("likely");
    expect(verdict([finding("clear")])).toBe("none");
  });
});

it("isolates credentials without exposing them in the fingerprint", () => {
  expect(keysFingerprint({ etherscan: "bad" })).not.toBe(keysFingerprint({ etherscan: "correct" }));
  expect(keysFingerprint({ safe: "s", etherscan: "e" })).toBe(keysFingerprint({ etherscan: "e", safe: "s" }));
  expect(keysFingerprint({ etherscan: "correct" })).not.toContain("correct");
});
