from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import AsyncGenerator
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def raise_for_spotify_response(response: httpx.Response) -> None:
    """Turn failed Spotify HTTP responses into FastAPI errors (avoid generic 500)."""
    if response.is_success:
        return
    code = response.status_code
    snippet = (response.text or "")[:800]
    if code == status.HTTP_429_TOO_MANY_REQUESTS:
        ra = response.headers.get("Retry-After")
        body: dict[str, Any] = {
            "message": "Spotify returned HTTP 429 (rate limit). If this is the first request, your Spotify app "
            "may be over quota or your network shares a heavily used IP—check the Spotify Developer Dashboard "
            "and try again later.",
            "error_code": "spotify_rate_limit",
        }
        if ra:
            body["retry_after_header"] = ra
        kwargs: dict[str, Any] = {
            "status_code": status.HTTP_429_TOO_MANY_REQUESTS,
            "detail": body,
        }
        if ra:
            kwargs["headers"] = {"Retry-After": ra}
        raise HTTPException(**kwargs)
    if code == status.HTTP_401_UNAUTHORIZED:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Spotify rejected the access token (invalid or expired). Sign in again.",
        )
    if code == status.HTTP_403_FORBIDDEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=snippet or "Spotify rejected this request.",
        )
    if code == status.HTTP_404_NOT_FOUND:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=snippet or "Not found on Spotify.",
        )
    if 400 <= code < 500:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify client error ({code}): {snippet or code}",
        )
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Spotify error ({code}): {snippet or code}",
    )


def _normalize_spotify_next_path(next_url: str) -> str:
    if not next_url:
        return ""
    if next_url.startswith("http"):
        parsed = urlparse(next_url)
        q = f"?{parsed.query}" if parsed.query else ""
        return f"{parsed.path}{q}"
    return next_url


def _parse_retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(raw)
        if dt is not None:
            return max(0.0, dt.timestamp() - time.time())
    except (TypeError, ValueError, OSError):
        pass
    return None


