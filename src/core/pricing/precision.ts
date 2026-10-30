/**
 * How sure we are about the day a price starts.
 *
 * announced: a source named the day. The chart may start on that day.
 * observed: we only know the fetch that first showed the price. The chart
 * says "changed on or before" that UTC day. firstSeenAt stays the real fetch.
 *
 * This does not read or write the database. The columns already store the
 * facts. This only names them.
 */
export type PricePrecision =
  | { kind: "announced"; chartStart: string }
  | { kind: "observed"; chartStart: string; wording: "changed on or before" };

export function pricePrecisionLabel(input: {
  firstSeenAt: Date;
  announcedOn?: string | null;
}): PricePrecision {
  if (input.announcedOn != null && input.announcedOn.length > 0) {
    return { kind: "announced", chartStart: input.announcedOn };
  }

  return {
    kind: "observed",
    chartStart: utcCalendarDay(input.firstSeenAt),
    wording: "changed on or before",
  };
}

function utcCalendarDay(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
