import type { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  // Change ReactNode to LucideIcon
  icon: LucideIcon; 
  title: string;
  description: string;
}


export default function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="relative text-left group overflow-hidden bg-white p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,93,144,0.3)]">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors" />
      <div className="p-2 bg-[#005D90]/10 w-fit rounded-xl">
      <Icon className="w-6 h-6 text-blue-600" />
      </div>
      <h3 className="text-xl font-bold mb-3 text-slate-900">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>

      <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#005D90] transition-all duration-300 group-hover:w-full" />
    </div>
  );
}

