from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Spotify Duplicate Cleaner API"
    environment: str = "development"
    frontend_origin: str = "http://127.0.0.1:3000"
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/spotify_cleaner"
    spotify_api_base_url: str = "https://api.spotify.com/v1"
    # Pause after each successful Spotify response (all endpoints). Helps avoid Spotify 429 bursts.
    spotify_request_delay_seconds: float = 0.2
    # Extra pause before each /me/playlists page after the first (offset pagination).
    spotify_playlists_inter_page_delay_seconds: float = 0.75
    # Retries for Spotify 429 / 503; honors Retry-After header when present.
    spotify_max_retries: int = 7
    spotify_retry_backoff_max_seconds: float = 60.0
    # If Spotify 429/503 implies a sleep longer than this (seconds), return the error to the client instead of
    # blocking the inbound HTTP request (avoids proxy/browser timeouts). 0 disables (always retry in-process).
    spotify_max_inline_429_wait_seconds: float = 15.0
    # Per-IP limit for *this* API (not Spotify). Keep high enough that normal UI + pagination is not blocked.
    api_rate_limit_per_minute: int = 120
    auth_shared_secret: str = "dev-only-change-me"

    @field_validator("api_rate_limit_per_minute", mode="before")
    @classmethod
    def _api_rate_limit_sane(cls, v: object) -> int:
        """Negative/zero values make `len(recent) > limit` true on the first request (e.g. 0 > -1)."""
        try:
            n = int(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 120
        if n < 1:
            return 120
        return min(n, 1_000_000)

    @field_validator("spotify_max_inline_429_wait_seconds", mode="before")
    @classmethod
    def _inline_429_wait(cls, v: object) -> float:
        try:
            x = float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 15.0
        return max(0.0, x)


@lru_cache
def get_settings() -> Settings:
    return Settings()
