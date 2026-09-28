import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * Static style maps are hoisted to module scope so they are computed once
 * (not re-allocated on every render) and can be reused/tree-shaken cleanly.
 * Palette intentionally left untouched (blue/teal "ocean" theme).
 */
const BASE_STYLES =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium " +
  "transition-colors duration-150 ease-out " +
  "disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500/60";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white border border-blue-600/0 hover:bg-blue-700 active:bg-blue-800",
  secondary:
    "border border-white/70 text-white hover:bg-white hover:text-blue-700 active:bg-white/90",
  ghost:
    "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2",
  lg: "px-6 py-3 text-base",
};

/**
 * Button
 * Core interactive primitive shared across the app. Kept dependency-free
 * (no cva/clsx) per the no-new-packages constraint for this iteration.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = "primary", size = "md", type = "button", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE_STYLES} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;