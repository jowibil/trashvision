import type { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  size?: "md" | "lg";
}

export default function FeatureCard({ icon: Icon, title, description, size = "md" }: FeatureCardProps) {
  const isLarge = size === "lg";

  return (
    <div
      className={`relative h-full text-left group overflow-hidden bg-[#fcfcfc] rounded-3xl border border-zinc-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10 ${
        isLarge ? "p-10" : "p-8"
      }`}
    >
      <div className="absolute -top-24 -right-24 z-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors" />

      <div className="relative z-10">
        <div className="p-2.5 bg-[#005D90]/10 w-fit rounded-xl">
          <Icon className={isLarge ? "w-7 h-7 text-blue-600" : "w-6 h-6 text-blue-600"} />
        </div>
        <h3 className={`font-bold mt-4 mb-3 text-slate-900 ${isLarge ? "text-2xl" : "text-xl"}`}>{title}</h3>
        <p className={`text-slate-600 leading-relaxed ${isLarge ? "text-base max-w-md" : ""}`}>{description}</p>
      </div>

      <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#005D90] transition-all duration-300 group-hover:w-full z-10" />
    </div>
  );
}