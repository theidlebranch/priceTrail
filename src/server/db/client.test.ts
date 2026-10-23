import { describe, expect, it } from "vitest";
import { connectionOptions } from "@/server/db/client";

const verifiedTls = { max: 1, ssl: { rejectUnauthorized: true } };

describe("connectionOptions", () => {
  it("uses verified TLS when the URL says sslmode=require", () => {
    expect(
      connectionOptions(
        "postgresql://price_trail:secret@example.neon.tech/price_trail?sslmode=require",
      ),
    ).toEqual(verifiedTls);
  });

  it("uses verified TLS for sslmode=require even on localhost", () => {
    expect(
      connectionOptions("postgresql://price_trail:secret@localhost:5432/price_trail?sslmode=require"),
    ).toEqual(verifiedTls);
  });

  it("does not turn SSL on for localhost when sslmode is absent", () => {
    expect(
      connectionOptions("postgresql://price_trail:secret@localhost:5432/price_trail"),
    ).toEqual({ max: 1 });
  });

  it("does not turn SSL on for the IPv4 loopback host", () => {
    expect(
      connectionOptions("postgresql://price_trail:secret@127.0.0.1:5432/price_trail"),
    ).toEqual({ max: 1 });
  });

  it("does not turn SSL on for the IPv6 loopback host", () => {
    expect(connectionOptions("postgresql://price_trail:secret@[::1]:5432/price_trail")).toEqual({
      max: 1,
    });
  });

  it("does not turn SSL on for an empty host", () => {
    expect(connectionOptions("postgresql:///price_trail")).toEqual({ max: 1 });
  });

  it("uses verified TLS for a remote host when sslmode is absent", () => {
    expect(
      connectionOptions("postgresql://price_trail:secret@example.neon.tech/price_trail"),
    ).toEqual(verifiedTls);
  });

  it("uses verified TLS for a multi-host URL when any host is remote", () => {
    expect(
      connectionOptions("postgresql://price_trail:secret@host1:5432,host2:5433/price_trail"),
    ).toEqual(verifiedTls);
  });

  it("leaves an explicit non-require sslmode unchanged", () => {
    expect(
      connectionOptions(
        "postgresql://price_trail:secret@example.neon.tech/price_trail?sslmode=disable",
      ),
    ).toEqual({ max: 1 });
  });

  it("throws when the URL cannot be parsed, instead of guessing SSL", () => {
    expect(() => connectionOptions("not a url")).toThrow();
  });
});
