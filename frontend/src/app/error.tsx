"use client";

import { useEffect } from "react";
import { AppPageNav } from "@/components/app-page-nav";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {error.message || "An unexpected error occurred. You can go home, go back, or try again."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AppPageNav />
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
