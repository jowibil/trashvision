interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  className?: string;
}

export default function Button({
  children,
  variant = "primary",
  onClick,
  className = "",
}: ButtonProps) {
  const base = "px-5 py-2 rounded-lg text-sm font-medium transition";

  const styles =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "border border-white text-white hover:bg-white hover:text-blue-600";

  return (
    <button onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}