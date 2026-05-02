import LOGO from "@/assets/LOGO_WORDS.png"




const footerLinks = {
  Platform: ["Detection Engine", "Mapping Tools", "API Access"],
  Support: ["Help Center", "Documentation", "Contact Support"],
  Legal: ["Privacy Policy", "Terms of Service", "Governance"],
};

export default function Footer() {
  return (
    <footer className="bg-gray-950 text-white py-30 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-100 h-20 flex items-center justify-center">
                <img src={LOGO} alt="TrashVision Logo with Tagline" />
              </div>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h4 className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-3">{section}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-white/60 hover:text-white transition-colors">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 text-center text-xs text-white/30">
          © 2025 TrashVision. All rights reserved.
        </div>
      </div>
    </footer>
  );
}