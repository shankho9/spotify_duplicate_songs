import { AppPageNav } from "@/components/app-page-nav";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-sm font-medium text-zinc-500">404</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          That page does not exist or the link is wrong. Use Back or Home.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AppPageNav />
      </div>
    </main>
  );
}
