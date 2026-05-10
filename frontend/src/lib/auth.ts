import type { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";
import type { JWT } from "next-auth/jwt";

const scopes = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-read-private",
  "user-top-read",
  "user-read-recently-played",
].join(" ");

async function refreshAccessToken(token: JWT) {
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: typeof token.refreshToken === "string" ? token.refreshToken : "",
      }),
    });
    const refreshed = await response.json();
    if (!response.ok) {
      throw refreshed;
    }
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
      authorization:
        "https://accounts.spotify.com/authorize?" +
        new URLSearchParams({
          scope: scopes,
          show_dialog: "true",
        }),
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_at ?? 3600) * 1000,
          spotifyUserId: (profile as { id?: string } | undefined)?.id,
        };
      }
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.error = token.error as string | undefined;
      session.accessToken = token.accessToken as string;
      session.spotifyUserId = token.spotifyUserId as string;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
