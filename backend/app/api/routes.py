import csv
import io
import json

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_token, get_user_header
from app.core.database import get_db
from app.models.entities import DuplicateRecord, Scan, User
from app.schemas.api import (
    CleanupOut,
    CleanupRequest,
    DuplicateOut,
    PlaylistOut,
    ScanOut,
    ScanRequest,
    TrackPreviewItem,
    UserContext,
)
from app.services.personality_service import build_personality_insights
from app.services.scan_service import create_scan, run_scan, upsert_user
from app.spotify.client import SpotifyClient

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/sync")
def auth_sync(payload: UserContext, db: Session = Depends(get_db)):
    user = upsert_user(db, payload.spotify_user_id, payload.display_name, payload.email)
    return {"id": user.id, "spotify_user_id": user.spotify_user_id}


@router.get("/playlists", response_model=list[PlaylistOut])
async def get_playlists(token: str = Depends(get_token)):
    spotify = SpotifyClient(token)
    raw = await spotify.get_playlists()
    return [
        PlaylistOut(
            id=p["id"],
            name=p.get("name") or "",
            owner=(p.get("owner") or {}).get("display_name"),
            owner_id=(p.get("owner") or {}).get("id"),
            is_public=p.get("public"),
            artwork_url=((p.get("images") or [{}])[0]).get("url"),
        )
        for p in raw
    ]


@router.get("/playlists/{playlist_id}/tracks-preview", response_model=list[TrackPreviewItem])
async def playlist_tracks_preview(
    playlist_id: str,
    limit: int = 50,
    token: str = Depends(get_token),
):
    spotify = SpotifyClient(token)
    market: str | None = None
    try:
        me = await spotify.get_me()
        market = me.get("country")
    except Exception:
        pass
    cap = max(1, min(limit, 100))
    rows = await spotify.get_playlist_tracks_preview(playlist_id, limit=cap, market=market)
    return [TrackPreviewItem(id=r["id"], name=r["name"], artists=r["artists"]) for r in rows]


@router.post("/scan", response_model=ScanOut)
def scan(
    payload: ScanRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(get_token),
    spotify_user_id: str = Depends(get_user_header),
    db: Session = Depends(get_db),
):
    user = db.execute(select(User).where(User.spotify_user_id == spotify_user_id)).scalar_one_or_none()
    if user is None:
        user = upsert_user(db, spotify_user_id, "Spotify User", None)
    scan_record = create_scan(db, user.id, payload.model_dump())
    background_tasks.add_task(run_scan, scan_record.id, token)
    return ScanOut(scan_id=scan_record.id, status=scan_record.status, created_at=scan_record.created_at)


@router.get("/duplicates/{scan_id}", response_model=list[DuplicateOut])
def duplicates(scan_id: int, db: Session = Depends(get_db)):
    records = db.execute(select(DuplicateRecord).where(DuplicateRecord.scan_id == scan_id)).scalars().all()
    return [
        DuplicateOut(
            id=record.id,
            track_1=record.track_1,
            track_2=record.track_2,
            similarity_score=record.similarity_score,
            duplicate_type=record.duplicate_type,
            metadata=record.metadata_json,
        )
        for record in records
    ]


@router.get("/scan/{scan_id}/status")
def scan_status(scan_id: int, db: Session = Depends(get_db)):
    scan_record = db.execute(select(Scan).where(Scan.id == scan_id)).scalar_one()
    err = None
    if isinstance(scan_record.request_payload, dict):
        err = scan_record.request_payload.get("scan_error")
    return {"scan_id": scan_record.id, "status": scan_record.status, "error": err}


@router.post("/cleanup", response_model=CleanupOut)
async def cleanup(payload: CleanupRequest, token: str = Depends(get_token)):
    spotify = SpotifyClient(token)
    removed = await spotify.remove_tracks(payload.playlist_id, payload.track_ids)
    return CleanupOut(removed=removed, playlist_id=payload.playlist_id)


@router.get("/personality/insights")
async def personality_insights(token: str = Depends(get_token)):
    try:
        return await build_personality_insights(token)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="Spotify rejected this request. Sign out and sign in again so new scopes (top tracks + recently played) are approved.",
            ) from e
        raise HTTPException(
            status_code=502,
            detail=(e.response.text or "")[:2000] or f"Spotify HTTP {e.response.status_code}",
        ) from e
    except RuntimeError as e:
        msg = str(e)
        if msg == "spotify_me_403":
            raise HTTPException(
                status_code=403,
                detail=(
                    "Spotify blocked your profile (GET /me, HTTP 403). Common causes:\n\n"
                    "• Development mode: In https://developer.spotify.com/dashboard open your app → "
                    "Settings → User management (or Users and access) → add the Spotify login email you use in Spotless, then save.\n"
                    "• Remove the app at https://www.spotify.com/account/apps/ , use Sign out in Spotless, then sign in with Spotify again.\n\n"
                    "If you still see Forbidden, request Extended quota / production access for broader API use."
                ),
            ) from e
        raise HTTPException(status_code=502, detail=msg) from e


@router.get("/export/{scan_id}")
def export_duplicates(scan_id: int, format: str = "csv", db: Session = Depends(get_db)):
    records = db.execute(select(DuplicateRecord).where(DuplicateRecord.scan_id == scan_id)).scalars().all()
    serializable = [
        {
            "id": record.id,
            "track_1": record.track_1,
            "track_2": record.track_2,
            "similarity_score": record.similarity_score,
            "duplicate_type": record.duplicate_type,
        }
        for record in records
    ]
    if format == "json":
        return {"content_type": "application/json", "content": json.dumps(serializable)}
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["id", "track_1", "track_2", "similarity_score", "duplicate_type"])
    writer.writeheader()
    writer.writerows(serializable)
    return {"content_type": "text/csv", "content": buffer.getvalue()}
