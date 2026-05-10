"use client";

import Link from "next/link";
import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.accessToken || !session?.spotifyUserId) return;
    const base = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";
    void fetch(`${base}/auth/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotify_user_id: session.spotifyUserId,
        display_name: session.user?.name ?? "Spotify User",
        email: session.user?.email ?? null,
      }),
    }).catch(() => undefined);
  }, [session?.accessToken, session?.spotifyUserId, session?.user?.email, session?.user?.name]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-10 p-6">
      <h1 className="text-center text-4xl font-bold tracking-tight">Clean Your Spotify Playlists Instantly</h1>
      <p className="max-w-xl text-center text-zinc-600 dark:text-zinc-400">
        Connect your account, scan playlists for exact and near-duplicate songs, and remove duplicates from the
        Playlists page.
      </p>
      {!session ? (
        <button
          type="button"
          onClick={() => signIn("spotify", { callbackUrl: "/" })}
          className="rounded-full bg-green-500 px-8 py-3 font-semibold text-white hover:bg-green-600"
        >
          Continue with Spotify
        </button>
      ) : (
        <div className="flex w-full max-w-2xl flex-wrap justify-center gap-5 sm:gap-6">
          <Link
            href="/playlists"
            className="flex aspect-square w-[9.5rem] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-zinc-300 bg-white text-center shadow-md transition hover:border-emerald-500 hover:bg-emerald-50/80 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30 sm:w-[10.5rem]"
          >
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Playlists</span>
            <span className="mt-2 px-2 text-center text-xs text-zinc-500 dark:text-zinc-400">Scan & duplicates</span>
          </Link>
          <Link
            href="/profiler"
            className="flex aspect-square w-[9.5rem] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-zinc-300 bg-white text-center shadow-md transition hover:border-violet-500 hover:bg-violet-50/80 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-violet-500 dark:hover:bg-violet-950/30 sm:w-[10.5rem]"
          >
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Profiler</span>
            <span className="mt-2 px-2 text-center text-xs text-zinc-500 dark:text-zinc-400">Personality card</span>
          </Link>
        </div>
      )}
      <Link
        className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
        href="/support"
      >
        Support Spotless (Buy Me a Coffee)
      </Link>
    </main>
  );
}
