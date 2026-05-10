from datetime import datetime
from pydantic import BaseModel, Field


class UserContext(BaseModel):
    spotify_user_id: str
    display_name: str = "Spotify User"
    email: str | None = None


class PlaylistOut(BaseModel):
    id: str
    name: str
    owner: str | None = None
    owner_id: str | None = None
    is_public: bool | None = None
    artwork_url: str | None = None


class TrackPreviewItem(BaseModel):
    id: str
    name: str
    artists: list[str]


class ScanRequest(BaseModel):
    playlist_ids: list[str] = Field(default_factory=list)
    mode: str = "safe"


class ScanOut(BaseModel):
    scan_id: int
    status: str
    created_at: datetime


class DuplicateOut(BaseModel):
    id: int
    track_1: str
    track_2: str
    similarity_score: float
    duplicate_type: str
    metadata: dict = Field(default_factory=dict)


class CleanupRequest(BaseModel):
    playlist_id: str
    track_ids: list[str]
    mode: str = "safe"


class CleanupOut(BaseModel):
    removed: int
    playlist_id: str


class ExportOut(BaseModel):
    content: str
    content_type: str
