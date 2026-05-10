import logging
from collections import Counter

import httpx
from fastapi import HTTPException

from app.personality.engine import build_metrics_from_signals, infer_personality
from app.spotify.client import SpotifyClient

logger = logging.getLogger(__name__)


async def _spotify_list_on_403(
    awaitable,
    label: str,
    scope_hint: str,
    *,
    log_level: int = logging.WARNING,
) -> tuple[list, bool]:
    """Return (data, True) if Spotify returned HTTP 403 and we recovered with []."""
    try:
        data = await awaitable
        if not isinstance(data, list):
            return ([], False)
        return (data, False)
    except httpx.HTTPStatusError as e:
        if e.response.status_code != 403:
            raise
        body = (e.response.text or "")[:400]
        logger.log(log_level, "Spotify 403 on %s (%s): %s", label, scope_hint, body)
        return ([], True)
    except HTTPException as e:
        if e.status_code != 403:
            raise
        raw = e.detail
        if isinstance(raw, list):
            body = str(raw)[:400]
        else:
            body = (str(raw) if raw is not None else "")[:400]
        logger.log(log_level, "Spotify 403 on %s (%s): %s", label, scope_hint, body)
        return ([], True)


def _track_meta_from_obj(track: dict) -> dict:
    album = track.get("album") or {}
    return {
        "id": track.get("id"),
        "name": track.get("name"),
        "explicit": bool(track.get("explicit")),
        "release_date": album.get("release_date") or "",
        "artist_ids": [a.get("id") for a in (track.get("artists") or []) if a.get("id")],
    }


