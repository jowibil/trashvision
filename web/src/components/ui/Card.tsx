import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  padding?: CardPadding;
  className?: string;
}

/** Hoisted so the map isn't rebuilt on every render. */
const PADDING_STYLES: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-8",
};

// Off-white surface + ultra-light border tint + deep diffusion shadow
// instead of a flat `shadow` utility and pure-white background.
const BASE_STYLES =
  "bg-[#fcfcfc] rounded-2xl border border-zinc-900/5 " +
  "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.08)]";

/**
 * Card
 * Core surface primitive shared across the app.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, padding = "md", className = "", ...rest },
  ref,
) {
  return (
    <div ref={ref} className={`${BASE_STYLES} ${PADDING_STYLES[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
});

export default Card;