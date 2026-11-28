import { priceAlertEvents, siteAlertLines } from "@/core/alerts/site-alert";

/**
 * Who hears about one published price.
 *
 * A person matches when they follow that model, or the lab that owns
 * it. Following both still counts once. A review card and a page that
 * could not be read are not inputs here. This file does not fetch and
 * does not open a database.
 */

export type StoredFollow = {
  accountId: string;
  kind: "model" | "lab";
  modelId: number | null;
  labId: number | null;
};

export function accountsFollowingPublishedPrice(input: {
  labId: number;
  modelId: number;
  follows: readonly StoredFollow[];
}): string[] {
  const ids = new Set<string>();
  for (const follow of input.follows) {
    const matchesModel = follow.kind === "model" && follow.modelId === input.modelId;
    const matchesLab = follow.kind === "lab" && follow.labId === input.labId;
    if (matchesModel || matchesLab) {
      ids.add(follow.accountId);
    }
  }
  return [...ids];
}

/**
 * The one sentence a follower receives. It is the same published-price
 * line the reviewer channel already uses.
 */
export function publishedPriceLine(lab: string, model: string): string {
  return siteAlertLines(priceAlertEvents({ published: true, lab, model }));
}
