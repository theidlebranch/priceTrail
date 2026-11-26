import { accountCountLabel, type AccountListEntry } from "@/app/review/account-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AccountsPageHeader({ count }: { count?: number }) {
  return (
    <header>
      <h1 className="text-page-title font-semibold tracking-tight">Accounts</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        People who have signed in with Google or GitHub. A person who signed in before this list
        existed appears the next time they sign in.
      </p>
      {count !== undefined ? (
        <p className="mt-3 text-meta text-tertiary-foreground tabular-nums">{accountCountLabel(count)}</p>
      ) : null}
    </header>
  );
}

/**
 * The reviewer account list. The page already checked the allowlist.
 * This file only draws the rows.
 */
export function AccountList({ entries }: { entries: readonly AccountListEntry[] }) {
  return (
    <div>
      <AccountsPageHeader count={entries.length} />
      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No accounts are stored yet. A person appears here the next time they sign in.
        </p>
      ) : (
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.accountId}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell>{entry.lastSignedIn}</TableCell>
                  <TableCell>{entry.registered}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