class SpotifyClient:
    def __init__(self, access_token: str):
        self.access_token = access_token

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}

    async def _request_with_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any | None = None,
        content: bytes | None = None,
    ) -> httpx.Response:
        settings = get_settings()
        max_attempts = max(1, settings.spotify_max_retries + 1)
        cap = max(1.0, float(settings.spotify_retry_backoff_max_seconds))
        delay = max(0.0, float(settings.spotify_request_delay_seconds))

        last: httpx.Response | None = None
        for attempt in range(max_attempts):
            response = await client.request(
                method,
                url,
                headers=self.headers,
                params=params,
                json=json,
                content=content,
            )
            last = response

            if response.status_code not in (429, 503):
                if delay > 0:
                    await asyncio.sleep(delay)
                return response

            if attempt >= max_attempts - 1:
                return response

            parsed = _parse_retry_after_seconds(response)
            if parsed is None:
                wait = min((2**attempt) + random.random() * 0.25, cap)
            else:
                wait = min(parsed, cap)
            wait = float(max(0.25, wait))
            max_inline = float(settings.spotify_max_inline_429_wait_seconds)
            if max_inline > 0 and wait > max_inline:
                logger.warning(
                    "Spotify %s for %s %s — would sleep %.1fs (exceeds spotify_max_inline_429_wait_seconds=%.1fs); "
                    "returning to client so it can retry without holding this HTTP request open",
                    response.status_code,
                    method,
                    url,
                    wait,
                    max_inline,
                )
                return response

            wait = min(wait, cap)
            logger.warning(
                "Spotify %s for %s %s — sleeping %.1fs (retry %s/%s)",
                response.status_code,
                method,
                url,
                wait,
                attempt + 2,
                max_attempts,
            )
            await asyncio.sleep(wait)

        assert last is not None
        return last

    async def get_me(self) -> dict:
        settings = get_settings()
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            response = await self._request_with_retry(client, "GET", "/me")
            raise_for_spotify_response(response)
            return response.json()

    async def get_playlists(self) -> list[dict]:
        """All current-user playlists, paginated with limit/offset per Spotify Web API.

        Docs: https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists
        Query params: `limit` (1–50, default 20) and `offset` (0-based index). Prefer offset
        pagination over following `next` URLs for `/me/playlists` (known `next` URL quirks).
        """
        settings = get_settings()
        page_limit = 50
        inter_page = max(0.0, float(settings.spotify_playlists_inter_page_delay_seconds))
        all_items: list[dict] = []
        offset = 0
        total: int | None = None
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            while True:
                if offset > 0 and inter_page > 0:
                    await asyncio.sleep(inter_page)
                response = await self._request_with_retry(
                    client,
                    "GET",
                    "/me/playlists",
                    params={"limit": page_limit, "offset": offset},
                )
                raise_for_spotify_response(response)
                body = response.json()
                if total is None and isinstance(body.get("total"), int):
                    total = body["total"]
                batch = body.get("items") or []
                if not batch:
                    break
                all_items.extend(batch)
                offset += len(batch)
                if len(batch) < page_limit:
                    break
                if total is not None and offset >= total:
                    break
        return all_items

    async def get_playlist_mini(self, playlist_id: str) -> dict:
        settings = get_settings()
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            response = await self._request_with_retry(
                client,
                "GET",
                f"/playlists/{playlist_id}",
                params={"fields": "name"},
            )
            raise_for_spotify_response(response)
            return response.json()

    async def get_playlist_tracks_preview(
        self, playlist_id: str, limit: int = 50, market: str | None = None
    ) -> list[dict]:
        preview: list[dict] = []
        async for track in self.iter_playlist_tracks(playlist_id, market=market):
            preview.append(
                {
                    "id": track["id"],
                    "name": track.get("name", ""),
                    "artists": track.get("artists") or [],
                }
            )
            if len(preview) >= limit:
                break
        return preview

    async def iter_playlist_tracks(
        self, playlist_id: str, market: str | None = None
    ) -> AsyncGenerator[dict, None]:
        # Feb 2026 Web API: /playlists/{id}/tracks can return 403 for dev-mode apps; use /items.
        settings = get_settings()
        q = "limit=100&additional_types=track"
        if market:
            q += f"&market={market}"
        next_url = f"/playlists/{playlist_id}/items?{q}"
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            while next_url:
                response = await self._request_with_retry(client, "GET", next_url)
                raise_for_spotify_response(response)
                data = response.json()
                for item in data.get("items", []):
                    track = item.get("track") or item.get("item") or {}
                    if not track.get("id"):
                        continue
                    external_ids = track.get("external_ids") or {}
                    yield {
                        "id": track.get("id", ""),
                        "name": track.get("name", ""),
                        "artists": [artist.get("name", "") for artist in track.get("artists", [])],
                        "isrc": external_ids.get("isrc"),
                        "album": (track.get("album") or {}).get("name", ""),
                        "explicit": track.get("explicit", False),
                        "popularity": track.get("popularity", 0),
                        "duration_ms": track.get("duration_ms", 0),
                        "added_at": item.get("added_at"),
                    }
                next_url = _normalize_spotify_next_path(data.get("next") or "")

    async def remove_tracks(self, playlist_id: str, track_ids: list[str]) -> int:
        if not track_ids:
            return 0
        settings = get_settings()
        removed = 0
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            for i in range(0, len(track_ids), 100):
                chunk = track_ids[i : i + 100]
                payload = {"items": [{"uri": f"spotify:track:{tid}"} for tid in chunk]}
                response = await self._request_with_retry(
                    client,
                    "DELETE",
                    f"/playlists/{playlist_id}/items",
                    json=payload,
                )
                raise_for_spotify_response(response)
                removed += len(chunk)
        return removed

    async def get_top_tracks(self, time_range: str, limit: int, market: str | None = None) -> list[dict]:
        settings = get_settings()
        lim = max(1, min(limit, 50))
        params: dict[str, str | int] = {"time_range": time_range, "limit": lim}
        if market:
            params["market"] = market
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            response = await self._request_with_retry(client, "GET", "/me/top/tracks", params=params)
            raise_for_spotify_response(response)
            return response.json().get("items", [])

    async def get_recently_played(self, limit: int = 50) -> list[dict]:
        settings = get_settings()
        lim = max(1, min(limit, 50))
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            response = await self._request_with_retry(
                client,
                "GET",
                "/me/player/recently-played",
                params={"limit": lim},
            )
            raise_for_spotify_response(response)
            return response.json().get("items", [])

    async def get_audio_features_many(self, track_ids: list[str]) -> list[dict]:
        if not track_ids:
            return []
        settings = get_settings()
        out: list[dict] = []
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            for i in range(0, len(track_ids), 100):
                chunk = track_ids[i : i + 100]
                response = await self._request_with_retry(
                    client,
                    "GET",
                    "/audio-features",
                    params={"ids": ",".join(chunk)},
                )
                raise_for_spotify_response(response)
                for feat in response.json().get("audio_features") or []:
                    if isinstance(feat, dict) and feat.get("id"):
                        out.append(feat)
        return out

    async def get_artists_many(self, artist_ids: list[str]) -> list[dict]:
        if not artist_ids:
            return []
        settings = get_settings()
        out: list[dict] = []
        async with httpx.AsyncClient(base_url=settings.spotify_api_base_url, timeout=30) as client:
            for i in range(0, len(artist_ids), 50):
                chunk = artist_ids[i : i + 50]
                response = await self._request_with_retry(
                    client,
                    "GET",
                    "/artists",
                    params={"ids": ",".join(chunk)},
                )
                raise_for_spotify_response(response)
                for ar in response.json().get("artists") or []:
                    if isinstance(ar, dict) and ar.get("id"):
                        out.append(ar)
        return out
