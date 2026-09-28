import Navbar from "../components/shared/navbar";
import StepCard from "../components/landing/StepsCard";
import Footer from "../components/landing/Footer";
import MapPlaceholder from "../components/landing/Map";
import heroBg from "@/assets/herobg.png";
import { features, steps } from "../components/landing/LandingIcons";
import FeatureCard from "../components/landing/FeatureCard";
import { useNavigate } from "react-router-dom";

// Hoisted: pairs each feature index with its bento span/size for the
// asymmetric layout below. Doesn't depend on props/state.
const FEATURE_LAYOUT: { span: string; size: "md" | "lg" }[] = [
  { span: "md:col-span-7", size: "lg" },
  { span: "md:col-span-5", size: "md" },
  { span: "md:col-span-5", size: "md" },
  { span: "md:col-span-7", size: "lg" },
  { span: "md:col-span-7", size: "lg" },
  { span: "md:col-span-5", size: "md" },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="font-sans antialiased bg-[#fcfcfc]">
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative min-h-[95vh] flex items-center pt-8 overflow-hidden" id="hero">
        <div className="absolute inset-0 w-full h-full overflow-hidden" style={{ zIndex: 0 }}>
          <img src={heroBg} alt="Ocean Background" className="w-full h-full object-cover object-bottom scale-110" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
        </div>
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center text-left">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-xs text-white font-medium mt-6 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Environmental Monitoring
              </div>
              {/* Was text-5xl md:text-4xl lg:text-6xl — the heading actually
                  shrank at the md breakpoint before growing again at lg.
                  Now scales up progressively. */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-4">
                Protecting <br /> Coastlines with <br />
                <span className="text-cyan-300">Real-Time Waste</span> Detection
              </h1>
              <p className="text-white/70 text-base sm:text-lg mb-8 max-w-md leading-relaxed">
                TrashVision empowers local government units to detect, map, and respond to shoreline waste —
                automatically and intelligently.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <button
                  type="button"
                  className="bg-white text-blue-800 font-semibold text-sm px-6 py-3 rounded-xl hover:bg-blue-500 hover:text-white transition-colors shadow-lg"
                  onClick={() => navigate("/portal")}
                >
                  Open Forecast
                </button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <MapPlaceholder />
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 leading-[0]">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-16 md:h-24">
            <path d="M0 80L1440 80L1440 30Q1080 80 720 30Q360 -20 0 30Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-15 md:py-32" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-left mb-12">
          <h3 className="text-sm font-bold uppercase text-[#006]">Core Features</h3>
          <p className="text-[#0B1C30] text-6xl font-bold">
            Everything Your LGU Needs
            <br /> to Monitor Coastal Waste
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Asymmetric 12-col bento instead of a flat 3-equal-column grid;
              each card carries its own border/radius rather than relying on
              a shared "gap-px divider line" background trick. */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {features.map((feature, index) => {
              const layout = FEATURE_LAYOUT[index] ?? { span: "md:col-span-6", size: "md" as const };
              return (
                <div key={feature.title} className={layout.span}>
    <FeatureCard {...feature} size={layout.size} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section className="py-20 bg-[#EFF4FF]" id="hiw">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-16">
            From Drone to Decision in 3 Simple Steps
          </h3>
          {/* Kept as 3 equal columns intentionally: this is a numbered,
              order-dependent process connected by a single line, not a set
              of interchangeable feature cards — the banned pattern this
              skill targets is the latter. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 relative">
            <div className="hidden sm:block absolute top-10 left-[20%] right-[20%] h-px border-t-2 border-dashed border-blue-200 z-0" />
            {steps.map((s, i) => (
              <StepCard key={s.title} step={i + 1} {...s} isLast={i === steps.length - 1} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section
        id="about"
        className="py-24 text-center text-white"
        style={{ background: "linear-gradient(135deg, #1a56db 0%, #0d9488 100%)" }}
      >
        <div className="max-w-2xl mx-auto px-4">
          <h3 className="sm:text-2xl md:text-5xl font-extrabold mb-4">Ready to Clean Up Your Coastlines?</h3>
          <p className="text-white/80 mb-8 text-base">
            Join forward-thinking LGUs from Panabo City across the globe in restoring environmental integrity with
            intelligence.
          </p>
          <button
            type="button"
            className="bg-white text-blue-700 font-bold text-sm px-8 py-3.5 mt-8 rounded-xl hover:bg-blue-50 transition-colors shadow-lg"
            onClick={() => navigate("/portal")}
          >
            Open Forecast
          </button>
        </div>
      </section>
      <Footer />
    </div>
  );
}