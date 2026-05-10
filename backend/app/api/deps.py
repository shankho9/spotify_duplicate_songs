from fastapi import Header, HTTPException, status


def get_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return authorization.split(" ", 1)[1]


def get_user_header(x_spotify_user_id: str | None = Header(default=None)) -> str:
    if not x_spotify_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user identifier")
    return x_spotify_user_id
