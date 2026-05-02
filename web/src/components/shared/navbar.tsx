import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import TVLogo from "@/assets/LOGO.png";
import { Eye, EyeOff, Lock } from "lucide-react";
import toast from "react-hot-toast";

export default function Navbar() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdminHint, setShowAdminHint] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navLinks = [
    { name: "Home", href: "#hero" },
    { name: "Features", href: "#features" },
    { name: "How It Works", href: "#hiw" },
    { name: "About", href: "#about" },
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const onAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked) {
      toast.error("Too many attempts. Please wait 30 seconds.");
      return;
    }

    if (loginAttempts >= 5) {
      setIsLocked(true);
      toast.error("Security Lock: Too many attempts.");
      setTimeout(() => {
        setIsLocked(false);
        setLoginAttempts(0);
      }, 30000);
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/login", { email, password });

      const { access_token, user } = response.data;
      const { role, name } = user;

      localStorage.setItem("token", access_token);
      localStorage.setItem("role", role);
      localStorage.setItem("user_name", name);

      setShowAdminHint(false);
      setLoginAttempts(0);

      if (role.toLowerCase() === "admin") {
        toast.success(`Welcome, ${name}`);
        navigate("/portal");
      } else {
        toast.error("Access Denied.");
      }
    } catch (error: any) {
      if (error.response?.status === 429) {
        setIsLocked(true);
        toast.error("Rate limit exceeded. Try again later.");
        setTimeout(() => setIsLocked(false), 30000);
      } else {
        setLoginAttempts((prev) => prev + 1);
        toast.error(error.response?.data?.detail || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-slate-200 py-2 shadow-sm"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <img src={TVLogo} alt="Logo" className="w-8 h-8 md:w-10 md:h-10" />
            <span
              className={`font-bold text-lg md:text-xl tracking-tight ${scrolled ? "text-slate-900" : "text-white"}`}
            >
              TrashVision
            </span>
          </div>

          {/* Desktop Nav */}
          <div
            className={`hidden md:flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-md ${
              scrolled
                ? "bg-slate-100/50 border border-slate-200"
                : "bg-white/5 border border-white/10"
            }`}
          >
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`text-sm font-medium px-4 py-2 rounded-full transition-all ${
                  scrolled
                    ? "text-slate-600 hover:text-blue-600"
                    : "text-white/80 hover:text-white"
                }`}
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Right side Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* <button
              onClick={() => navigate("/portal")}
              className={`text-xs md:text-sm font-bold px-4 md:px-5 py-2 rounded-xl transition-all shadow-lg active:scale-95 ${
                scrolled
                  ? "bg-blue-600 text-white"
                  : "bg-cyan-500/80 text-white"
              }`}
            >
              Open Forecast
            </button> */}

            <button
              className={`hidden md:flex w-9 h-9 items-center justify-center rounded-lg transition-all ${
                scrolled
                  ? "text-slate-400 hover:bg-slate-100"
                  : "text-white/20 hover:bg-white/5"
              }`}
              onClick={() => setShowAdminHint(!showAdminHint)}
            >
              <Lock size={18} />
            </button>

            {/* Mobile menu button */}
            <button
              className={`md:hidden p-2 rounded-lg border ${
                scrolled
                  ? "text-slate-900 border-slate-200"
                  : "text-white border-white/10"
              }`}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {menuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {showAdminHint && (
          <form
            onSubmit={onAuthSubmit}
            className={`absolute right-4 left-4 md:left-auto top-20 md:w-80 backdrop-blur-2xl rounded-2xl p-6 z-50 border shadow-2xl ${
              scrolled
                ? "bg-white border-slate-200"
                : "bg-slate-900/90 border-white/10"
            }`}
          >
            <h3
              className={`font-semibold text-sm mb-1 text-center ${scrolled ? "text-slate-900" : "text-white"}`}
            >
              Admin Access
            </h3>
            <div className="space-y-3 mt-4">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${
                  scrolled
                    ? "bg-slate-50 border-slate-200"
                    : "bg-white/10 border-white/10 text-white"
                }`}
              />

              <div className="relative">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-2.5 pr-11 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 ${
                      scrolled
                        ? "bg-slate-50 border-slate-200"
                        : "bg-white/10 border-white/10 text-white"
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                      scrolled
                        ? "text-slate-400 hover:text-slate-600"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {loginAttempts > 0 && loginAttempts < 5 && (
                  <p className="text-[10px] text-orange-500 font-bold mt-2">
                    Warning: {5 - loginAttempts} attempts remaining before
                    lockout.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Log In"}
              </button>
            </div>
          </form>
        )}

        {/* Mobile menu */}
        {menuOpen && (
          <div
            className={`md:hidden fixed inset-x-4 top-20 backdrop-blur-2xl border rounded-2xl p-4 space-y-2 shadow-2xl ${
              scrolled
                ? "bg-white/95 border-slate-200"
                : "bg-slate-900/95 border-white/20"
            }`}
          >
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`block text-sm px-4 py-3 rounded-xl ${scrolled ? "text-slate-600" : "text-white/80"}`}
              >
                {link.name}
              </a>
            ))}
            <hr className="border-white/10 my-2" />
            <button
              onClick={() => {
                setShowAdminHint(true);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 w-full text-sm px-4 py-3 rounded-xl text-blue-400 font-medium"
            >
              <Lock size={16} /> Admin Login
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
