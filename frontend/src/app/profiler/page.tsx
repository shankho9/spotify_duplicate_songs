"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { AppPageNav, ErrorRecoveryPanel } from "@/components/app-page-nav";
import { getPersonalityInsights } from "@/services/api";
import { buildPersonalityCardSvg, downloadSvg } from "@/lib/personality-card-svg";
import type { PersonalityInsights } from "@/types";
import { useAuthGuard } from "@/hooks/use-auth-guard";

function slugToLabel(slug: string): string {
  return slug.replace(/_/g, " ");
}

function InsightCard({ data, displayName }: { data: PersonalityInsights; displayName: string }) {
  const p = data.personality;
  const svg = useMemo(
    () =>
      buildPersonalityCardSvg({
        displayName,
        primaryTitle: p.primary_title,
        primaryBlurb: p.primary_blurb,
        secondaryTitle: p.secondary_title,
        moodLabel: data.lyric_sentiment.label,
        topGenres: data.genre_spread,
        recentMinutes: data.listening_time.estimated_recent_minutes,
        tracksAnalyzed: data.listening_time.tracks_analyzed,
      }),
    [data, displayName],
  );

  async function shareNative() {
    const text = data.share_lines.join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "My music personality", text });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {(data.scope_notes?.length ?? 0) > 0 ? (
          <div
            role="status"
            className="rounded-xl border border-amber-300/90 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
          >
            <p className="font-semibold text-amber-900 dark:text-amber-100">Some Spotify data was skipped</p>
            <ul className="mt-2 list-inside list-disc space-y-1.5 text-amber-900/95 dark:text-amber-100/95">
              {data.scope_notes!.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-emerald-900/90 via-zinc-900 to-zinc-950 p-6 text-zinc-50 shadow-lg dark:border-zinc-700">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300/90">Your profile</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{p.primary_title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{p.primary_blurb}</p>
          {p.secondary_title ? (
            <p className="mt-3 text-xs text-zinc-400">
              Also leaning <span className="font-semibold text-zinc-200">{p.secondary_title}</span>
            </p>
          ) : null}
          <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg bg-black/25 px-3 py-2">
              <dt className="text-zinc-500">Mood proxy</dt>
              <dd className="mt-0.5 font-medium text-zinc-100">{data.lyric_sentiment.label}</dd>
            </div>
            <div className="rounded-lg bg-black/25 px-3 py-2">
              <dt className="text-zinc-500">Recent listening</dt>
              <dd className="mt-0.5 font-medium text-zinc-100">
                ~{Math.round(data.listening_time.estimated_recent_minutes)} min ·{" "}
                {data.listening_time.recent_window_tracks} plays in window
              </dd>
            </div>
            <div className="rounded-lg bg-black/25 px-3 py-2 sm:col-span-2">
              <dt className="text-zinc-500">Audio averages</dt>
              <dd className="mt-0.5 font-mono text-[11px] text-zinc-200">
                valence {data.audio_features_summary.avg_valence?.toFixed(2)} · energy{" "}
                {data.audio_features_summary.avg_energy?.toFixed(2)} · dance{" "}
                {data.audio_features_summary.avg_danceability?.toFixed(2)} · acoustic{" "}
                {data.audio_features_summary.avg_acousticness?.toFixed(2)} · instrumental{" "}
                {data.audio_features_summary.avg_instrumentalness?.toFixed(2)} · speech{" "}
                {data.audio_features_summary.avg_speechiness?.toFixed(2)} · tempo{" "}
                {data.audio_features_summary.avg_tempo?.toFixed(0)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Genre spread</h3>
          <ul className="mt-2 space-y-1.5 text-xs">
            {data.genre_spread.slice(0, 12).map((g) => (
              <li key={g.name} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-medium text-zinc-800 dark:text-zinc-200" title={g.name}>
                  {g.name}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, g.weight * 100)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-zinc-500">{Math.round(g.weight * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <strong className="font-semibold">Not clinical.</strong> {data.lyric_sentiment.disclaimer} For fun and
          self-reflection only.
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Shareable card (SVG)</p>
        <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-inner dark:border-zinc-700">
          <div
            className="flex h-full w-full items-center justify-center [&>svg]:h-[1080px] [&>svg]:w-[1080px] [&>svg]:max-w-none [&>svg]:shrink-0 [&>svg]:scale-[0.29] sm:[&>svg]:scale-[0.3]"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => downloadSvg(`spotless-personality-${data.user.id}.svg`, svg)}
            className="rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Download SVG card
          </button>
          <button
            type="button"
            onClick={() => void shareNative()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Share / copy caption
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Archetype mix</p>
          <ul className="mt-2 space-y-2">
            {Object.entries(p.archetype_scores)
              .sort((a, b) => b[1] - a[1])
              .map(([slug, score]) => (
                <li key={slug} className="flex items-center gap-2 text-[11px]">
                  <span className="w-36 shrink-0 truncate capitalize text-zinc-700 dark:text-zinc-300">
                    {slugToLabel(slug)}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${score * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums text-zinc-500">{Math.round(score * 100)}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function ProfilerPage() {
  const { data: session } = useSession();
  useAuthGuard();
  const q = useQuery({
    queryKey: ["personalityInsights"],
    queryFn: () => getPersonalityInsights(session!.accessToken!),
    enabled: Boolean(session?.accessToken),
    staleTime: 120_000,
  });

  const displayName = session?.user?.name ?? q.data?.user.display_name ?? "You";

  return (
    <main className="min-h-[calc(100dvh-8rem)] bg-zinc-100 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Music personality</h1>
            <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
              Built from your genre spread, Spotify audio features, a valence/energy mood proxy (not lyrics), and
              recent listening time. Export an SVG card for social posts.
            </p>
          </div>
          <AppPageNav />
        </div>

        {session?.error ? (
          <ErrorRecoveryPanel
            title="Session error"
            message="Your Spotify session could not be refreshed. Sign out and sign in again so new scopes are granted."
          />
        ) : null}
        {q.isError ? (
          <ErrorRecoveryPanel
            title="Could not load profile"
            message={q.error instanceof Error ? q.error.message : "Unknown error"}
            onRetry={() => q.refetch()}
          />
        ) : null}

        {q.isPending ? (
          <p className="text-sm text-zinc-500">Pulling your top tracks, recent plays, and audio features…</p>
        ) : null}
        {q.data ? <InsightCard data={q.data} displayName={displayName} /> : null}
      </div>
    </main>
  );
}
