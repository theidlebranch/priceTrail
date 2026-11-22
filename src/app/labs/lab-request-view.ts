import { formatUtcCompact } from "@/core/source-health";

/**
 * Turn stored lab suggestions into the sentences the pages render.
 *
 * A pending row is waiting. An accepted row is not a tracked lab.
 * A declined row stays declined. A bad status, a blank name, or a
 * bad time throws. This file does not open a database.
 */

export type LabRequestRow = {
  id: number;
  labName: string;
  suggestedBy: string;
  suggestedAt: Date;
  status: "pending" | "accepted" | "declined";
  reviewNote: string | null;
};

export type LabRequestEntry = {
  id: number;
  labName: string;
  suggestedBy: string;
  suggestedAtText: string;
  statusLabel: string;
  reviewNote: string | null;
};

export function toLabRequestEntries(rows: readonly LabRequestRow[]): LabRequestEntry[] {
  return rows.map((row) => {
    const labName = row.labName.trim();
    if (labName.length === 0) {
      throw new Error("lab name is empty");
    }
    if (!Number.isInteger(row.id) || row.id <= 0) {
      throw new Error("request id must be a whole number");
    }
    if (row.suggestedBy.trim().length === 0) {
      throw new Error("account id is missing");
    }
    const stamp = formatUtcCompact(row.suggestedAt);
    return {
      id: row.id,
      labName,
      suggestedBy: row.suggestedBy,
      suggestedAtText: `${stamp.short} UTC`,
      statusLabel: statusLabel(row.status),
      reviewNote: row.reviewNote,
    };
  });
}

export function requestCountLabel(count: number): string {
  return count === 1 ? "1 waiting" : `${count} waiting`;
}

function statusLabel(status: LabRequestRow["status"]): string {
  switch (status) {
    case "pending":
      return "Waiting for a reviewer.";
    case "accepted":
      return "Accepted. This lab is not tracked yet.";
    case "declined":
      return "Declined.";
    default: {
      const unknown: never = status;
      throw new Error(`request status is unknown: ${unknown}`);
    }
  }
}
