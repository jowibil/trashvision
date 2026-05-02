interface StatCardProps {
  value: string;
  label: string;
}

export default function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="text-center px-6 py-2">
      <div className="text-2xl font-bold text-[#005D90]">{value}</div>
      <div className="text-xs font-semibold tracking-widest uppercase mt-1 text-[#BFC7D1]">{label}</div>
    </div>
  );
}