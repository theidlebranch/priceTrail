type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  centered?: boolean;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  centered = false,
}: SectionHeadingProps) {
  return (
    <div
      className={`mb-8 ${centered ? "mx-auto max-w-xl text-center" : "max-w-3xl"}`}
    >
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
