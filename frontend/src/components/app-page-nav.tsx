"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type AppPageNavProps = {
  className?: string;
};

const btn =
  "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

export function AppPageNav({ className = "" }: AppPageNavProps) {
  const router = useRouter();

  return (
    <nav className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Page navigation">
      <button type="button" onClick={() => router.back()} className={btn}>
        Back
      </button>
      <Link href="/" className={btn}>
        Home
      </Link>
    </nav>
  );
}

type ErrorRecoveryPanelProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorRecoveryPanel({ title = "Something went wrong", message, onRetry }: ErrorRecoveryPanelProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 whitespace-pre-line text-sm opacity-90">{message}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AppPageNav />
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
