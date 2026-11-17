// Legal documents — the portal twin of `mobile/lib/config/legal_content.dart`.
//
// Same wording, same version, same effective date, same section order: the
// phone app's Help & Services screens and these pages must not tell two
// different stories about the same data. Edit both files, or neither, and bump
// LEGAL_VERSION / LEGAL_EFFECTIVE_DATE in both when you do.

export type LegalDocumentId = "terms" | "privacy";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export const LEGAL_VERSION = "1.0";
export const LEGAL_EFFECTIVE_DATE = "15 November 2026";

/** The entity responsible for the Service, as named in both documents. */
export const OPERATING_TEAM = "the TrashVision student research team";

/**
 * The only support address the site publishes. It is the same constant the
 * mobile app carries, so a change here is a change there.
 *
 * TODO(team): point this at the inbox that actually reaches the research team
 * before this page is relied on. `support@trashvision.org` matches the address
 * style the app already uses in its fallbacks.
 */
export const SUPPORT_EMAIL = "trashvision@gmail.com";

export const termsOfService: LegalDocument = {
  id: "terms",
  title: "Terms of Service",
  summary:
    "The rules for using TrashVision: what you may report, what we do with it, and the limits of the numbers the app shows.",
  version: LEGAL_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      heading: "1. What TrashVision is",
      paragraphs: [
        "TrashVision is a trash monitoring and reporting platform built by a student research team. It combines drone survey imagery, an automated detection model and citizen reports to map shoreline waste in Panabo City, Davao del Norte.",
        "The Service is research and decision support. It is not an official record of the City Government of Panabo or of any national agency, and nothing in it replaces an inspection, a cleanup operation or an emergency response.",
      ],
    },
    {
      heading: "2. Your account",
      paragraphs: [
        "You need an account to report waste. Give accurate details, keep one account per person, and keep your password to yourself — you are responsible for what happens under your account. If you are under 18, use the Service with the consent of a parent or guardian.",
        "Tell us at the address below if you believe your account has been used without your permission.",
      ],
    },
    {
      heading: "3. What you may submit",
      paragraphs: [
        "Report only waste you actually saw, with a photo taken where you reported it. Do not photograph identifiable faces, the interior of private property, or anything you do not have the right to share.",
        "Do not submit false, duplicated or coordinated reports — they cost administrators time and distort the counts other people rely on. Administrators may verify, reclassify or reject any report.",
      ],
    },
    {
      heading: "4. Your content and the licence you give us",
      paragraphs: [
        "You keep ownership of your photos and descriptions. By submitting a report you grant the TrashVision team a non-exclusive, royalty-free licence to store it, process it (including running the detection model on it), display it in the app and the portal, and use it in aggregated maps, figures and academic write-ups about the project.",
        "You confirm you have the right to share what you upload. Removing a report does not undo figures that were already published in aggregate form.",
      ],
    },
    {
      heading: "5. Acceptable use",
      paragraphs: [
        "Do not attempt to reach accounts, administrative tools or data that are not yours; do not scrape, bulk-download or automate requests beyond normal use; do not upload malware; do not use the assistant to produce unlawful or harmful content; do not use the Service to harass anyone.",
        "We may suspend or close an account that breaks these rules, and we may report serious abuse to the proper authorities.",
      ],
    },
    {
      heading: "6. The numbers are estimates",
      paragraphs: [
        "Clean Coast Index values, severity bands, hex colours, counts and alerts are produced by a detection model and a database. They can be wrong.",
        "The model recognises five classes of waste only. Photos without GPS cannot be de-duplicated against each other, so one object can be counted more than once. The CCI scale factor is not yet calibrated against field measurements, so the scale is conservative. And an area's count does not fall after a cleanup, because nothing resets it automatically.",
        "Treat every figure as a planning estimate, not a measurement.",
      ],
    },
    {
      heading: "7. Availability",
      paragraphs: [
        "The Service runs on a best-effort basis by a small student team. It may be slow, rate-limited, unavailable or changed without notice, and features may be removed.",
        "Reports filed without a connection are queued on the phone and uploaded when a connection returns; we cannot promise when that will happen. Do not use TrashVision for emergencies or for anything where a delay could cause harm — contact the proper local authorities.",
      ],
    },
    {
      heading: "8. Ending use",
      paragraphs: [
        "You may stop using the Service at any time and ask us to delete your account and personal information. We may suspend or close an account that breaches these Terms or puts the Service or other people at risk.",
        "Reports already received may remain in aggregated, de-identified form, and the audit record of administrative decisions is kept.",
      ],
    },
    {
      heading: "9. Intellectual property",
      paragraphs: [
        "The app, the portal, the detection model, the documentation and the design belong to the team or its licensors. Do not copy, resell or redistribute them except as the law allows or with written permission.",
        "Third-party material keeps its own terms — map tiles come from Mapbox, the city boundary from OpenStreetMap contributors, and the icons and fonts from their respective licences.",
      ],
    },
    {
      heading: "10. No warranty",
      paragraphs: [
        "The Service is provided as it is and as it is available, without warranties of any kind to the extent the law permits, including accuracy, completeness, fitness for a particular purpose and non-infringement. You use it at your own risk.",
      ],
    },
    {
      heading: "11. Limitation of liability",
      paragraphs: [
        "To the extent the law permits, the team is not liable for indirect, incidental or consequential loss, or for decisions taken on the basis of the Service's figures. Where liability cannot be excluded, it is limited to the amount you paid to use the Service — which is nothing, because the Service is free.",
      ],
    },
    {
      heading: "12. Changes to these Terms",
      paragraphs: [
        "We may update these Terms. The version number and effective date at the top of this document change with every revision, and material changes are announced in the app. Continuing to use the Service after an update means you accept the new version.",
      ],
    },
    {
      heading: "13. Law and contact",
      paragraphs: [
        "These Terms are governed by the laws of the Republic of the Philippines, and disputes belong to the courts of Panabo City, Davao del Norte.",
        `Questions about them go to ${SUPPORT_EMAIL}. This document is written in plain language by a student research team; it is not legal advice.`,
      ],
    },
  ],
};

