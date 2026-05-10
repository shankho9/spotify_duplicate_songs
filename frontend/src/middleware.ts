import nextAuthMiddleware from "next-auth/middleware";

export default nextAuthMiddleware;

export const config = {
  matcher: [
    "/playlists",
    "/playlists/:path*",
    "/profiler",
    "/analysis",
    "/analysis/:path*",
    "/cleanup/:path*",
  ],
};
