from collections import Counter

from app.personality.engine import build_metrics_from_signals, infer_personality


def test_infer_personality_focus_lean():
    metrics = {
        "avg_valence": 0.45,
        "avg_energy": 0.35,
        "avg_danceability": 0.25,
        "avg_acousticness": 0.4,
        "avg_instrumentalness": 0.72,
        "avg_speechiness": 0.04,
        "avg_tempo": 110.0,
        "valence_pstdev": 0.05,
        "explicit_ratio": 0.02,
        "avg_release_year": 2018.0,
        "genre_entropy": 2.0,
        "nostalgia_genre_ratio": 0.1,
        "recent_listening_minutes": 40.0,
        "unique_recent_tracks": 20,
    }
    out = infer_personality(metrics)
    assert out["primary_slug"] == "focus_listener"


def test_build_metrics_from_signals():
    genre_counts = Counter({"indie": 3, "rock": 2})
    audio = [
        {"valence": 0.2, "energy": 0.8, "danceability": 0.5, "acousticness": 0.1, "instrumentalness": 0.0, "speechiness": 0.05, "tempo": 120.0},
        {"valence": 0.9, "energy": 0.2, "danceability": 0.3, "acousticness": 0.6, "instrumentalness": 0.1, "speechiness": 0.04, "tempo": 90.0},
    ]
    tracks_meta = [
        {"explicit": False, "release_date": "1999-01-01"},
        {"explicit": True, "release_date": "2020-06-15"},
    ]
    recent = [
        {"track": {"id": "a", "duration_ms": 180000}},
        {"track": {"id": "b", "duration_ms": 240000}},
    ]
    m = build_metrics_from_signals(
        genre_counts=genre_counts,
        audio_features=audio,
        tracks_meta=tracks_meta,
        recent_items=recent,
    )
    assert m["unique_recent_tracks"] == 2
    assert m["recent_listening_minutes"] == 7.0
    assert m["explicit_ratio"] == 0.5