export const privacyPolicy: LegalDocument = {
  id: "privacy",
  title: "Privacy Policy",
  summary:
    "What TrashVision collects, why, who else processes it, and how to reach us about it.",
  version: LEGAL_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      heading: "1. Who is responsible",
      paragraphs: [
        "The TrashVision student research team operates the app and the portal as an academic project. For the purposes of the Data Privacy Act of 2012 (Republic Act No. 10173), the team is the personal information controller for the data described here.",
        "Write to us at the address at the end of this document for anything about your information.",
      ],
    },
    {
      heading: "2. What we collect",
      paragraphs: [
        "Account: your name, email address, a hashed password and your role, plus a session token kept in the phone's secure storage.",
        "Reports: the photo you attach, the latitude and longitude and the accuracy the device reports, the time, your description, and the account that submitted it. A copy stays on the phone until it uploads.",
        "Guest reports: filed without signing in, they wait on the phone under a placeholder owner and are assigned to the account that signs in next on that device.",
        "Diagnostics: ordinary server logs of requests (time, endpoint, status) and error reports from the app.",
      ],
    },
    {
      heading: "3. Photos and location",
      paragraphs: [
        "Photos are uploaded to Cloudinary, our image host, and the coordinates are stored with the report; both are needed to put the report on the map and to let an administrator verify it. Photos taken while offline or in guest mode are stamped with the device's GPS position before they are queued.",
        "Report only what you are entitled to photograph: no identifiable faces, no interiors of private property.",
      ],
    },
    {
      heading: "4. Why we process it",
      paragraphs: [
        "To show your reports to administrators for verification, to run the detection model on verified photos, to map waste and produce area counts, alerts and the public dashboard, to keep the Service secure and prevent abuse, and to report aggregate findings in academic work.",
        "We do not use your report to advertise anything to you.",
      ],
    },
    {
      heading: "5. Who can see it",
      paragraphs: [
        "Administrators see verified reports and who filed them. Other users see public maps and the public report feed, which show location, waste type, status and the photo — not your email address or your name.",
        "Service providers process data on our behalf: Cloudinary for images, Mapbox for map tiles, our hosting and database provider, and Google's Gemini model when you use the assistant.",
        "We do not sell personal information.",
      ],
    },
    {
      heading: "6. The assistant",
      paragraphs: [
        "Messages you send to the assistant are transmitted to our backend and to a third-party AI model provider so that a reply can be generated, and they may be logged for debugging. The assistant is given live figures about areas, not your personal details — but do not type personal or sensitive information into it.",
      ],
    },
    {
      heading: "7. What stays on your phone",
      paragraphs: [
        "Queued reports, cached map tiles and cached dashboard figures live in the app's own database and storage, and the session token lives in secure storage.",
        "Signing out clears the session; clearing the app's data removes the local copies. Reports that were already uploaded are not affected by either.",
      ],
    },
    {
      heading: "8. How long we keep it",
      paragraphs: [
        "Reports, photos and detections are kept for as long as the research project runs, because the counts and the model's evaluation depend on them.",
        "A pending report that never reached the server can be deleted in the app at any time. Once a report has been uploaded it cannot be deleted from the app — write to us and we will take it out of the dataset; aggregated figures that no longer identify you may remain.",
      ],
    },
    {
      heading: "9. Your rights",
      paragraphs: [
        "Under the Data Privacy Act you may ask to be told what we hold about you, have it corrected, have it erased or blocked, object to its processing, and complain to the National Privacy Commission.",
        "Send the request from the email address on your account so we can confirm it is you. We answer within a reasonable period.",
      ],
    },
    {
      heading: "10. Security",
      paragraphs: [
        "Passwords are stored hashed, sessions are token-based, and administrative tools are restricted by role. No system is perfectly secure: use a password you do not use anywhere else, and tell us if you think your account has been compromised.",
      ],
    },
    {
      heading: "11. Children",
      paragraphs: [
        "The Service is not directed at children under 13. If you are under 18, use it with the consent of a parent or guardian. If a child's information reaches us without that consent, write to us and we will remove it.",
      ],
    },
    {
      heading: "12. Changes to this policy",
      paragraphs: [
        "This policy may be updated. The version number and effective date at the top change with every revision, and material changes are announced in the app. The previous version stays available on request.",
      ],
    },
  ],
};
