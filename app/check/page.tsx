import Link from "next/link";
import { Suspense } from "react";
import { AddressForm } from "@/components/AddressForm";
import { CheckFromQuery } from "@/components/CheckFromQuery";
import { ResultsSkeleton } from "@/components/CheckResults";
import { CoverageSections, Footer, MigrationTips } from "@/components/InfoSections";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Check result · Bunker Leak" };

export default function CheckPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <SiteHeader />

      <Suspense
        fallback={
          <>
            <div className="mt-8">
              <AddressForm size="sm" />
            </div>
            <div className="mt-6">
              <ResultsSkeleton />
            </div>
          </>
        }
      >
        <CheckFromQuery />
      </Suspense>

      <div className="mt-12">
        <MigrationTips />
      </div>
      <div className="mt-12">
        <CoverageSections />
      </div>
      <p className="mt-10 text-sm">
        <Link href="/" className="text-accent underline">
          ← What is bunker mode?
        </Link>
      </p>
      <Footer />
    </main>
  );
}
