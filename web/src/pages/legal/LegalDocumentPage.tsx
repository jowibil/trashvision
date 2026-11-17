import { Link } from "react-router-dom";
import { OPERATING_TEAM, SUPPORT_EMAIL, type LegalDocument } from "../../content/legal";

/**
 * One legal document rendered as a public page (/terms, /privacy).
 *
 * Content-only component: the document comes from `content/legal.ts`, the twin
 * of the mobile app's `config/legal_content.dart`, so the portal and the phone
 * tell the same story. Routes wrap this in DocShell, outside the portal shell —
 * a legal page should be reachable without an account.
 */
export default function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const otherHref = document.id === "terms" ? "/privacy" : "/terms";
  const otherLabel = document.id === "terms" ? "Privacy Policy" : "Terms of Service";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-slate-800 md:px-8 md:py-14">
      <p className="text-xs font-bold uppercase tracking-widest text-[#005D90]">Legal</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
        {document.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
          Version {document.version}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
          Effective {document.effectiveDate}
        </span>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-[#005D90]">
          Panabo City, Davao del Norte
        </span>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-slate-600 md:text-base">{document.summary}</p>

      <div className="mt-10 space-y-9">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-black tracking-tight text-slate-900 md:text-lg">
              {section.heading}
            </h2>
            <div className="mt-2.5 space-y-3">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-slate-600 md:text-[15px]">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="mt-12 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Contact</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Questions, access requests or deletion requests go to {OPERATING_TEAM}:
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-2 inline-block text-sm font-semibold text-[#005D90] underline underline-offset-2 transition-colors hover:text-[#004a73]"
        >
          {SUPPORT_EMAIL}
        </a>
        <p className="mt-4 text-xs text-slate-500">
          See also{" "}
          <Link
            to={otherHref}
            className="font-semibold text-[#005D90] underline underline-offset-2 transition-colors hover:text-[#004a73]"
          >
            {otherLabel}
          </Link>
          . The mobile app carries the same documents under Help &amp; Services.
        </p>
      </aside>

      <p className="mt-6 text-xs leading-relaxed text-slate-400">
        Written in plain language by {OPERATING_TEAM}. This document is not legal advice.
      </p>
    </div>
  );
}