async def build_personality_insights(token: str) -> dict:
    spotify = SpotifyClient(token)
    try:
        me = await spotify.get_me()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"spotify_me_{e.response.status_code}") from e
    except HTTPException as e:
        if e.status_code == 403:
            raise RuntimeError("spotify_me_403") from e
        raise

    market = me.get("country")

    scope_notes: list[str] = []

    top_short, ts403 = await _spotify_list_on_403(
        spotify.get_top_tracks("short_term", 40, market),
        "me/top/tracks short_term",
        "user-top-read",
    )
    if not top_short and market is not None:
        top_short, ts403b = await _spotify_list_on_403(
            spotify.get_top_tracks("short_term", 40, None),
            "me/top/tracks short_term (no market)",
            "user-top-read",
        )
        ts403 = ts403 or ts403b
    top_medium, tm403 = await _spotify_list_on_403(
        spotify.get_top_tracks("medium_term", 20, market),
        "me/top/tracks medium_term",
        "user-top-read",
    )
    if not top_medium and market is not None:
        top_medium, tm403b = await _spotify_list_on_403(
            spotify.get_top_tracks("medium_term", 20, None),
            "me/top/tracks medium_term (no market)",
            "user-top-read",
        )
        tm403 = tm403 or tm403b

    recent, recent403 = await _spotify_list_on_403(
        spotify.get_recently_played(50),
        "me/player/recently-played",
        "user-read-recently-played",
    )

    if ts403 or tm403:
        scope_notes.append(
            "Top tracks were blocked by Spotify (HTTP 403), usually because `user-top-read` is not on your "
            "current access token. Sign out of Spotless and sign in with Spotify again to approve scopes."
        )
    elif not top_short and not top_medium:
        scope_notes.append(
            "No top tracks returned for these windows (new or private account, or scopes not granted)."
        )

    if recent403:
        scope_notes.append(
            "Recently played was blocked by Spotify (HTTP 403), usually missing `user-read-recently-played`. "
            "Re-authenticate to add listening-time signals."
        )

    tracks_meta: list[dict] = []
    track_ids: list[str] = []
    seen: set[str] = set()

    for t in top_short + top_medium:
        tid = t.get("id")
        if not tid or tid in seen:
            continue
        seen.add(tid)
        tracks_meta.append(_track_meta_from_obj(t))
        track_ids.append(tid)

    for item in recent:
        tr = item.get("track") or {}
        tid = tr.get("id")
        if not tid or tid in seen:
            continue
        seen.add(tid)
        tracks_meta.append(_track_meta_from_obj(tr))
        track_ids.append(tid)
        if len(track_ids) >= 100:
            break

    artist_ids: list[str] = []
    seen_a: set[str] = set()
    for tm in tracks_meta:
        for aid in tm.get("artist_ids") or []:
            if aid and aid not in seen_a:
                seen_a.add(aid)
                artist_ids.append(aid)
                if len(artist_ids) >= 100:
                    break
        if len(artist_ids) >= 100:
            break

    artists, art403 = await _spotify_list_on_403(
        spotify.get_artists_many(artist_ids),
        "artists",
        "optional metadata (genres)",
        log_level=logging.INFO,
    )
    genre_counts: Counter[str] = Counter()
    for ar in artists:
        for g in ar.get("genres") or []:
            genre_counts[g] += 1

    audio_features, af403 = await _spotify_list_on_403(
        spotify.get_audio_features_many(track_ids),
        "audio-features",
        "optional metadata (valence/energy)",
        log_level=logging.INFO,
    )

    if art403:
        scope_notes.append(
            "Spotify returned HTTP 403 for bulk artist metadata. That is often an API-access restriction on "
            "the app (not a missing user scope). Genre-based signals are skipped; personality still uses "
            "listening history, release years, and explicit flags."
        )
    if af403:
        scope_notes.append(
            "Spotify returned HTTP 403 for audio features. Spotify has restricted this endpoint for many "
            "third-party apps; valence/energy-style metrics default to neutral and the profile uses other "
            "signals instead."
        )
    metrics = build_metrics_from_signals(
        genre_counts=genre_counts,
        audio_features=audio_features,
        tracks_meta=tracks_meta,
        recent_items=[x for x in recent if isinstance(x, dict)],
    )
    personality = infer_personality(metrics)

    # "Lyric sentiment" is approximated from valence/energy (Spotify does not expose lyrics here).
    v = metrics["avg_valence"]
    e = metrics["avg_energy"]
    if v >= 0.58 and e >= 0.55:
        mood_label = "Bright & outward (proxy)"
    elif v <= 0.42:
        mood_label = "Introspective / melancholy lean (proxy)"
    else:
        mood_label = "Balanced emotional tone (proxy)"

    top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    total_g = sum(c for _, c in top_genres) or 1
    genre_spread = [{"name": n, "weight": round(c / total_g, 4)} for n, c in top_genres]

    if not track_ids:
        scope_notes.append(
            "No tracks were available to analyze (top tracks and recently played were empty or blocked). "
            "Use Spotify for a while, then refresh, or sign in again to grant `user-top-read` and "
            "`user-read-recently-played`."
        )

    share_lines = [
        f"I'm a {personality['primary_title']} on Spotless.",
        personality["primary_blurb"],
        f"~{int(metrics['recent_listening_minutes'])} min in recent sessions · top vibe: {mood_label}",
        "#Spotify #MusicPersonality",
    ]

    return {
        "user": {"display_name": me.get("display_name") or "Listener", "id": me.get("id")},
        "personality": personality,
        "metrics": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in metrics.items()},
        "genre_spread": genre_spread,
        "audio_features_summary": {
            "avg_valence": round(metrics["avg_valence"], 3),
            "avg_energy": round(metrics["avg_energy"], 3),
            "avg_danceability": round(metrics["avg_danceability"], 3),
            "avg_acousticness": round(metrics["avg_acousticness"], 3),
            "avg_instrumentalness": round(metrics["avg_instrumentalness"], 3),
            "avg_speechiness": round(metrics["avg_speechiness"], 3),
            "avg_tempo": round(metrics["avg_tempo"], 1),
        },
        "lyric_sentiment": {
            "method": "proxy_from_audio_valence_energy",
            "label": mood_label,
            "disclaimer": "Spotify Web API does not provide lyrics; this is a fun audio-based mood hint, not text sentiment.",
        },
        "listening_time": {
            "recent_window_tracks": len(recent),
            "estimated_recent_minutes": round(metrics["recent_listening_minutes"], 1),
            "tracks_analyzed": len(tracks_meta),
        },
        "share_lines": share_lines,
        "scope_notes": list(dict.fromkeys(scope_notes)),
    }
