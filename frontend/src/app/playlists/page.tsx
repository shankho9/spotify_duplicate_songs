"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppPageNav, ErrorRecoveryPanel } from "@/components/app-page-nav";
import { DuplicatesPanel } from "@/components/duplicates-panel";
import { createScan, getPlaylistTracksPreview, getPlaylists, getScanStatus } from "@/services/api";
import { useAppStore } from "@/store/app-store";
import { useAuthGuard } from "@/hooks/use-auth-guard";

function formatScanFailureMessage(
  status: number | null | undefined,
  detail: string | undefined,
): string {
  let base = detail?.trim() || "Spotify rejected the playlist tracks request.";
  try {
    const parsed = JSON.parse(detail || "{}") as { error?: { message?: string } };
    if (parsed.error?.message) base = parsed.error.message;
  } catch {
    if (detail && detail.length > 400) base = `${detail.slice(0, 400)}…`;
  }

  const lower = base.toLowerCase();
  const notRegistered =
    lower.includes("not registered") ||
    lower.includes("developer dashboard") ||
    lower.includes("forbidden");

  if (status === 403) {
    if (notRegistered) {
      base += `

This almost always means Spotify is blocking the Web API for a Development-mode app until your listener account is allow-listed.

Do this in order:
1) Open https://developer.spotify.com/dashboard and open the app whose Client ID matches SPOTIFY_CLIENT_ID in your environment (not a different app).
2) In that app: Settings → User management (may be labeled “Users and access”) → Add the email of the Spotify account you use inside Spotless (the account that shows in the header). Save.
3) Open https://www.spotify.com/account/apps/ → remove access for this app → use Sign out in Spotless → Sign in with Spotify again (so Spotify re-issues a token after allow-list + scopes).
4) Scan a playlist you own (use “Only playlists I created” on this page).

If it still fails, request Extended quota / production access in the dashboard when you are ready for broader users.`;
    } else {
      base += `

If this is a 403: confirm dashboard User management includes your Spotify login email, revoke the app at https://www.spotify.com/account/apps/ , sign in again, and scan only playlists you can read.`;
    }
  }
  return base;
}

async function waitForScanOutcome(
  accessToken: string,
  scanId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    const st = await getScanStatus(accessToken, scanId);
    if (st.status === "failed") {
      const detail = st.error?.detail;
      const msg = formatScanFailureMessage(st.error?.http_status ?? null, detail);
      return { ok: false, message: msg };
    }
    if (st.status === "completed") return { ok: true };
  }
  return { ok: false, message: "Scan timed out. Check backend logs and try again." };
}

