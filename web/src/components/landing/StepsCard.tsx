import { type LucideIcon } from "lucide-react";

interface StepCardProps {
  step: number;
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function StepCard({ step, icon: Icon, title, description }: StepCardProps) {
  return (
    <div className="flex flex-col items-center text-center relative">
      {/* Connector line to the next step. Removed: the section renders the
          same dashed line once across the whole row; a per-card copy drew a
          doubled line at md+ (both ran at the same top offset). */}

      <div className="relative z-10">
        <div className="w-20 h-20 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-3 text-blue-600">
          <Icon className="w-8 h-8" />
        </div>
        <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
          {step}
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed max-w-[160px]">{description}</p>
    </div>
  );
}