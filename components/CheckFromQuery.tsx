"use client";

import { useSearchParams } from "next/navigation";
import { AddressForm } from "./AddressForm";
import { CheckResults } from "./CheckResults";

/** Reads ?address= so the results page can be a static file. */
export function CheckFromQuery() {
  const query = useSearchParams().get("address")?.trim() ?? "";
  return (
    <>
      <div className="mt-8">
        <AddressForm key={query} initial={query} size="sm" />
      </div>
      <div className="mt-6">
        {query ? (
          <CheckResults key={query} query={query} />
        ) : (
          <p className="text-muted">Enter an address or ENS name to check.</p>
        )}
      </div>
    </>
  );
}
