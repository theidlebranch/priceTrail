import type { StripSlot } from "@/core/source-health";
import { barClass } from "@/components/source-health/tones";

/**
 * 24 checks, oldest on the left. The list uses a fixed bar so the strip
 * stays one line. The detail page stretches the same 24 bars across the card.
 * The label counts the colors, so the color is not the only cue.
 */
export function CheckStrip({
  slots,
  label,
  tall = false,
}: {
  slots: readonly StripSlot[];
  label: string;
  tall?: boolean;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div
        role="img"
        aria-label={label}
        className={tall ? "flex h-10 w-full min-w-[236px] gap-1" : "flex h-8 w-max gap-1"}
      >
        {slots.map((slot, index) => (
          <span
            key={`${slot.title}-${index}`}
            title={slot.title}
            className={`${tall ? "h-10 min-w-1.5 flex-1" : "h-8 w-1.5"} shrink-0 rounded-sm ${barClass(slot.outcome)}`}
          />
        ))}
      </div>
    </div>
  );
}
