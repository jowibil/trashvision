import { termsOfService } from "../../content/legal";
import LegalDocumentPage from "./LegalDocumentPage";

/** Public /terms page. Thin wrapper so the document itself stays in a lazy chunk. */
export default function Terms() {
  return <LegalDocumentPage document={termsOfService} />;
}