function PlaylistTrackPreview({
  accessToken,
  playlistId,
  enabled,
}: {
  accessToken: string;
  playlistId: string;
  enabled: boolean;
}) {
  const q = useQuery({
    queryKey: ["playlist-tracks-preview", playlistId],
    queryFn: () => getPlaylistTracksPreview(accessToken, playlistId, 50),
    enabled: Boolean(accessToken && enabled),
    staleTime: 60_000,
  });

  if (!enabled) return null;
  if (q.isPending) return <p className="text-xs text-zinc-500">Loading tracks…</p>;
  if (q.isError) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        {q.error instanceof Error ? q.error.message : "Could not load preview."}
      </p>
    );
  }
  const items = q.data ?? [];
  if (items.length === 0) {
    return <p className="text-xs text-zinc-500">No playable tracks in this playlist.</p>;
  }
  return (
    <ul className="max-h-48 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-zinc-700 dark:text-zinc-300">
      {items.map((t) => (
        <li key={t.id} className="truncate" title={`${t.name} — ${t.artists.join(", ")}`}>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.name}</span>
          <span className="text-zinc-500"> — {t.artists.join(", ") || "—"}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PlaylistsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  useAuthGuard();
  const activeScanId = useAppStore((s) => s.activeScanId);
  const setActiveScanId = useAppStore((s) => s.setActiveScanId);
  const [scanError, setScanError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(false);
  /** One short pause after a *new* access token so we do not hit /me/playlists in the same burst as NextAuth’s /me during OAuth. */
  const playlistsFetchGateRef = useRef<string | null>(null);
  const [playlistsFetchReady, setPlaylistsFetchReady] = useState(false);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      setPlaylistsFetchReady(false);
      playlistsFetchGateRef.current = null;
      return;
    }
    if (playlistsFetchGateRef.current === token) {
      setPlaylistsFetchReady(true);
      return;
    }
    setPlaylistsFetchReady(false);
    const id = window.setTimeout(() => {
      playlistsFetchGateRef.current = token;
      setPlaylistsFetchReady(true);
    }, 2500);
    return () => window.clearTimeout(id);
  }, [session?.accessToken]);

  useEffect(() => {
    if (!scanning) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scanning]);

  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: () => getPlaylists(session!.accessToken),
    enabled: Boolean(session?.accessToken && playlistsFetchReady),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const visiblePlaylists = useMemo(() => {
    const items = playlists.data ?? [];
    const spotifyUserId = session?.spotifyUserId;
    if (!onlyMine || !spotifyUserId) return items;
    return items.filter((p) => p.owner_id === spotifyUserId);
  }, [playlists.data, onlyMine, session]);

  const visibleIds = useMemo(() => new Set(visiblePlaylists.map((p) => p.id)), [visiblePlaylists]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  const allVisibleSelected =
    visiblePlaylists.length > 0 && visiblePlaylists.every((p) => selectedIds.has(p.id));
  const someVisibleSelected = visiblePlaylists.some((p) => selectedIds.has(p.id)) && !allVisibleSelected;

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (visiblePlaylists.length === 0) return prev;
      const allOn = visiblePlaylists.every((p) => prev.has(p.id));
      if (allOn) return new Set();
      return new Set(visiblePlaylists.map((p) => p.id));
    });
  }, [visiblePlaylists]);

  const selectedCount = selectedIds.size;

  async function onScanSelected() {
    if (!session?.spotifyUserId || !session.accessToken) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setScanError(null);
    setScanning(true);
    try {
      const scan = await createScan(session.accessToken, session.spotifyUserId, ids);
      setActiveScanId(scan.scan_id);
      const outcome = await waitForScanOutcome(session.accessToken, scan.scan_id);
      if (!outcome.ok) {
        setScanError(outcome.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["duplicates", scan.scan_id] });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <main
        className="min-h-[calc(100dvh-8rem)] bg-zinc-100 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6"
        aria-busy={scanning}
      >
        <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Playlists</h1>
          <AppPageNav />
        </div>

        {session?.error ? (
          <ErrorRecoveryPanel
            title="Session error"
            message="Your Spotify session could not be refreshed. Sign in again from the home page."
          />
        ) : null}
        {playlists.isError ? (
          <ErrorRecoveryPanel
            message={
              playlists.error instanceof Error
                ? playlists.error.message
                : "Could not load playlists. Check the API and your connection."
            }
            onRetry={() => playlists.refetch()}
          />
        ) : null}
        {scanError ? (
          <ErrorRecoveryPanel title="Scan failed" message={scanError} onRetry={() => setScanError(null)} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={onlyMine}
              disabled={scanning}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="size-3.5 shrink-0 rounded border-zinc-400 text-emerald-600 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-500"
            />
            Only playlists I created
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {playlists.data ? (
              <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {visiblePlaylists.length} / {playlists.data.length} shown · {selectedCount} selected
              </span>
            ) : playlists.isPending ? (
              <span className="text-xs text-zinc-500">Loading…</span>
            ) : null}
            <button
              type="button"
              onClick={() => void playlists.refetch()}
              disabled={scanning || playlists.isFetching || !session?.accessToken}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {playlists.isFetching ? "Reloading…" : "Reload"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={scanning || selectedCount === 0 || !session?.accessToken}
            onClick={() => void onScanSelected()}
            className="inline-flex rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning ? "Scanning…" : `Scan selected (${selectedCount})`}
          </button>
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            disabled={scanning || visiblePlaylists.length === 0}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {allVisibleSelected ? "Clear all visible" : "Select all visible"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={scanning || selectedCount === 0}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Clear selection
          </button>
        </div>

        <section
          className="rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          aria-labelledby="dup-heading"
        >
          <h2 id="dup-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Duplicate results
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Latest scan · export or remove tracks from the playlist they belong to.
          </p>
          <div className="mt-2">
            <DuplicatesPanel scanId={activeScanId} />
          </div>
        </section>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <caption className="sr-only">
                Your Spotify playlists with selection, owner, visibility, and expandable song previews
              </caption>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <th scope="col" className="w-10 px-2 py-2">
                    <span className="sr-only">Select</span>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleSelectAllVisible}
                      disabled={scanning || visiblePlaylists.length === 0}
                      className="size-3.5 rounded border-zinc-400 text-emerald-600 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-500"
                      aria-label="Select all visible playlists"
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-2 font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="min-w-[7rem] px-2 py-2 font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                  >
                    Owner
                  </th>
                  <th
                    scope="col"
                    className="w-24 px-2 py-2 font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                  >
                    Visibility
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {session?.accessToken && !playlistsFetchReady ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                      Waiting a few seconds after sign-in before loading playlists (reduces Spotify rate limits right
                      after OAuth).
                    </td>
                  </tr>
                ) : playlists.isPending ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                      Loading playlists…
                    </td>
                  </tr>
                ) : visiblePlaylists.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                      {onlyMine
                        ? "No playlists you own match this filter. Turn off “only mine” or create a playlist on Spotify."
                        : "No playlists returned."}
                    </td>
                  </tr>
                ) : (
                  visiblePlaylists.map((playlist) => (
                    <Fragment key={playlist.id}>
                      <tr
                        className="bg-white hover:bg-zinc-50/90 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                      >
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(playlist.id)}
                            disabled={scanning}
                            onChange={() => toggleOne(playlist.id)}
                            className="size-3.5 rounded border-zinc-400 text-emerald-600 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-500"
                            aria-label={`Select ${playlist.name}`}
                          />
                        </td>
                        <td className="max-w-[14rem] px-2 py-2 align-top font-medium text-zinc-900 dark:text-zinc-100">
                          <div className="truncate" title={playlist.name}>
                            {playlist.name}
                          </div>
                          <details
                            className="mt-1"
                            onToggle={(e) => {
                              const open = (e.currentTarget as HTMLDetailsElement).open;
                              setPreviewOpen((p) => ({ ...p, [playlist.id]: open }));
                            }}
                          >
                            <summary className="cursor-pointer text-[11px] font-normal text-emerald-700 hover:underline dark:text-emerald-400">
                              Songs (first 50, collapsed)
                            </summary>
                            <div className="mt-2 rounded border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-950/50">
                              <PlaylistTrackPreview
                                accessToken={session?.accessToken ?? ""}
                                playlistId={playlist.id}
                                enabled={Boolean(previewOpen[playlist.id] && session?.accessToken)}
                              />
                            </div>
                          </details>
                        </td>
                        <td
                          className="max-w-[10rem] truncate px-2 py-2 text-zinc-700 dark:text-zinc-300"
                          title={playlist.owner ?? undefined}
                        >
                          {playlist.owner ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span
                            className={
                              playlist.is_public
                                ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                : "inline-flex rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                            }
                          >
                            {playlist.is_public ? "Public" : "Private"}
                          </span>
                        </td>
                      </tr>
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </main>

      {scanning ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-white/55 backdrop-blur-sm dark:bg-zinc-950/50 dark:backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-live="polite"
          aria-label="Scanning playlists"
        >
          <div
            className="h-14 w-14 rounded-full border-4 border-emerald-600/35 border-t-emerald-600 motion-safe:animate-spin shadow-md dark:border-emerald-400/35 dark:border-t-emerald-400"
            aria-hidden
          />
          <p className="max-w-xs text-center text-sm font-semibold text-zinc-900 drop-shadow-sm dark:text-white">
            Scanning playlists…
          </p>
          <p className="max-w-sm px-4 text-center text-xs text-zinc-700 dark:text-zinc-200">
            Hang tight while we read tracks and find duplicates.
          </p>
        </div>
      ) : null}
    </>
  );
}
