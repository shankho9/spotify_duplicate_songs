# Spotify Duplicate Cleaner

Modern full-stack web application that connects to Spotify, scans playlists for duplicate songs, presents analytics, and removes duplicates directly from playlists.

## Stack

- Frontend: Next.js (App Router), NextAuth, Tailwind, TanStack Query, Zustand
- Backend: FastAPI, SQLAlchemy, httpx, rapidfuzz, pandas
- Database: PostgreSQL

## Project Structure

- `frontend/` Next.js application
- `backend/` FastAPI API server and detection engine
- `docker-compose.yml` local orchestration for frontend/backend/postgres

## MVP Features Implemented

- Spotify OAuth login with required playlist scopes
- Protected playlists/analysis/cleanup pages
- Playlist browser and scan trigger
- Duplicate detection engine with exact, ISRC, and smart fuzzy matching
- Async scan processing via FastAPI background tasks
- Duplicate review view and cleanup action endpoint
- CSV/JSON export endpoint and frontend export actions
- Backend request rate-limiting middleware and request id headers

## Local Setup

1. Copy `.env.example` to `.env` and fill Spotify credentials.
2. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`
3. Backend:
   - `cd backend`
   - `python -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `uvicorn main:app --reload --port 8000`

Or run everything with Docker:

- `docker compose up`

**Spotify sign-in (NextAuth):** Set `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and Spotify client env vars for the frontend (e.g. `frontend/.env.local` loaded by Next, or pass them into the `frontend` service). The URL in your browser, `NEXTAUTH_URL`, and the Spotify Developer “Redirect URI” must use the **same host** (`http://localhost:3000` and `http://127.0.0.1:3000` are different sites; OAuth state cookies will not carry across). If you see `State cookie was missing`, you are almost always on the wrong host or a mismatched redirect URI.

**Hydration warnings on `<html>`:** Some browser extensions inject attributes (for example `toscacontainsshadowdom`) before React hydrates. The root layout uses `suppressHydrationWarning` on `<html>` to avoid noisy mismatches from that; you can still disable the extension to verify a clean console.

## Core API Endpoints

- `POST /auth/sync`
- `GET /playlists` (Bearer; calls Spotify `/me/playlists` with pagination)
- `POST /scan`
- `GET /scan/{scan_id}/status`
- `GET /duplicates/{scan_id}`
- `POST /cleanup`
- `GET /export/{scan_id}?format=csv|json`

## Testing

- Backend detection tests:
  - `cd backend`
  - `pytest`

## Trademark Notice

Spotless™ is a trademark of Shankho.

Owner contact: `basu.net@gmail.com`.

Use of the Spotless™ name and related branding without prior written permission is prohibited.
