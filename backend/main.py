import logging
from collections import defaultdict
from time import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core.config import get_settings
from app.core.database import Base, engine
from app.models import entities  # noqa: F401

logger = logging.getLogger(__name__)

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
app.include_router(router)

_rate_buckets: dict[str, list[float]] = defaultdict(list)

_RATE_LIMIT_SKIP_PATHS = frozenset({"/health", "/docs", "/openapi.json", "/redoc"})


def _rate_limit_client_key(request: Request) -> str:
    raw = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if raw:
        return raw
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or path in _RATE_LIMIT_SKIP_PATHS:
        return await call_next(request)

    key = _rate_limit_client_key(request)
    window_start = time() - 60
    recent = [ts for ts in _rate_buckets[key] if ts > window_start]
    if len(recent) > settings.api_rate_limit_per_minute:
        logger.warning(
            "API rate limit exceeded key=%s count=%s limit=%s path=%s",
            key,
            len(recent),
            settings.api_rate_limit_per_minute,
            path,
        )
        return JSONResponse(
            status_code=429,
            content={
                "detail": "This API’s per-client rate limit was exceeded (not Spotify). "
                "Raise API_RATE_LIMIT_PER_MINUTE or wait a minute.",
                "error_code": "spotless_api_rate_limit",
            },
        )
    recent.append(time())
    _rate_buckets[key] = recent
    response = await call_next(request)
    response.headers["X-Request-Id"] = f"req-{int(time() * 1000)}"
    return response
