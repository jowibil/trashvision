interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-white rounded-xl shadow p-5 ${className}`}>
      {children}
    </div>
  );
}