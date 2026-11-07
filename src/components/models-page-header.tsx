/**
 * The models page heading. The loading fallback and the loaded list both
 * use it, so the title and description cannot drift apart. The count is
 * the number of rows already loaded. It is omitted while that number is
 * still unknown.
 */
export function ModelsPageHeader({ count }: { count?: number }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-page-title font-semibold tracking-tight">Tracked models</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          These are the models PriceTrail follows.
        </p>
      </div>
      {count !== undefined ? (
        <p className="shrink-0 text-meta whitespace-nowrap text-tertiary-foreground tabular-nums">
          {modelCountLabel(count)}
        </p>
      ) : null}
    </header>
  );
}

function modelCountLabel(count: number): string {
  return count === 1 ? "1 model" : `${count} models`;
}
