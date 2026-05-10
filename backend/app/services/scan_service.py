import logging
from datetime import datetime

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.detection.engine import detect_duplicates
from app.models.entities import DuplicateRecord, Scan, User
from app.spotify.client import SpotifyClient

logger = logging.getLogger(__name__)


def upsert_user(db: Session, spotify_user_id: str, display_name: str, email: str | None) -> User:
    user = db.execute(select(User).where(User.spotify_user_id == spotify_user_id)).scalar_one_or_none()
    if user is None:
        user = User(spotify_user_id=spotify_user_id, display_name=display_name, email=email)
        db.add(user)
    else:
        user.display_name = display_name
        user.email = email
    db.commit()
    db.refresh(user)
    return user


def create_scan(db: Session, user_id: int, payload: dict) -> Scan:
    scan = Scan(user_id=user_id, status="queued", request_payload=payload)
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def _mark_scan_failed(db: Session, scan_id: int, http_status: int | None, detail: str) -> None:
    scan = db.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
    if scan is None:
        return
    payload = dict(scan.request_payload) if isinstance(scan.request_payload, dict) else {}
    payload["scan_error"] = {"http_status": http_status, "detail": detail[:8000]}
    scan.request_payload = payload
    scan.status = "failed"
    scan.completed_at = datetime.utcnow()
    db.add(scan)
    db.commit()


async def run_scan(scan_id: int, token: str):
    db = SessionLocal()
    try:
        scan = db.execute(select(Scan).where(Scan.id == scan_id)).scalar_one()
        playlist_ids = scan.request_payload.get("playlist_ids", [])
        spotify = SpotifyClient(token)
        scan.status = "processing"
        db.commit()

        market: str | None = None
        try:
            me = await spotify.get_me()
            market = me.get("country")
        except (httpx.HTTPStatusError, HTTPException):
            logger.debug("Could not load /me for market hint during scan %s", scan_id)

        playlist_names: dict[str, str] = {}
        for pid in playlist_ids:
            try:
                mini = await spotify.get_playlist_mini(pid)
                playlist_names[pid] = str(mini.get("name") or pid)
            except (httpx.HTTPStatusError, HTTPException):
                playlist_names[pid] = pid

        all_tracks: list[dict] = []
        for playlist_id in playlist_ids:
            pl_name = playlist_names.get(playlist_id, playlist_id)
            async for track in spotify.iter_playlist_tracks(playlist_id, market=market):
                all_tracks.append(
                    track | {"playlist_id": playlist_id, "playlist_name": pl_name}
                )
        duplicates = detect_duplicates(all_tracks)
        for duplicate in duplicates:
            db.add(
                DuplicateRecord(
                    scan_id=scan.id,
                    track_1=duplicate["track_1"],
                    track_2=duplicate["track_2"],
                    similarity_score=duplicate["similarity_score"],
                    duplicate_type=duplicate["duplicate_type"],
                    metadata_json=duplicate.get("metadata") or {},
                )
            )
        scan.status = "completed"
        scan.completed_at = datetime.utcnow()
        db.commit()
    except httpx.HTTPStatusError as e:
        try:
            db.rollback()
        except Exception:
            pass
        body = (e.response.text or "")[:8000]
        logger.warning(
            "Spotify HTTP %s during scan %s: %s",
            e.response.status_code,
            scan_id,
            body[:500],
        )
        _mark_scan_failed(db, scan_id, e.response.status_code, body)
    except HTTPException as e:
        try:
            db.rollback()
        except Exception:
            pass
        detail = str(e.detail) if e.detail is not None else ""
        logger.warning("Spotify API error during scan %s: HTTP %s %s", scan_id, e.status_code, detail[:500])
        _mark_scan_failed(db, scan_id, e.status_code, detail[:8000])
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception("Scan %s failed with unexpected error", scan_id)
        _mark_scan_failed(db, scan_id, None, "Unexpected server error during scan; check backend logs.")
    finally:
        db.close()
