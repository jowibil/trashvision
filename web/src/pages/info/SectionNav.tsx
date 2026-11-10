// Pinned section nav for the Info page.
//
// Design: one slim bar, chips styled as a segmented control — the section you
// are actually reading is filled, everything else is quiet text. The chips
// scroller and the "back to top" control are flex siblings, so the control
// keeps its full size and can never squeeze or truncate the chip row.
//
// Scroll-spy notes: /info scrolls the document (DocShell) while /portal/info
// scrolls a nested <main>. Scroll events do not bubble, but they DO capture, so
// one listener on window with capture: true covers both shells. The threshold is
// the bar's own bottom edge, read from getBoundingClientRect, so no CSS offset
// string has to be parsed back into pixels.
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

interface SectionNavProps {
  /** [hash, label] pairs in page order. */
  sections: [string, string][];
  /** CSS top offset for the pinned bar (the shell's sticky chrome height). */
  stickyTop: string;
}

/** The element that actually scrolls this page: <main> in the portal, the
 *  document under DocShell. Found by walking up, because the two shells differ
 *  and neither one is guaranteed to be the window. */
function findScroller(from: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export default function SectionNav({ sections, stickyTop }: SectionNavProps) {
  const [active, setActive] = useState(sections[0]?.[0] ?? "");
  const barRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLUListElement | null>(null);
  const pillsRef = useRef<Record<string, HTMLAnchorElement | null>>({});
  const pageScrollerRef = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // A chip click is a statement of intent, and the spy honours it.
  //
  // Limits and Team are both short, so at the end of the page there is not
  // enough content below them to separate their scroll positions: clicking
  // Limits scrolls to the bottom, which is also where clicking Team lands. The
  // bare geometry described here (last section wins at the page end) therefore
  // highlighted Team for both. Remembering the clicked chip — until the reader
  // scrolls somewhere else — is the only signal that can tell them apart.
  const intentRef = useRef<{ href: string; landedAt: number | null } | null>(null);
  const settleRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const bar = barRef.current;
      if (!bar) return;

      // Where the pinned bar's bottom edge sits when stuck: its own `top`
      // offset (0 in the portal, 4rem under DocShell) plus its height. Using
      // the live rect instead would report a larger offset while the page is
      // still at the top, and anchors would then jump too far.
      const stuckTop = Number.parseFloat(getComputedStyle(bar).top) || 0;
      const offset = stuckTop + bar.offsetHeight + 12;
      // Sections use this as scroll-margin-top, so an anchor jump lands exactly
      // where the spy considers the section current — one source for both.
      document.documentElement.style.setProperty("--info-anchor", `${Math.round(offset)}px`);

      const scroller =
        pageScrollerRef.current ?? (pageScrollerRef.current = findScroller(bar));

      let current = sections[0]?.[0] ?? "";
      for (const [href] of sections) {
        const target = document.getElementById(href.slice(1));
        if (!target) continue;
        // The 4px slack absorbs sub-pixel layout: an anchor jump lands the
        // target at e.g. 118.23 while the threshold is 118, and without it
        // every chip click would highlight the section above the one clicked.
        if (target.getBoundingClientRect().top <= offset + 4) current = href;
      }

      // The last section can never reach the threshold if there isn't a full
      // viewport of content below it, so once the page is at its end the last
      // section is what the reader is looking at.
      const atEnd =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      if (atEnd) current = sections[sections.length - 1]?.[0] ?? current;

      // A clicked chip outranks both rules until the reader scrolls away from
      // where that click settled (smooth scrolling still fires scroll events,
      // so "has the view moved" is the honest test, not "has time passed").
      const intent = intentRef.current;
      if (intent) {
        if (intent.landedAt != null && Math.abs(scroller.scrollTop - intent.landedAt) > 36) {
          intentRef.current = null;
        } else {
          current = intent.href;
        }
      }

      setActive((prev) => (prev === current ? prev : current));

      // Which sides of the chip strip are hiding content. Fades are drawn only
      // on those sides, so a chip is never dimmed when it is fully reachable.
      const strip = scrollerRef.current;
      if (strip) {
        // Ignore a few pixels of slack: fading in a sliver of the neighbouring
        // chip's padding would signal hidden labels that do not exist.
        const canLeft = strip.scrollLeft > 16;
        const canRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 16;
        setEdges((prev) =>
          prev.left === canLeft && prev.right === canRight
            ? prev
            : { left: canLeft, right: canRight },
        );
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    const onResize = () => {
      // The scroll container and the bar height can both change with layout.
      pageScrollerRef.current = null;
      onScroll();
    };

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    measure();

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  /** Highlight immediately, then record where the anchor jump actually stops,
   *  so the spy can tell a deliberate click from ordinary scrolling. */
  const onChipClick = (href: string) => {
    const bar = barRef.current;
    if (!bar) return;
    intentRef.current = { href, landedAt: null };
    setActive(href);

    const scroller =
      pageScrollerRef.current ?? (pageScrollerRef.current = findScroller(bar));
    const target = document.getElementById(href.slice(1));
    const offset =
      (Number.parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight + 12;
    const max = scroller.scrollHeight - scroller.clientHeight;
    // Where the jump should stop: sections carry scroll-margin-top equal to
    // `offset`, and the page ends before the last two can reach the line — in
    // which case the browser clamps at the bottom, and so do we.
    const destination = target
      ? Math.min(
          Math.max(scroller.scrollTop + target.getBoundingClientRect().top - offset, 0),
          max,
        )
      : null;

    if (settleRef.current) window.clearTimeout(settleRef.current);
    let laps = 0;
    // Latch only once the scroll has stopped: latching on a timer would record
    // an intermediate position, and the rest of the animation would then look
    // like the reader scrolling away — handing the highlight back to geometry
    // and resurrecting the bug this exists to fix.
    const poll = (lastTop: number) => {
      settleRef.current = window.setTimeout(() => {
        const intent = intentRef.current;
        if (!intent || intent.href !== href) return;
        const top = scroller.scrollTop;
        if (Math.abs(top - lastTop) > 0.5) {
          poll(top);
          return;
        }
        const arrived = destination == null || Math.abs(top - destination) <= 48;
        // One more lap of grace: a dropped frame can look like a stop.
        if (!arrived && laps++ < 4) {
          poll(top);
          return;
        }
        if (arrived) intent.landedAt = top;
        else intentRef.current = null;
      }, 120);
    };
    poll(scroller.scrollTop);
  };

  useEffect(() => () => {
    if (settleRef.current) window.clearTimeout(settleRef.current);
  }, []);

  // Keep the current chip visible without touching the page scroll: centre it
  // inside the horizontal scroller only.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const pill = pillsRef.current[active];
    if (!scroller || !pill) return;

    const pillRect = pill.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const centred =
      scroller.scrollLeft +
      (pillRect.left - scrollerRect.left) -
      (scroller.clientWidth - pillRect.width) / 2;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const target = Math.min(Math.max(centred, 0), max);
    if (Math.abs(target - scroller.scrollLeft) < 4) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav
      ref={barRef}
      aria-label="On this page"
      style={{ top: stickyTop }}
      className="sticky z-30 -mx-4 border-b border-slate-200 bg-white/85 px-4 py-2 backdrop-blur md:-mx-8 md:px-8"
    >
      <div className="flex items-center gap-2">
        {/* No "On this page" label: it costs ~130px, which is the difference
            between all eleven chips fitting on a laptop and the last two hiding
            behind the edge. The nav's aria-label names the region instead. */}
        {/* The strip owns its own width and fades; the control beside it keeps
            its full size, so neither can squeeze the other. */}
        <div className="relative min-w-0 flex-1">
          {edges.left && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent"
            />
          )}
          {edges.right && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent"
            />
          )}

          <ul
            ref={scrollerRef}
            className="flex items-center gap-0.5 overflow-x-auto list-none p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {sections.map(([href, label]) => {
              const isActive = href === active;
              return (
                <li key={href} className="shrink-0">
                  <a
                    ref={(el) => {
                      pillsRef.current[href] = el;
                    }}
                    href={href}
                    onClick={() => onChipClick(href)}
                    aria-current={isActive ? "location" : undefined}
                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors sm:text-xs ${
                      isActive
                        ? "bg-[#005D90] text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        <a
          href="#top"
          title="Back to top"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm transition-colors hover:border-[#005D90] hover:text-[#005D90] sm:text-xs"
        >
          <ArrowUp size={12} aria-hidden="true" />
          <span className="hidden sm:inline">Top</span>
          <span className="sr-only sm:hidden">Back to top</span>
        </a>
      </div>
    </nav>
  );
}
