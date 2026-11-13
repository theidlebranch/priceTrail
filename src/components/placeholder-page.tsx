export function PlaceholderPage({ title, sentence }: { title: string; sentence: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <h1 className="text-page-title font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{sentence}</p>
      <p className="mt-3 text-sm text-muted-foreground">This page is not built yet.</p>
    </section>
  );
}
