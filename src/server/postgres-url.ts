/**
 * Hosts and sslmode from a Postgres connection URL.
 *
 * Postgres.js does not parse the whole string with the URL class. A list
 * such as host1:5432,host2:5433 is not a valid single hostname, so the
 * driver splits on commas and parses only the first host. This follows
 * that same split. The caller still receives the original URL string.
 */
export function readPostgresUrl(value: string): {
  hosts: string[];
  sslmode: string | null;
} {
  if (!value.startsWith("postgres://") && !value.startsWith("postgresql://")) {
    throw new Error("Not a postgres URL");
  }

  const afterScheme = value.slice(value.indexOf("://") + 3).split(/[?/]/)[0] ?? "";
  const at = afterScheme.indexOf("@");
  const authority = decodeURIComponent(at === -1 ? afterScheme : afterScheme.slice(at + 1));
  const firstHost = authority.split(",")[0] ?? "";
  const singleHostUrl = authority.length === 0 ? value : value.replace(authority, firstHost);
  const sslmode = new URL(singleHostUrl).searchParams.get("sslmode");

  return {
    hosts: authority.split(",").map(hostnameOf),
    sslmode,
  };
}

function hostnameOf(entry: string): string {
  if (entry.startsWith("[")) {
    const end = entry.indexOf("]");
    return end === -1 ? entry : entry.slice(1, end);
  }

  const colon = entry.lastIndexOf(":");
  if (colon === -1) {
    return entry;
  }

  const port = entry.slice(colon + 1);
  if (!/^\d+$/.test(port)) {
    return entry;
  }

  return entry.slice(0, colon);
}
