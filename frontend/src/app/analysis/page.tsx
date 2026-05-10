"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** @deprecated Use Playlists for scan and duplicate results. */
export default function AnalysisRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/playlists");
  }, [router]);
  return (
    <main className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-zinc-500">
      Redirecting to Playlists…
    </main>
  );
}
