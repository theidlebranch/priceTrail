import { describe, expect, it } from "vitest";
import {
  interpretWaybackStatus,
  parseCaptureSubmit,
  requireIaKeys,
} from "./wayback-status";

describe("interpretWaybackStatus", () => {
  it("returns the permalink when the job succeeded", () => {
    const result = interpretWaybackStatus({
      status: "success",
      job_id: "ac58789b-f3ca-48d0-9ea6-1d1225e98695",
      original_url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
      timestamp: "20261019180000",
    });

    expect(result).toEqual({
      kind: "success",
      permalink:
        "https://web.archive.org/web/20261019180000/https://platform.claude.com/docs/en/about-claude/pricing.md",
      timestamp: "20261019180000",
      originalUrl:
        "https://platform.claude.com/docs/en/about-claude/pricing.md",
    });
  });

  it("returns pending while the job is still running", () => {
    const result = interpretWaybackStatus({
      status: "pending",
      job_id: "e70f33c7-9eca-4c88-826d-26930564d7c8",
    });

    expect(result).toEqual({ kind: "pending" });
  });

  it("throws when the job reports an error", () => {
    expect(() =>
      interpretWaybackStatus({
        status: "error",
        status_ext: "error:invalid-host-resolution",
        message: "Couldn't resolve host for http://example5123.com.",
        job_id: "2546c79b-ec70-4bec-b78b-1941c42a6374",
      }),
    ).toThrow(/Couldn't resolve host/);
  });

  it("throws when success is missing the timestamp needed for a permalink", () => {
    expect(() =>
      interpretWaybackStatus({
        status: "success",
        original_url: "https://example.com/",
      }),
    ).toThrow(/permalink/i);
  });

  it("throws when success is missing the original URL needed for a permalink", () => {
    expect(() =>
      interpretWaybackStatus({
        status: "success",
        timestamp: "20261019180000",
      }),
    ).toThrow(/permalink/i);
  });

  it("throws on an unrecognized status", () => {
    expect(() => interpretWaybackStatus({ status: "queued" })).toThrow(
      /unrecognized status/i,
    );
  });
});

describe("parseCaptureSubmit", () => {
  it("returns the job id from a capture request", () => {
    expect(
      parseCaptureSubmit({
        url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
        job_id: "ac58789b-f3ca-48d0-9ea6-1d1225e98695",
      }),
    ).toEqual({
      url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
      jobId: "ac58789b-f3ca-48d0-9ea6-1d1225e98695",
    });
  });

  it("throws when the capture request has no job_id", () => {
    expect(() =>
      parseCaptureSubmit({ url: "https://example.com/" }),
    ).toThrow(/job_id/);
  });
});

describe("requireIaKeys", () => {
  it("returns the access and secret keys", () => {
    expect(
      requireIaKeys({
        IA_ACCESS_KEY: "access",
        IA_SECRET_KEY: "secret",
      }),
    ).toEqual({ accessKey: "access", secretKey: "secret" });
  });

  it("throws when a key is missing", () => {
    expect(() => requireIaKeys({ IA_ACCESS_KEY: "access" })).toThrow(
      /IA_SECRET_KEY/,
    );
  });

  it("throws when a key is empty", () => {
    expect(() =>
      requireIaKeys({ IA_ACCESS_KEY: "   ", IA_SECRET_KEY: "secret" }),
    ).toThrow(/IA_ACCESS_KEY/);
  });
});
