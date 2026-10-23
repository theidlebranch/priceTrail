# PriceTrail

An open, source-backed history of AI model API prices. The design is in [docs/architecture.md](docs/architecture.md). The order of work is in [docs/build-plan.md](docs/build-plan.md).

## Run it

Use Node 24 and pnpm 10.32.1.

```bash
pnpm install
cp .env.schema .env
```

Put your Neon Postgres URL in `.env` as `DATABASE_URL`. Then:

```bash
pnpm dev
pnpm db:ping
```

Open [http://localhost:3000](http://localhost:3000). The landing page is `src/app/page.tsx`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

`pnpm check` runs the same three commands as CI.
