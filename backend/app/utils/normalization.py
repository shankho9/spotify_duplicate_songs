import re
import unicodedata

VERSION_TOKENS = {
    "remaster",
    "remastered",
    "live",
    "acoustic",
    "radio edit",
    "deluxe",
    "explicit",
    "clean",
}


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = value.lower().strip()
    value = re.sub(r"[^\w\s]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def strip_version_tokens(value: str) -> str:
    normalized = normalize_text(value)
    for token in VERSION_TOKENS:
        normalized = normalized.replace(token, "")
    return re.sub(r"\s+", " ", normalized).strip()
