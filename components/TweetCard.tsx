import { EmbeddedTweet } from "react-tweet";
import { getTweet } from "react-tweet/api";

export const DRAKE_TWEET_ID = "2107837081313505768";
export const DRAKE_TWEET_URL = `https://x.com/drakefjustin/status/${DRAKE_TWEET_ID}`;

// Runs at build time (static export), so the tweet is baked into the HTML.
async function loadTweet() {
  try {
    return (await getTweet(DRAKE_TWEET_ID)) ?? null;
  } catch {
    return null;
  }
}

export async function TweetCard() {
  const tweet = await loadTweet();
  if (!tweet) return <TweetFallback />;
  return (
    <div className="tweet-wrap">
      <EmbeddedTweet tweet={tweet} />
    </div>
  );
}

export function TweetFallback() {
  return (
    <a
      href={DRAKE_TWEET_URL}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-border bg-surface p-5 hover:border-muted transition-colors"
    >
      <div className="text-sm text-muted">Justin Drake (@drakefjustin) · Oct 7, 2026</div>
      <p className="mt-2 leading-relaxed">
        “Today I call upon the blockchain industry to calmly begin planning for ‘bunker mode’…”
      </p>
      <div className="mt-3 text-sm text-accent underline">Read the post on X →</div>
    </a>
  );
}
