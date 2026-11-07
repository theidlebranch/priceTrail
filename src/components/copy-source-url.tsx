"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Copies the stored source address. The address stays plain text on the
 * page, so this button is not a link and it does not submit the decision.
 */
export function CopySourceUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function onCopy() {
    const write = navigator.clipboard?.writeText(url);
    if (write === undefined) {
      return;
    }
    void write.then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
