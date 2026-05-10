/** Square 1080×1080 share card as SVG (download / open in design tools). */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

export type PersonalityCardInput = {
  displayName: string;
  primaryTitle: string;
  primaryBlurb: string;
  secondaryTitle: string | null;
  moodLabel: string;
  topGenres: { name: string; weight: number }[];
  recentMinutes: number;
  tracksAnalyzed: number;
};

export function buildPersonalityCardSvg(c: PersonalityCardInput): string {
  const genres = c.topGenres
    .slice(0, 4)
    .map((g) => `${g.name} (${Math.round(g.weight * 100)}%)`)
    .join(" · ");
  const sub = c.secondaryTitle ? `Also: ${c.secondaryTitle}` : "";
  const blurbLines = wrapLines(c.primaryBlurb, 52, 4);
  const blurbSvg = blurbLines
    .map((line, i) => {
      const y = 360 + i * 44;
      return `<text x="120" y="${y}" fill="#cbd5e1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26">${esc(line)}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#047857"/>
      <stop offset="55%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#18181b"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <text x="540" y="100" text-anchor="middle" fill="#a7f3d0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="28" font-weight="600">Spotless · Music Personality</text>
  <text x="540" y="200" text-anchor="middle" fill="#ecfdf5" font-family="ui-sans-serif,system-ui,sans-serif" font-size="56" font-weight="800">${esc(c.primaryTitle)}</text>
  <text x="540" y="280" text-anchor="middle" fill="#d1fae5" font-family="ui-sans-serif,system-ui,sans-serif" font-size="32" font-weight="600">${esc(c.displayName)}</text>
  ${blurbSvg}
  <text x="120" y="560" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26" font-weight="600">Mood (audio proxy)</text>
  <text x="120" y="610" fill="#e2e8f0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="30">${esc(c.moodLabel)}</text>
  <text x="120" y="690" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26" font-weight="600">Genre lean</text>
  <text x="120" y="740" fill="#e2e8f0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26">${esc(genres || "—")}</text>
  <text x="120" y="830" fill="#64748b" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24">${esc(`~${Math.round(c.recentMinutes)} min recent · ${c.tracksAnalyzed} tracks analyzed`)}</text>
  <text x="120" y="880" fill="#64748b" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24">${esc(sub)}</text>
  <text x="540" y="1020" text-anchor="middle" fill="#475569" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22">#Spotify #MusicPersonality</text>
</svg>`;
}

export function downloadSvg(filename: string, svg: string) {
  const payload = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  const blob = new Blob([payload], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
