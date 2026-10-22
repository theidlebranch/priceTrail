import { z } from "zod";

const dimensionSchema = z.enum([
  "input",
  "output",
  "cache_read",
  "cache_write_5m",
  "cache_write_1h",
  "cache_write",
]);

const conditionSchema = z.object({
  promptTokensOver: z.number().int().positive().optional(),
  promptTokensAtMost: z.number().int().positive().optional(),
  promptTokensUnder: z.number().int().positive().optional(),
  promptTokensAtLeast: z.number().int().positive().optional(),
});

export const normalizedPriceSchema = z.object({
  provider: z.enum(["anthropic", "openai", "google"]),
  modelName: z.string().min(1),
  modelSlug: z.string().min(1),
  dimension: dimensionSchema,
  usdPer1M: z.string().min(1),
  condition: conditionSchema.optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  source: z.enum(["official", "models.dev", "litellm"]),
  note: z.string().min(1).optional(),
});

export type Condition = z.infer<typeof conditionSchema>;
export type NormalizedPrice = z.infer<typeof normalizedPriceSchema>;
