// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const ORIGINAL = process.env.CRON_SECRET;

describe("POST /api/signals/openrouter", () => {
  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL;
    }
  });

  it("refuses the request before opening a database when the secret is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(new Request("http://localhost/api/signals/openrouter", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
