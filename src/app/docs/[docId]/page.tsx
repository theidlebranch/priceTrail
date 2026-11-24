import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AChangedPageDiagram } from "@/app/docs/diagrams/a-changed-page";
import { APersonDecidesDiagram } from "@/app/docs/diagrams/a-person-decides";
import { APricePeriodDiagram } from "@/app/docs/diagrams/a-price-period";
import { CodeLayersDiagram } from "@/app/docs/diagrams/code-layers";
import { OneOfficialVisitDiagram } from "@/app/docs/diagrams/one-official-visit";
import { SixHourClockDiagram } from "@/app/docs/diagrams/six-hour-clock";
import { SuggestALabDiagram } from "@/app/docs/diagrams/suggest-a-lab";
import { TablesCatalogDiagram } from "@/app/docs/diagrams/tables-catalog";
import { TablesEvidenceDiagram } from "@/app/docs/diagrams/tables-evidence";
import { TablesSignalsDiagram } from "@/app/docs/diagrams/tables-signals";
import { TheOnlyPriceWriterDiagram } from "@/app/docs/diagrams/the-only-price-writer";
import { UntrackedModelDiagram } from "@/app/docs/diagrams/untracked-model";
import { WhenANumberLooksWrongDiagram } from "@/app/docs/diagrams/when-a-number-looks-wrong";
import { WhereItRunsDiagram } from "@/app/docs/diagrams/where-it-runs";
import { WhoSeesWhichPageDiagram } from "@/app/docs/diagrams/who-sees-which-page";
import { WitnessesDiagram } from "@/app/docs/diagrams/witnesses";

const diagrams: Record<string, () => ReactElement> = {
  "code-layers": CodeLayersDiagram,
  "where-it-runs": WhereItRunsDiagram,
  "who-sees-which-page": WhoSeesWhichPageDiagram,
  "six-hour-clock": SixHourClockDiagram,
  "one-official-visit": OneOfficialVisitDiagram,
  "a-changed-page": AChangedPageDiagram,
  "a-person-decides": APersonDecidesDiagram,
  "a-price-period": APricePeriodDiagram,
  "the-only-price-writer": TheOnlyPriceWriterDiagram,
  witnesses: WitnessesDiagram,
  "untracked-model": UntrackedModelDiagram,
  "suggest-a-lab": SuggestALabDiagram,
  "tables-catalog": TablesCatalogDiagram,
  "tables-evidence": TablesEvidenceDiagram,
  "tables-signals": TablesSignalsDiagram,
  "when-a-number-looks-wrong": WhenANumberLooksWrongDiagram,
};

/**
 * params is a Promise in this Next.js version.
 *
 * The id is read before the page draws, so a missing id can answer
 * 404. These sixteen drawings are listed in generateStaticParams.
 * Any other id calls notFound().
 *
 * instant is false because this read waits on the URL. The check is
 * allowed to block.
 */
export const instant = false;

export function generateStaticParams() {
  return Object.keys(diagrams).map((docId) => ({ docId }));
}

export default async function DocPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const Diagram = diagrams[docId];
  if (!Diagram) {
    notFound();
  }

  return (
    <article className="doc-figure">
      <p className="doc-back">
        <Link href="/docs">How it works</Link>
      </p>
      <Diagram />
    </article>
  );
}
