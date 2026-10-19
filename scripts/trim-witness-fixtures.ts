import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  LITELLM_SAMPLE_KEYS,
  MODELS_DEV_SAMPLE,
  pickModelsDevSample,
  pickRequiredEntries,
} from "./pick-witness-sample";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

async function main(): Promise<void> {
  const modelsDevRaw = await readFile(
    path.join(FIXTURES_DIR, "models-dev-api.json"),
    "utf8",
  );
  const modelsDev = JSON.parse(modelsDevRaw) as Record<
    string,
    { id?: string; models?: Record<string, unknown> }
  >;
  const modelsDevSample = pickModelsDevSample(modelsDev, MODELS_DEV_SAMPLE);
  const modelsDevPath = path.join(FIXTURES_DIR, "models-dev-sample.json");
  await writeFile(
    modelsDevPath,
    `${JSON.stringify(modelsDevSample, null, 2)}\n`,
    "utf8",
  );
  console.log("wrote", modelsDevPath);

  const litellmRaw = await readFile("/tmp/litellm.json", "utf8");
  const litellm = JSON.parse(litellmRaw) as Record<string, unknown>;
  const litellmSample = pickRequiredEntries(litellm, LITELLM_SAMPLE_KEYS);
  const litellmPath = path.join(FIXTURES_DIR, "litellm-sample.json");
  await writeFile(
    litellmPath,
    `${JSON.stringify(litellmSample, null, 2)}\n`,
    "utf8",
  );
  console.log("wrote", litellmPath);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
