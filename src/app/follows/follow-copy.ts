/**
 * The sentences a follow click shows in a toast.
 *
 * This file does not open a database. The action passes the name it
 * read from the catalog and the outcome of the write.
 */

export type FollowCopyKind = "model" | "lab";

export type FollowCopy = {
  title: string;
  description?: string;
};

export function followResultCopy(input: {
  name: string;
  kind: FollowCopyKind;
  outcome: "followed" | "already" | "removed" | "absent";
}): FollowCopy {
  if (input.outcome === "already") {
    return { title: `You already follow ${input.name}.` };
  }
  if (input.outcome === "removed") {
    return {
      title: `${input.name} removed.`,
      description: "It is no longer on your Following page.",
    };
  }
  if (input.outcome === "absent") {
    return { title: `You are not following ${input.name}.` };
  }
  if (input.kind === "lab") {
    return {
      title: `Following ${input.name}.`,
      description: "The lab is on your Following page. Each model is still its own follow.",
    };
  }
  return {
    title: `Following ${input.name}.`,
    description: "It is on your Following page.",
  };
}

export function refusalSentence(message: string, kind: FollowCopyKind): string {
  if (message === "that model is not tracked") {
    return "That model is not tracked.";
  }
  if (message === "that lab is not tracked") {
    return "That lab is not tracked.";
  }
  return kind === "lab" ? "Sign in to follow this lab." : "Sign in to follow this model.";
}

export function signInToFollow(kind: FollowCopyKind): string {
  return kind === "lab" ? "Sign in to follow this lab." : "Sign in to follow this model.";
}
