from app.detection.engine import detect_duplicates


def test_detection_engine_exact_and_isrc_and_smart():
    tracks = [
        {"id": "a1", "name": "Song Name", "artists": ["Artist"], "isrc": "US123"},
        {"id": "a2", "name": "song name", "artists": ["Artist"], "isrc": "US123"},
        {"id": "a3", "name": "Song Name - Remastered 2011", "artists": ["Artist"], "isrc": None},
    ]
    duplicates = detect_duplicates(tracks, smart_threshold=80)
    types = {item["duplicate_type"] for item in duplicates}
    assert "exact" in types
    assert "isrc" in types
    assert "smart" in types
    for item in duplicates:
        meta = item.get("metadata") or {}
        assert "track_1" in meta and "track_2" in meta
        assert meta["track_1"]["id"] in ("a1", "a2", "a3")
        assert meta["track_2"]["id"] in ("a1", "a2", "a3")
