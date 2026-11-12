import type { HealthTone } from "@/core/source-health";
import { dotClass } from "@/components/source-health/tones";

/** A colored mark beside a word. The word is the cue a screen reader hears. */
export function StatusDot({ tone }: { tone: HealthTone }) {
  return (
    <span className={`inline-block size-2 shrink-0 rounded-full ${dotClass(tone)}`} aria-hidden="true" />
  );
}
