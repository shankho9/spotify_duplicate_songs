"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { cleanupTracks, getDuplicates } from "@/services/api";
import type { Duplicate, DuplicateMetadata, DuplicateTrackSnapshot } from "@/types";

const DUPLICATE_TYPE_RANK: Record<string, number> = { exact: 3, isrc: 2, smart: 1 };

function isDuplicateMetadata(m: unknown): m is DuplicateMetadata {
  return typeof m === "object" && m !== null && ("track_1" in m || "track_2" in m);
}

/** One row per unordered track pair (same two songs), keeping the strongest match. */
function dedupeDuplicateRows(rows: Duplicate[]): Duplicate[] {
  const map = new Map<string, Duplicate>();
  for (const d of rows) {
    const m = isDuplicateMetadata(d.metadata) ? d.metadata : undefined;
    const id1 = (m?.track_1?.id ?? d.track_1) || "";
    const id2 = (m?.track_2?.id ?? d.track_2) || "";
    if (!id1 || !id2) {
      map.set(`row:${d.id}`, d);
      continue;
    }
    const lo = id1 < id2 ? id1 : id2;
    const hi = id1 < id2 ? id2 : id1;
    const key = `${lo}::${hi}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, d);
      continue;
    }
    const better = pickStrongerDuplicate(existing, d);
    map.set(key, better);
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

function pickStrongerDuplicate(a: Duplicate, b: Duplicate): Duplicate {
  const diff = a.similarity_score - b.similarity_score;
  if (Math.abs(diff) > 1e-6) return diff >= 0 ? a : b;
  const ra = DUPLICATE_TYPE_RANK[a.duplicate_type] ?? 0;
  const rb = DUPLICATE_TYPE_RANK[b.duplicate_type] ?? 0;
  if (ra !== rb) return ra >= rb ? a : b;
  return a.id <= b.id ? a : b;
}

function formatArtists(artists: string[] | undefined | null): string {
  if (!artists?.length) return "—";
  return artists.join(", ");
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function duplicatesToCsv(rows: Duplicate[]): string {
  const headers = [
    "id",
    "duplicate_type",
    "similarity_score",
    "track_1_id",
    "track_1_name",
    "track_1_artists",
    "track_1_playlist_id",
    "track_1_playlist_name",
    "track_2_id",
    "track_2_name",
    "track_2_artists",
    "track_2_playlist_id",
    "track_2_playlist_name",
  ];
  const lines = [headers.join(",")];
  for (const d of rows) {
    const m = isDuplicateMetadata(d.metadata) ? d.metadata : undefined;
    const t1 = m?.track_1;
    const t2 = m?.track_2;
    lines.push(
      [
        d.id,
        d.duplicate_type,
        d.similarity_score,
        t1?.id ?? "",
        t1?.name ?? "",
        formatArtists(t1?.artists),
        t1?.playlist_id ?? "",
        t1?.playlist_name ?? "",
        t2?.id ?? "",
        t2?.name ?? "",
        formatArtists(t2?.artists),
        t2?.playlist_id ?? "",
        t2?.playlist_name ?? "",
      ]
        .map((c) => csvEscape(String(c)))
        .join(","),
    );
  }
  return lines.join("\n");
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TrackCell({
  snap,
  onRemove,
  removing,
}: {
  snap: DuplicateTrackSnapshot | undefined;
  onRemove: () => void;
  removing: boolean;
}) {
  const title = snap?.name ?? "—";
  const pl = snap?.playlist_name ?? snap?.playlist_id ?? "—";
  const canRemove = Boolean(snap?.playlist_id && snap?.id);
  return (
    <td className="max-w-[11rem] align-top px-2 py-1.5 text-[11px] leading-snug text-zinc-800 dark:text-zinc-200">
      <div className="font-medium text-zinc-900 dark:text-zinc-50">{title}</div>
      <div className="text-zinc-500 dark:text-zinc-400">{formatArtists(snap?.artists)}</div>
      <div className="mt-0.5 truncate text-zinc-500" title={pl}>
        {pl}
      </div>
      {canRemove ? (
        <button
          type="button"
          disabled={removing}
          onClick={onRemove}
          className="mt-1 rounded border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Remove
        </button>
      ) : null}
    </td>
  );
}

type DuplicatesPanelProps = {
  scanId: number | null;
};

export function DuplicatesPanel({ scanId }: DuplicatesPanelProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const token = session?.accessToken;

  const duplicates = useQuery({
    queryKey: ["duplicates", scanId],
    queryFn: () => getDuplicates(token!, scanId!),
    enabled: Boolean(token && scanId),
    refetchInterval: 20_000,
  });

  const removeMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => {
      if (!token) throw new Error("Not signed in");
      return cleanupTracks(token, playlistId, [trackId]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["duplicates", scanId] });
      await queryClient.invalidateQueries({ queryKey: ["playlist-tracks-preview"] });
    },
  });

  const rawRows = duplicates.data ?? [];
  const rows = useMemo(() => dedupeDuplicateRows(rawRows), [rawRows]);
  const mergedCount = rawRows.length - rows.length;

  if (!scanId) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Run <strong>Scan selected</strong> to see duplicates here.
      </p>
    );
  }

  if (duplicates.isPending) {
    return <p className="text-xs text-zinc-500">Loading duplicates…</p>;
  }

  if (duplicates.isError) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        {duplicates.error instanceof Error ? duplicates.error.message : "Could not load duplicates."}
      </p>
    );
  }

  if (rawRows.length === 0) {
    return <p className="text-xs text-zinc-600 dark:text-zinc-300">No duplicates in this scan.</p>;
  }

  const v = removeMutation.variables;
  const jsonBlob = () => downloadText(`duplicates-scan-${scanId}.json`, JSON.stringify(rows, null, 2), "application/json");
  const csvBlob = () => downloadText(`duplicates-scan-${scanId}.csv`, duplicatesToCsv(rows), "text/csv;charset=utf-8");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {rows.length} unique pair{rows.length === 1 ? "" : "s"}
          {mergedCount > 0 ? (
            <span className="text-zinc-500"> · merged {mergedCount} duplicate row{mergedCount === 1 ? "" : "s"}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={jsonBlob}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Save JSON
        </button>
        <button
          type="button"
          onClick={csvBlob}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Save CSV
        </button>
      </div>
      {removeMutation.isError ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          {removeMutation.error instanceof Error ? removeMutation.error.message : "Remove failed"}
        </p>
      ) : null}
      <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-[1] border-b border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
            <tr>
              <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">#</th>
              <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">Type</th>
              <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">%</th>
              <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">Track A</th>
              <th className="px-2 py-1.5 font-semibold text-zinc-600 dark:text-zinc-300">Track B</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {rows.map((duplicate, i) => {
              const meta = isDuplicateMetadata(duplicate.metadata) ? duplicate.metadata : undefined;
              const pending1 =
                removeMutation.isPending &&
                v?.trackId === meta?.track_1?.id &&
                v?.playlistId === meta?.track_1?.playlist_id;
              const pending2 =
                removeMutation.isPending &&
                v?.trackId === meta?.track_2?.id &&
                v?.playlistId === meta?.track_2?.playlist_id;
              return (
                <tr key={duplicate.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50">
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-500">{i + 1}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                    {duplicate.duplicate_type}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {(duplicate.similarity_score * 100).toFixed(0)}
                  </td>
                  <TrackCell
                    snap={meta?.track_1}
                    removing={Boolean(pending1)}
                    onRemove={() => {
                      const pid = meta?.track_1?.playlist_id;
                      const tid = meta?.track_1?.id;
                      if (pid && tid) removeMutation.mutate({ playlistId: pid, trackId: tid });
                    }}
                  />
                  <TrackCell
                    snap={meta?.track_2}
                    removing={Boolean(pending2)}
                    onRemove={() => {
                      const pid = meta?.track_2?.playlist_id;
                      const tid = meta?.track_2?.id;
                      if (pid && tid) removeMutation.mutate({ playlistId: pid, trackId: tid });
                    }}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
