# Spotless™ — Backend API

FastAPI service for **Spotless**: playlist ingestion, duplicate detection, scans, exports, and Spotify playlist cleanup. The [Next.js frontend](../frontend/) handles Spotify OAuth (NextAuth); this API accepts the user’s Spotify **access token** on each request and talks to the [Spotify Web API](https://developer.spotify.com/documentation/web-api).

## Stack

- **Python 3.12+** (3.11+ usually works)
- **FastAPI** + **Uvicorn**
- **SQLAlchemy** + **PostgreSQL** (`psycopg`)
- **httpx** (async Spotify HTTP client)
- **rapidfuzz** + **pandas** (duplicate detection pipeline)
- **pytest** (tests)

## Project layout

```
backend/
├── main.py                 # App entry: CORS, rate limit, DB create_all, routes
├── requirements.txt
├── .env.example            # Copy to .env and adjust
├── app/
│   ├── api/                # HTTP routes and dependencies
│   ├── core/               # Settings, database engine/session
│   ├── detection/          # Duplicate matching logic
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic request/response models
│   ├── services/           # Scan orchestration
│   ├── spotify/            # Spotify API client
│   └── utils/              # Normalization helpers
└── tests/                  # pytest tests
```

## Prerequisites

- **PostgreSQL** running and a database created (e.g. `spotify_cleaner`).
- A **Spotify Developer** app (used by the frontend for OAuth). This backend does not store Spotify client id/secret; it only needs a valid **user access token** passed from the client.

## Configuration

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`. Variables map to `app/core/config.py` (Pydantic Settings; names are case-insensitive).

| Variable | Purpose |
|----------|---------|
| `APP_NAME` | FastAPI title |
| `ENVIRONMENT` | e.g. `development` / `production` |
| `FRONTEND_ORIGIN` | CORS allowed origin (e.g. `http://localhost:3000`) |
| `DATABASE_URL` | SQLAlchemy URL, e.g. `postgresql+psycopg://user:pass@host:5432/spotify_cleaner` |
| `SPOTIFY_API_BASE_URL` | Default `https://api.spotify.com/v1` |
| `SPOTIFY_REQUEST_DELAY_SECONDS` | Pause after each successful Spotify API response (all endpoints; default `0.2`) |
| `SPOTIFY_PLAYLISTS_INTER_PAGE_DELAY_SECONDS` | Pause before page 2+ of `/me/playlists` when paginating (default `0.75`) |
| `SPOTIFY_MAX_RETRIES` | Retries for Spotify 429/503 (default `7`) |
| `SPOTIFY_RETRY_BACKOFF_MAX_SECONDS` | Cap on exponential backoff between retries (default `60`) |
| `API_RATE_LIMIT_PER_MINUTE` | Per-IP sliding window for **this** API (default `120`; very low values return HTTP 429 from Spotless, not Spotify) |
| `AUTH_SHARED_SECRET` | Reserved for future stricter auth; not required for current Bearer flow |

On startup, `main.py` runs `Base.metadata.create_all()` — tables are created if missing (no Alembic migrations in this MVP).

## Install and run

From the `backend/` directory:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- **OpenAPI docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health**: `GET /health` → `{"status":"ok"}`

### Docker (repo root)

From the repository root, `docker-compose.yml` can run Postgres + this API together. Set `DATABASE_URL` inside the compose service to point at the `postgres` service host.

## Authentication (how the frontend calls this API)

Most endpoints expect:

- **`Authorization: Bearer <spotify_access_token>`** — the OAuth access token for the logged-in user.
- **`X-Spotify-User-Id: <spotify_user_id>`** — required for `POST /scan` so scans are tied to the correct user.

Do **not** log or commit real tokens. Use HTTPS in production.

## API overview

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | Liveness |
| `POST` | `/auth/sync` | Upsert user from `{ spotify_user_id, display_name, email }` |
| `GET` | `/playlists` | Bearer only; lists playlists from Spotify [`/me/playlists`](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists) with `limit`/`offset` pagination. |
| `POST` | `/scan` | Body: `{ "playlist_ids": ["..."], "mode": "safe" }`; Bearer + `X-Spotify-User-Id`; enqueues background scan |
| `GET` | `/scan/{scan_id}/status` | `{ scan_id, status }` |
| `GET` | `/duplicates/{scan_id}` | Duplicate rows for a completed scan |
| `POST` | `/cleanup` | Body: `{ "playlist_id", "track_ids", "mode" }`; removes tracks via Spotify |
| `GET` | `/export/{scan_id}?format=csv\|json` | Serialized duplicate export |

**Rate limiting:** In-memory per-IP limit (`API_RATE_LIMIT_PER_MINUTE`). Responses include `X-Request-Id`.

## Duplicate detection

Implemented under `app/detection/` and `app/utils/normalization.py`:

- **Exact** — normalized title + primary artist
- **ISRC** — when both tracks share an ISRC
- **Smart** — `rapidfuzz` on version-stripped titles (remasters, live, etc.)

## Tests

```bash
cd backend
source .venv/bin/activate
pytest
```

Detection logic is covered in `tests/test_detection_engine.py`.

## Production notes

- Point `FRONTEND_ORIGIN` at your deployed frontend URL only.
- Prefer **Alembic** migrations instead of `create_all` for schema changes.
- Run behind a reverse proxy with TLS; tune rate limits and add structured logging as needed.

## Trademark

**Spotless™** is a trademark of Shankho. See the [root README](../README.md) for the full notice.
