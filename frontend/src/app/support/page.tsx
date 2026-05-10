import Image from "next/image";
import { AppPageNav } from "@/components/app-page-nav";

export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Buy Me a Coffee</h1>
        <AppPageNav />
      </div>
      <p className="max-w-2xl text-zinc-600 dark:text-zinc-300">
        If Spotless™ saves you time, you can support ongoing development through UPI. This page uses a placeholder QR
        implementation so you can later replace it with your production QR image.
      </p>

      <section className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">UPI Support</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Scan the QR code using any UPI app (GPay, PhonePe, Paytm, BHIM).
          </p>
          <ul className="space-y-1 text-sm">
            <li>
              <span className="font-semibold">Payee:</span> Shankho
            </li>
            <li>
              <span className="font-semibold">Email:</span> basu.net@gmail.com
            </li>
            <li>
              <span className="font-semibold">Note:</span> Replace placeholder with your live UPI QR before launch.
            </li>
          </ul>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
          <Image
            src="/upi-qr-placeholder.svg"
            alt="Placeholder UPI QR code"
            width={260}
            height={260}
            priority
            className="rounded-md"
          />
          <p className="mt-3 text-xs text-zinc-500">Placeholder UPI QR (replace `public/upi-qr-placeholder.svg`)</p>
        </div>
      </section>
    </main>
  );
}
