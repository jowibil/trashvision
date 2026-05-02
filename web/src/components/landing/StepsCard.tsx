import { type LucideIcon } from "lucide-react";

interface StepCardProps {
  step: number;
  // Change ReactNode to LucideIcon to accept the component itself
  icon: LucideIcon; 
  title: string;
  description: string;
  isLast?: boolean;
}

// 1. Add 'icon' to the destructuring list
// 2. Rename it to 'Icon' (capitalized) so React knows to render it as a component
export default function StepCard({ 
  step, 
  icon: Icon, 
  title, 
  description, 
  isLast = false 
}: StepCardProps) {
  return (
    <div className="flex flex-col items-center text-center relative">
      {/* Connector line */}
      {!isLast && (
        <div 
          className="hidden md:block absolute top-10 left-1/2 w-full h-px border-t-2 border-dashed border-blue-200 z-0" 
          style={{ left: "60%", width: "80%" }} 
        />
      )}
      
      <div className="relative z-10">
        <div className="w-20 h-20 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-3 text-blue-600">
          {/* 3. Render it as a component with a size class */}
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