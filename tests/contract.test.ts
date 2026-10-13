import { describe, expect, it } from "vitest";
import { aggregate, isContractAccount } from "../lib/checks/contract";
import type { Controller, Status } from "../lib/types";

const c = (status: Status): Controller => ({ label: status, kind: "eoa", status, reason: "" });

describe("aggregate (threshold math)", () => {
  it("is exposed once exposed owners reach the threshold", () => {
    expect(aggregate([c("exposed"), c("exposed"), c("clear")], 2)).toBe("exposed");
    expect(aggregate([c("exposed")], 1)).toBe("exposed");
  });
  it("is clear when exposed owners stay below the threshold and nothing is unknown", () => {
    expect(aggregate([c("exposed"), c("clear"), c("clear")], 2)).toBe("clear");
  });
  it("is likely when nested contracts or unconfirmed signals could tip it over", () => {
    expect(aggregate([c("exposed"), c("info"), c("clear")], 2)).toBe("likely");
    expect(aggregate([c("likely"), c("clear")], 1)).toBe("likely");
  });
  it("is an error when only failed checks could tip it over", () => {
    expect(aggregate([c("exposed"), c("error"), c("clear")], 2)).toBe("error");
  });
});

it("treats real contract code as a contract, but not EIP-7702 delegated EOAs", () => {
  expect(isContractAccount(new Map([[1, { nonce: 0, code: "0x6080" as const }]]))).toBe(true);
  expect(isContractAccount(new Map([[1, { nonce: 3, code: "0xef0100aabb" as const }]]))).toBe(false);
  expect(isContractAccount(new Map([[1, { nonce: 3, code: undefined }]]))).toBe(false);
});
