import Link from "next/link";
import { ApiKeysButton } from "./ApiKeysButton";

/** Ethereum diamond drawn with currentColor so it works in light and dark themes. */
export function EthLogo({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 417" className={className} aria-hidden="true">
      <path fill="currentColor" fillOpacity="0.85" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" />
      <path fill="currentColor" fillOpacity="0.5" d="M127.962 0L0 212.32l127.962 75.639V154.158z" />
      <path fill="currentColor" fillOpacity="0.85" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" />
      <path fill="currentColor" fillOpacity="0.5" d="M127.962 416.905v-104.72L0 236.585z" />
      <path fill="currentColor" d="M127.961 287.958l127.96-75.637-127.96-58.162z" />
      <path fill="currentColor" fillOpacity="0.7" d="M0 212.32l127.96 75.638v-133.8z" />
    </svg>
  );
}

export const REPO_URL = "https://github.com/Vid201/bunker-leak-ethereum";

/** GitHub mark (octicon), drawn with currentColor. */
function GitHubLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
        <EthLogo className="h-8 w-auto text-accent" />
        <span>Bunker Leak</span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted sm:inline">Ethereum public-key exposure check</span>
        <ApiKeysButton />
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source code on GitHub"
          title="Source code on GitHub"
          className="text-muted transition-colors hover:text-text"
        >
          <GitHubLogo className="h-6 w-6" />
        </a>
      </div>
    </header>
  );
}
