/**
 * Short lines for one site-wide alert.
 *
 * A line names the lab, the model when there is one, and what happened.
 * It does not include a price, a page address, or a secret. This file
 * does not fetch and does not open a database. An empty list means there
 * is nothing to send.
 */

const LAB_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export type SiteAlertEvent =
  | { kind: "new_model"; lab: string; model: string }
  | { kind: "retirement"; lab: string; model: string }
  | { kind: "gone"; lab: string; model: string }
  | { kind: "parser_suspect"; lab: string }
  | { kind: "price_published"; lab: string; model: string };

export type VisitAlertCard = {
  kind: "new_name" | "retirement" | "gone";
  modelName: string;
  modelSlug: string;
};

export type VisitAlertOutcome = "fetch_error" | "parser_suspect" | "unchanged" | "changed";

export function siteAlertLines(events: readonly SiteAlertEvent[]): string {
  return events.map(siteAlertLine).join("\n");
}

/**
 * Events from one filed pricing visit.
 *
 * A page that could not be read is one event. A new model, a retirement
 * note, and a model missing twice are events too. A failed download and
 * an unchanged page stay quiet unless a card opened. A card with no name
 * and no slug is skipped so the other lines can still be sent.
 */
export function eventsFromVisit(
  lab: string,
  outcome: VisitAlertOutcome,
  cards: readonly VisitAlertCard[],
): SiteAlertEvent[] {
  const events: SiteAlertEvent[] = [];
  if (outcome === "parser_suspect") {
    events.push({ kind: "parser_suspect", lab });
  }
  for (const card of cards) {
    const model = cardLabel(card);
    if (model === null) {
      continue;
    }
    if (card.kind === "new_name") {
      events.push({ kind: "new_model", lab, model });
    } else if (card.kind === "retirement") {
      events.push({ kind: "retirement", lab, model });
    } else {
      events.push({ kind: "gone", lab, model });
    }
  }
  return events;
}

/**
 * A price line only when this decision published a price. Confirming the
 * same price, rejecting, and accepting a retirement do not.
 */
export function priceAlertEvents(input: {
  published: boolean;
  lab: string;
  model: string;
}): SiteAlertEvent[] {
  if (!input.published) {
    return [];
  }
  return [{ kind: "price_published", lab: input.lab, model: input.model }];
}

function siteAlertLine(event: SiteAlertEvent): string {
  const lab = labLabel(event.lab);
  switch (event.kind) {
    case "new_model":
      return `${lab}: ${modelLabel(event.model)} is a new model waiting for review.`;
    case "retirement":
      return `${lab}: ${modelLabel(event.model)} may be retired and is waiting for review.`;
    case "gone":
      return `${lab}: ${modelLabel(event.model)} is missing from the pricing page and is waiting for review.`;
    case "parser_suspect":
      return `${lab}: the pricing page could not be read.`;
    case "price_published":
      return `${lab}: ${modelLabel(event.model)} has a new published price.`;
  }
}

function labLabel(lab: string): string {
  const trimmed = lab.trim();
  if (trimmed === "") {
    throw new Error("alert lab is empty");
  }
  return LAB_LABELS[trimmed] ?? trimmed;
}

function modelLabel(model: string): string {
  const trimmed = model.trim();
  if (trimmed === "") {
    throw new Error("alert model is empty");
  }
  return trimmed;
}

function cardLabel(card: VisitAlertCard): string | null {
  const name = card.modelName.trim();
  if (name !== "") {
    return name;
  }
  const slug = card.modelSlug.trim();
  if (slug !== "") {
    return slug;
  }
  return null;
}
