import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import TVLogo from "@/assets/LOGO.png";
import Footer from "../components/landing/Footer";

/**
 * Public documentation shell — used by routes that live OUTSIDE the portal
 * (currently /info). Deliberately thin: sticky header, one document-scrolled
 * main, and the landing footer. No sidebar, no portal chrome.
 *
 * The page component keeps its own max-width and padding, so the same
 * component also renders unchanged inside AppLayout at /portal/info.
 *
 * Document scroll (instead of AppLayout's nested overflow-y main) is the
 * reason this shell exists: long methodology pages want the address bar to
 * collapse on phones, anchor jumps that respect the sticky header, and
 * print/PDF export without a scroll container.
 */
interface DocShellProps {
  children: ReactNode;
  /** Shown as the browser tab title; the previous title is restored on unmount. */
  title?: string;
}

export default function DocShell({ children, title }: DocShellProps) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#fcfcfc] text-slate-800 font-[Geist,ui-sans-serif,system-ui,sans-serif]">
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-[#fcfcfc]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 md:px-8">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005D90]"
          >
            <img src={TVLogo} alt="" className="h-8 w-8 shrink-0 object-contain" />
            <span className="text-base font-bold tracking-tight text-slate-900">TrashVision</span>
            <span aria-hidden="true" className="hidden text-slate-300 sm:inline">
              /
            </span>
            <span className="hidden text-sm font-medium text-slate-500 sm:inline">Methodology</span>
          </Link>

          <Link
            to="/portal"
            className="inline-flex shrink-0 items-center rounded-lg bg-[#005D90] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004a73] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005D90]"
          >
            Open Portal
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <Footer />
    </div>
  );
}
