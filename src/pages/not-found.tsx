import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-page px-6 text-center text-ink">
      <p className="text-5xl font-bold tabular-nums text-ink-3">404</p>
      <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 max-w-xs text-sm text-ink-2">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link
        to="/"
        className="mt-6 flex h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover"
      >
        Back to the game
      </Link>
    </div>
  );
}
