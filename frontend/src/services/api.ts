import type { Duplicate, PersonalityInsights, Playlist } from "@/types";

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

function messageFromErrorBody(body: { detail?: unknown; error_code?: string }): string | null {
  if (typeof body.detail === "string") return body.detail;
  if (typeof body.detail === "object" && body.detail !== null && "message" in body.detail) {
    const m = (body.detail as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (Array.isArray(body.detail)) {
    const parts = body.detail
      .map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : ""))
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return null;
}

async function fetchJson<T>(path: string, accessToken: string, spotifyUserId?: string): Promise<T> {
  const response = await fetch(`${backendBase}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(spotifyUserId ? { "X-Spotify-User-Id": spotifyUserId } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown; error_code?: string };
      const parsed = messageFromErrorBody(body);
      if (parsed) message = parsed;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function getPlaylists(accessToken: string) {
  return fetchJson<Playlist[]>("/playlists", accessToken);
}

export type TrackPreview = { id: string; name: string; artists: string[] };

export function getPlaylistTracksPreview(accessToken: string, playlistId: string, limit = 50) {
  const q = limit !== 50 ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return fetchJson<TrackPreview[]>(`/playlists/${playlistId}/tracks-preview${q}`, accessToken);
}

export async function createScan(accessToken: string, spotifyUserId: string, playlistIds: string[]) {
  const response = await fetch(`${backendBase}/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Spotify-User-Id": spotifyUserId,
    },
    body: JSON.stringify({ playlist_ids: playlistIds, mode: "safe" }),
  });
  if (!response.ok) throw new Error(`Scan failed: ${response.status}`);
  return response.json() as Promise<{ scan_id: number; status: string }>;
}

export type ScanStatusResponse = {
  scan_id: number;
  status: string;
  error?: { http_status: number | null; detail: string } | null;
};

export function getScanStatus(accessToken: string, scanId: number) {
  return fetchJson<ScanStatusResponse>(`/scan/${scanId}/status`, accessToken);
}

export function getDuplicates(accessToken: string, scanId: number) {
  return fetchJson<Duplicate[]>(`/duplicates/${scanId}`, accessToken);
}

export async function cleanupTracks(accessToken: string, playlistId: string, trackIds: string[]) {
  const response = await fetch(`${backendBase}/cleanup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ playlist_id: playlistId, track_ids: trackIds, mode: "safe" }),
  });
  if (!response.ok) throw new Error(`Cleanup failed: ${response.status}`);
  return response.json() as Promise<{ removed: number }>;
}

export async function exportDuplicates(accessToken: string, scanId: number, format: "csv" | "json") {
  const response = await fetch(`${backendBase}/export/${scanId}?format=${format}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Export failed");
  return response.json() as Promise<{ content: string; content_type: string }>;
}

export async function getPersonalityInsights(accessToken: string): Promise<PersonalityInsights> {
  const response = await fetch(`${backendBase}/personality/insights`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      const d = body.detail;
      if (typeof d === "string") message = d;
      else if (Array.isArray(d))
        message = d
          .map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : ""))
          .filter(Boolean)
          .join("; ");
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return response.json() as Promise<PersonalityInsights>;
}
