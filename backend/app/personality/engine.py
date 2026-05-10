"""Rule-based listening personality from aggregate Spotify signals (not clinical)."""

from __future__ import annotations

import math
from collections import Counter
from typing import Any


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _pstdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    var = sum((v - m) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(var)


def _genre_entropy(genre_counts: Counter[str]) -> float:
    total = sum(genre_counts.values())
    if total <= 0:
        return 0.0
    ent = 0.0
    for c in genre_counts.values():
        p = c / total
        ent -= p * math.log(p + 1e-12, 2)
    return ent


def _nostalgia_genre_hits(genre_counts: Counter[str]) -> float:
    keys = ("classic", "oldies", "70s", "80s", "90s", "soul", "jazz", "swing", "folk", "country")
    hits = 0
    total = 0
    for g, w in genre_counts.items():
        gl = g.lower()
        total += w
        if any(k in gl for k in keys):
            hits += w
    if total <= 0:
        return 0.0
    return _clamp(hits / total)


def infer_personality(metrics: dict[str, Any]) -> dict[str, Any]:
    """
    metrics keys:
      avg_valence, avg_energy, avg_danceability, avg_acousticness,
      avg_instrumentalness, avg_speechiness, avg_tempo,
      valence_pstdev, explicit_ratio, avg_release_year,
      genre_entropy, nostalgia_genre_ratio,
      recent_listening_minutes, unique_recent_tracks
    """
    v = float(metrics.get("avg_valence") or 0)
    e = float(metrics.get("avg_energy") or 0)
    d = float(metrics.get("avg_danceability") or 0)
    a = float(metrics.get("avg_acousticness") or 0)
    inst = float(metrics.get("avg_instrumentalness") or 0)
    speech = float(metrics.get("avg_speechiness") or 0)
    vs = float(metrics.get("valence_pstdev") or 0)
    explicit = float(metrics.get("explicit_ratio") or 0)
    year = float(metrics.get("avg_release_year") or 2015)
    g_ent = float(metrics.get("genre_entropy") or 0)
    nost_g = float(metrics.get("nostalgia_genre_ratio") or 0)
    recent_min = float(metrics.get("recent_listening_minutes") or 0)
    recent_n = int(metrics.get("unique_recent_tracks") or 0)

    # Archetype scores 0..1
    focus = _clamp((inst - 0.12) / 0.55) * _clamp((0.11 - speech) / 0.11) * (1.0 - 0.35 * d)

    emotional = _clamp(vs / 0.22) * 0.55 + _clamp(abs(v - 0.5) * 2.2) * 0.35 + _clamp(explicit * 1.2) * 0.1

    year_nostalgia = _clamp((2022 - year) / 32)
    nostalgia = _clamp(0.38 * year_nostalgia + 0.32 * a + 0.3 * nost_g)

    social = _clamp((d + e) / 2.0) * (1.0 - 0.25 * inst)

    explorer = _clamp(g_ent / 4.0) * _clamp(recent_n / 45.0)

    binge = _clamp(recent_min / 180.0) * (0.45 + 0.55 * emotional)

    scores: dict[str, float] = {
        "focus_listener": focus,
        "emotional_binge_listener": binge,
        "nostalgia_driven_listener": nostalgia,
        "social_energy_listener": social,
        "genre_explorer": explorer,
    }

    ordered = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    primary_slug, primary_score = ordered[0]
    secondary = None
    if len(ordered) > 1 and ordered[1][1] >= 0.28:
        secondary = ordered[1][0]

    labels = {
        "focus_listener": ("Focus listener", "Instrumental and low-vocal tracks anchor your sessions."),
        "emotional_binge_listener": (
            "Emotional binge listener",
            "Big swings in mood and intensity—you ride the wave end-to-end.",
        ),
        "nostalgia_driven_listener": (
            "Nostalgia-driven listener",
            "Older eras, softer textures, and familiar genres keep calling you back.",
        ),
        "social_energy_listener": (
            "Social energy listener",
            "Rhythm-forward picks built to move rooms and lift the moment.",
        ),
        "genre_explorer": (
            "Genre explorer",
            "Wide genre spread—you sample the map instead of staying in one lane.",
        ),
    }

    title, blurb = labels.get(primary_slug, ("Eclectic listener", "Your mix resists a single box—in a good way."))

    return {
        "primary_slug": primary_slug,
        "primary_title": title,
        "primary_score": round(primary_score, 3),
        "primary_blurb": blurb,
        "secondary_slug": secondary,
        "secondary_title": (labels[secondary][0] if secondary and secondary in labels else None),
        "archetype_scores": {k: round(v, 3) for k, v in scores.items()},
    }


def build_metrics_from_signals(
    *,
    genre_counts: Counter[str],
    audio_features: list[dict[str, Any]],
    tracks_meta: list[dict[str, Any]],
    recent_items: list[dict[str, Any]],
) -> dict[str, Any]:
    valences = [float(f["valence"]) for f in audio_features if f.get("valence") is not None]
    years: list[int] = []
    for t in tracks_meta:
        rd = t.get("release_date") or ""
        if len(rd) >= 4 and rd[:4].isdigit():
            years.append(int(rd[:4]))
    explicit = 0
    total_tm = 0
    for t in tracks_meta:
        total_tm += 1
        if t.get("explicit"):
            explicit += 1

    recent_ms = 0
    seen_recent: set[str] = set()
    for item in recent_items:
        tr = item.get("track") or {}
        tid = tr.get("id")
        if tid:
            seen_recent.add(tid)
        dur = int((tr.get("duration_ms") or 0))
        recent_ms += dur

    feats = audio_features or [{}]
    return {
        "avg_valence": _mean(valences),
        "avg_energy": _mean([float(f.get("energy") or 0) for f in feats]),
        "avg_danceability": _mean([float(f.get("danceability") or 0) for f in feats]),
        "avg_acousticness": _mean([float(f.get("acousticness") or 0) for f in feats]),
        "avg_instrumentalness": _mean([float(f.get("instrumentalness") or 0) for f in feats]),
        "avg_speechiness": _mean([float(f.get("speechiness") or 0) for f in feats]),
        "avg_tempo": _mean([float(f.get("tempo") or 0) for f in feats]),
        "valence_pstdev": _pstdev(valences),
        "explicit_ratio": explicit / max(1, total_tm),
        "avg_release_year": _mean([float(y) for y in years]) if years else 2015.0,
        "genre_entropy": _genre_entropy(genre_counts),
        "nostalgia_genre_ratio": _nostalgia_genre_hits(genre_counts),
        "recent_listening_minutes": recent_ms / 60000.0,
        "unique_recent_tracks": len(seen_recent),
    }
