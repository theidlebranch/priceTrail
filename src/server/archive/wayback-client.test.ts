// @vitest-environment node

/**
 * These tests pass a fake fetch. They do not call archive.org.
 * A finished POST is only a job id. The permalink comes from a later
 * status response that includes a timestamp and the original URL.
 */
import { describe, expect, it } from "vitest";
import { capturePage, type CaptureDeps } from "@/server/archive/wayback-client";
import type { FetchLike } from "@/server/sources/provider-source";

const PAGE_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const JOB_ID = "spn2-eb689466aaf95d8a0a9e21c7b715f7caf3a5b380";
const TIMESTAMP = "20261019182706";
const PERMALINK = `https://web.archive.org/web/${TIMESTAMP}/${PAGE_URL}`;
const ACCESS_KEY = "access-key-test";
const SECRET_KEY = "secret-key-test";

type RecordedCall = {
  url: string;
  method: string;
  body: string;
  authorization: string;
  userAgent: string;
};

function deps(input: {
  fetchImpl: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): CaptureDeps & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body === undefined ? "" : String(init.body),
      authorization: headers.get("authorization") ?? "",
      userAgent: headers.get("user-agent") ?? "",
    });
    return input.fetchImpl(url, init);
  };

  return {
    fetchImpl,
    now: input.now ?? (() => 0),
    sleep: input.sleep ?? (async () => {}),
    accessKey: ACCESS_KEY,
    secretKey: SECRET_KEY,
    calls,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function assertNoSecrets(reason: string): void {
  expect(reason).not.toContain(SECRET_KEY);
  expect(reason).not.toContain(ACCESS_KEY);
  expect(reason).not.toContain("LOW ");
  expect(reason).not.toContain("Authorization:");
}

describe("capturePage", () => {
  it("returns a permalink only after the status job succeeds", async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const scripted = [
      jsonResponse(200, { url: PAGE_URL, job_id: JOB_ID }),
      jsonResponse(200, { status: "pending", job_id: JOB_ID }),
      jsonResponse(200, {
        status: "success",
        job_id: JOB_ID,
        timestamp: TIMESTAMP,
        original_url: PAGE_URL,
      }),
    ];
    const client = deps({
      fetchImpl: async () => {
        const next = scripted.shift();
        if (next === undefined) {
          throw new Error("no more scripted responses");
        }
        return next;
      },
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result).toEqual({ kind: "archived", permalink: PERMALINK });
    expect(client.calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "https://web.archive.org/save"],
      ["GET", `https://web.archive.org/save/status/${JOB_ID}`],
      ["GET", `https://web.archive.org/save/status/${JOB_ID}`],
    ]);
    expect(client.calls[0]?.body).toContain(encodeURIComponent(PAGE_URL));
    expect(client.calls[0]?.authorization).toBe(`LOW ${ACCESS_KEY}:${SECRET_KEY}`);
    expect(client.calls[0]?.userAgent).toBe("PriceTrail/0.1 (pricing evidence checker)");
    expect(sleeps).toEqual([5_000]);
  });

  it("fails when the submit response has no job id", async () => {
    const client = deps({
      fetchImpl: async () => jsonResponse(200, { url: PAGE_URL }),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/job_id/);
    assertNoSecrets(result.reason);
    expect(client.calls).toHaveLength(1);
  });

  it("fails when success is missing the timestamp needed for a permalink", async () => {
    const client = deps({
      fetchImpl: async () =>
        jsonResponse(200, {
          url: PAGE_URL,
          job_id: JOB_ID,
          status: "success",
          original_url: PAGE_URL,
        }),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/permalink/i);
    expect(result).not.toHaveProperty("permalink");
    assertNoSecrets(result.reason);
  });

  it("fails when success is missing the original URL needed for a permalink", async () => {
    const client = deps({
      fetchImpl: scriptedFetch([
        jsonResponse(200, { url: PAGE_URL, job_id: JOB_ID }),
        jsonResponse(200, { status: "success", job_id: JOB_ID, timestamp: TIMESTAMP }),
      ]),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/permalink/i);
    assertNoSecrets(result.reason);
  });

  it("fails when Wayback reports an error and does not throw", async () => {
    const client = deps({
      fetchImpl: scriptedFetch([
        jsonResponse(200, { url: PAGE_URL, job_id: JOB_ID }),
        jsonResponse(200, {
          status: "error",
          status_ext: "error:invalid-host-resolution",
          message: "Couldn't resolve host for http://example5123.com.",
          job_id: JOB_ID,
        }),
      ]),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result).toMatchObject({ kind: "failed" });
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/Couldn't resolve host/);
    assertNoSecrets(result.reason);
  });

  it("fails on HTTP 500 and leaves the secret out of the reason", async () => {
    const client = deps({
      fetchImpl: async () =>
        new Response(`denied ${SECRET_KEY} Authorization: LOW ${ACCESS_KEY}:${SECRET_KEY}`, {
          status: 500,
        }),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/HTTP 500/);
    assertNoSecrets(result.reason);
  });

  it("fails when the status stays pending past the time limit", async () => {
    let clock = 0;
    const client = deps({
      fetchImpl: scriptedFetch([
        jsonResponse(200, { url: PAGE_URL, job_id: JOB_ID }),
        jsonResponse(200, { status: "pending", job_id: JOB_ID }),
        jsonResponse(200, { status: "pending", job_id: JOB_ID }),
      ]),
      now: () => clock,
      sleep: async () => {
        clock += 180_000;
      },
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result).toMatchObject({ kind: "failed" });
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/timed out/i);
    assertNoSecrets(result.reason);
  }, 2_000);

  it("fails when the response is not JSON", async () => {
    const client = deps({
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/JSON/i);
    assertNoSecrets(result.reason);
  });

  it("fails when the job id is not safe to put in the status URL", async () => {
    const client = deps({
      fetchImpl: async () => jsonResponse(200, { url: PAGE_URL, job_id: "bad/id" }),
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/job_id/);
    expect(client.calls.map((call) => call.url)).toEqual(["https://web.archive.org/save"]);
    assertNoSecrets(result.reason);
  });

  it("fails when the page URL is blank and does not call fetch", async () => {
    const client = deps({
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    });

    const result = await capturePage("  ", client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/blank/i);
    expect(client.calls).toHaveLength(0);
  });

  it("fails when the download throws and does not include the secret", async () => {
    const client = deps({
      fetchImpl: async (_url, init) => {
        const authorization = new Headers(init?.headers).get("authorization") ?? "";
        throw new Error(`network down ${authorization}`);
      },
    });

    const result = await capturePage(PAGE_URL, client);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.reason).toMatch(/network down/);
    assertNoSecrets(result.reason);
  });
});

function scriptedFetch(responses: Response[]): FetchLike {
  const pending = [...responses];
  return async () => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error("no more scripted responses");
    }
    return next;
  };
}
