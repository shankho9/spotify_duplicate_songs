export type Playlist = {
  id: string;
  name: string;
  owner?: string | null;
  owner_id?: string | null;
  is_public?: boolean | null;
  artwork_url?: string | null;
};

export type DuplicateTrackSnapshot = {
  id?: string | null;
  playlist_id?: string | null;
  playlist_name?: string | null;
  name?: string | null;
  artists?: string[];
};

export type DuplicateMetadata = {
  track_1?: DuplicateTrackSnapshot;
  track_2?: DuplicateTrackSnapshot;
};

export type Duplicate = {
  id: number;
  track_1: string;
  track_2: string;
  similarity_score: number;
  duplicate_type: "exact" | "isrc" | "smart";
  metadata?: DuplicateMetadata | Record<string, unknown>;
};

export type PersonalityInsights = {
  user: { display_name: string; id: string };
  personality: {
    primary_slug: string;
    primary_title: string;
    primary_score: number;
    primary_blurb: string;
    secondary_slug: string | null;
    secondary_title: string | null;
    archetype_scores: Record<string, number>;
  };
  metrics: Record<string, number>;
  genre_spread: { name: string; weight: number }[];
  audio_features_summary: Record<string, number>;
  lyric_sentiment: { method: string; label: string; disclaimer: string };
  listening_time: {
    recent_window_tracks: number;
    estimated_recent_minutes: number;
    tracks_analyzed: number;
  };
  share_lines: string[];
  scope_notes?: string[];
};
