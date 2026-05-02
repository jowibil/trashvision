import Navbar from "../components/shared/navbar";
import StepCard from "../components/landing/StepsCard";
import Footer from "../components/landing/Footer";
import MapPlaceholder from "../components/landing/Map";
import heroBg from "@/assets/herobg.png";
import { stats, features, steps } from "../components/landing/LandingIcons";
import StatCard from "../components/landing/StatCard";
import FeatureCard from "../components/landing/FeatureCard";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  
  return (
    <div className="font-sans antialiased bg-white">
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative min-h-[95vh] flex items-center pt-8 overflow-hidden" id="hero">
        <div
          className="absolute inset-0 w-full h-full overflow-hidden"
          style={{ zIndex: 0 }}
        >
          <img
            src={heroBg}
            alt="Ocean Background"
            className="w-full h-full object-cover object-bottom scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
        </div>
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center text-left">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-xs text-white font-medium mt-6 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Environmental Monitoring
              </div>
              <h1 className="text-5xl md:text-4xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-4">
                Protecting <br /> Coastlines with <br />
                <span className="text-cyan-300">
                  Real-Time Waste
                </span> Detection
              </h1>
              <p className="text-white/70 text-base sm:text-lg mb-8 max-w-md leading-relaxed">
                TrashVision empowers local government units to detect, map, and
                respond to shoreline waste — automatically and intelligently.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <button className="bg-white text-blue-800 font-semibold text-sm px-6 py-3 rounded-xl hover:bg-blue-500 hover:text-white transition-colors shadow-lg" 
                onClick={() => navigate("/portal")}>
                  Open Forecast
                </button>
                {/* <button className="bg-white/10 border border-white/30 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-white/20 transition-colors backdrop-blur">
                  See How It Works
                </button> */}
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <MapPlaceholder />
            </div>
          </div>
        </div>
        \
        <div className="absolute bottom-0 left-0 right-0 leading-[0]">
          <svg
            viewBox="0 0 1440 80"
            preserveAspectRatio="none"
            className="w-full h-16 md:h-24"
          >
            <path
              d="M0 80L1440 80L1440 30Q1080 80 720 30Q360 -20 0 30Z"
              fill="white"
            />
          </svg>
        </div>
      </section>

      {/* STATS SECTION */}
        {/* <section className="relative z-20 bg-white" id="stat">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-x divide-slate-100">
              {stats.map((stat) => (
                <div key={stat.label} className="px-4">
                  <StatCard {...stat} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section> */}
      {/* FEATURES SECTION */}
      <section className="py-15 md:py-32"id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-left mb-12">
          <h3 className="text-s font-bold uppercase text-[#006]">
            Core Features
          </h3>
          <p className="text-[#0B1C30] text-6xl font-bold">Everything Your LGU Needs<br /> to Monitor Coastal Waste</p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 overflow-hidden rounded-2xl border border-slate-200 m-4">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>
      {/* HOW IT WORKS SECTION */}
      <section className="py-20 bg-[#EFF4FF]" id="hiw">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-16">
            From Drone to Decision in 3 Simple Steps
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 relative">
            <div className="hidden sm:block absolute top-10 left-[20%] right-[20%] h-px border-t-2 border-dashed border-blue-200 z-0" />
            {steps.map((s, i) => (
              <StepCard
                key={s.title}
                step={i + 1}
                {...s}
                isLast={i === steps.length - 1}
              />
            ))}
          </div>
        </div>
      </section>
      {/* CTA SECTION */}
      <section id="about"
        className="py-24 text-center text-white"
        style={{
          background: "linear-gradient(135deg, #1a56db 0%, #0d9488 100%)",
        }}
      >
        <div className="max-w-2xl mx-auto px-4">
          <h3 className="sm:text-2xl md:text-5xl font-extrabold mb-4">
            Ready to Clean Up Your Coastlines?
          </h3>
          <p className="text-white/80 mb-8 text-base">
            Join forward-thinking LGUs from Panabo City across the globe in
            restoring environmental integrity with intelligence.
          </p>
          <button className="bg-white text-blue-700 font-bold text-sm px-8 py-3.5 mt-8 rounded-xl hover:bg-blue-50 transition-colors shadow-lg">
            Open Forecast
          </button>
        </div>
      </section>
      <Footer />
    </div>
  );
}
