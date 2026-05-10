"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function SiteHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Spotless™
        </Link>
        <nav className="flex items-center gap-3 text-sm" aria-label="Account">
          {status === "loading" ? (
            <span className="text-zinc-500">…</span>
          ) : session ? (
            <>
              <span className="hidden max-w-[10rem] truncate text-zinc-600 dark:text-zinc-400 sm:inline" title={session.user?.email ?? undefined}>
                {session.user?.name ?? session.user?.email ?? "Account"}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/"
              className="font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
