import { privacyPolicy } from "../../content/legal";
import LegalDocumentPage from "./LegalDocumentPage";

/** Public /privacy page. Thin wrapper so the document itself stays in a lazy chunk. */
export default function Privacy() {
  return <LegalDocumentPage document={privacyPolicy} />;
}
