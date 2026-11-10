import { Link } from "react-router-dom";
import LOGO from "@/assets/LOGO_WORDS.png";

// Static footer links — defined once, outside the render. An `href` starting
// with "/" is an app route (router navigation); the rest are still
// placeholders. Only Documentation has a real destination today: the public
// methodology page.
const FOOTER_SECTIONS: { section: string; links: { label: string; href: string }[] }[] = [
  {
    section: "Platform",
    links: [
      { label: "Detection Engine", href: "#" },
      { label: "Mapping Tools", href: "#" },
      { label: "API Access", href: "#" },
    ],
  },
  {
    section: "Support",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Documentation", href: "/info" },
      { label: "Contact Support", href: "#" },
    ],
  },
  {
    section: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Governance", href: "#" },
    ],
  },
];

const CURRENT_YEAR = new Date().getFullYear();
const LINK_CLASS = "text-sm text-white/60 hover:text-white transition-colors";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-slate-900 to-[#071726] text-white py-30 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center md:justify-start">
                <img src={LOGO} alt="TrashVision Logo with Tagline" className="h-16 md:h-20 w-auto" />
              </div>
            </div>
          </div>

          {FOOTER_SECTIONS.map(({ section, links }) => (
            <div key={section}>
              <h4 className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-3">{section}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link to={link.href} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className={LINK_CLASS}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 text-center text-xs text-white/30">
          © {CURRENT_YEAR} TrashVision. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
