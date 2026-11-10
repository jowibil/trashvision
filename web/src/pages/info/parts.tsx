import type { ReactNode } from "react";

/**
 * Shared section heading for the Info page. The opacity/animation resets guard
 * against global heading styles (fade-in or low-contrast rules) that used to
 * leave these headings nearly invisible.
 */
export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h4
      id={id}
      className="flex items-center gap-3 text-xl font-bold text-slate-900 tracking-tight text-left opacity-100! animate-none!"
    >
      <span aria-hidden="true" className="h-6 w-1 shrink-0 rounded-full bg-[#005D90]" />
      <span>{children}</span>
    </h4>
  );
}
