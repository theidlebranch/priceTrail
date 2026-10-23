/**
 * Check that `select 1` really came back as 1.
 *
 * The driver returns rows as plain objects. `ok` may be the number 1 or
 * the string "1", depending on the driver. Anything else means we did not
 * prove the database answered, so we throw instead of printing a success.
 */
export function assertSelectOne(rows: unknown): 1 {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("select 1 returned no rows");
  }

  const first: unknown = rows[0];
  if (first === null || typeof first !== "object") {
    throw new Error("select 1 returned an unexpected row");
  }

  const value = (first as Record<string, unknown>).ok;
  if (value !== 1 && value !== "1") {
    throw new Error("select 1 did not return 1");
  }

  return 1;
}
