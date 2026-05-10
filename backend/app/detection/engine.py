from rapidfuzz import fuzz

from app.utils.normalization import normalize_text, strip_version_tokens


def _track_snapshot(track: dict) -> dict:
    artists = track.get("artists") or []
    return {
        "id": track.get("id"),
        "playlist_id": track.get("playlist_id"),
        "playlist_name": track.get("playlist_name"),
        "name": track.get("name"),
        "artists": artists if isinstance(artists, list) else [],
    }


def _pair_metadata(t1: dict, t2: dict) -> dict:
    return {"track_1": _track_snapshot(t1), "track_2": _track_snapshot(t2)}


def detect_duplicates(tracks: list[dict], smart_threshold: int = 90) -> list[dict]:
    duplicates: list[dict] = []
    seen_exact: dict[tuple[str, str], dict] = {}
    seen_isrc: dict[str, dict] = {}

    for track in tracks:
        name = track.get("name", "")
        artist = (track.get("artists") or [""])[0]
        isrc = track.get("isrc")
        key = (normalize_text(name), normalize_text(artist))

        if isrc:
            if isrc in seen_isrc:
                prev = seen_isrc[isrc]
                duplicates.append(
                    {
                        "track_1": prev["id"],
                        "track_2": track["id"],
                        "duplicate_type": "isrc",
                        "similarity_score": 1.0,
                        "metadata": _pair_metadata(prev, track),
                    }
                )
            else:
                seen_isrc[isrc] = track

        if key in seen_exact:
            prev = seen_exact[key]
            duplicates.append(
                {
                    "track_1": prev["id"],
                    "track_2": track["id"],
                    "duplicate_type": "exact",
                    "similarity_score": 1.0,
                    "metadata": _pair_metadata(prev, track),
                }
            )
        else:
            seen_exact[key] = track

    for idx in range(len(tracks)):
        left = tracks[idx]
        left_name = strip_version_tokens(left.get("name", ""))
        left_artist = normalize_text((left.get("artists") or [""])[0])
        for jdx in range(idx + 1, len(tracks)):
            right = tracks[jdx]
            right_name = strip_version_tokens(right.get("name", ""))
            right_artist = normalize_text((right.get("artists") or [""])[0])
            if left_artist != right_artist:
                continue
            score = fuzz.token_set_ratio(left_name, right_name)
            if score >= smart_threshold:
                duplicates.append(
                    {
                        "track_1": left["id"],
                        "track_2": right["id"],
                        "duplicate_type": "smart",
                        "similarity_score": float(score) / 100.0,
                        "metadata": _pair_metadata(left, right),
                    }
                )

    unique = {(d["track_1"], d["track_2"], d["duplicate_type"]): d for d in duplicates}
    return list(unique.values())
