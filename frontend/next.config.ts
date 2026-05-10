import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev access from either loopback host; OAuth cookies are host-specific so keep NEXTAUTH_URL
  // and Spotify redirect URIs aligned with whichever host you actually open in the browser.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
