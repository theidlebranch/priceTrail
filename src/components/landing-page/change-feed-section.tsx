"use client"

import { useState, type FormEvent } from "react"
import { Rss } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function ChangeFeedSection() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) {
      setMessage("Please enter a valid email address.")
      return
    }

    // Connect a real endpoint here when sign-up is implemented.
    setMessage("Sign-up isn't live yet. Please check back soon.")
  }

  return (
    <section className="border-b border-border bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <Card className="mx-auto max-w-2xl gap-0 rounded-md border-border bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="mb-4 inline-flex items-center gap-1.5 self-center rounded border border-border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground"><Rss className="size-3.5 text-primary" />Coming soon</div>
          <h2 className="mb-2 text-xl font-semibold tracking-tight sm:text-2xl">A change feed (RSS and JSON).</h2>
          <p className="mx-auto mb-6 max-w-lg text-sm leading-6 text-muted-foreground">Know the day a price changes, with proof attached.</p>
          <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <label htmlFor="follow-email" className="sr-only">Email address</label>
            <Input
              id="follow-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="min-w-0 font-mono text-sm"
            />
            <Button type="submit" className="shrink-0">Follow along</Button>
          </form>
          <p className="mt-3 min-h-4 font-mono text-xs text-foreground" role="status" aria-live="polite">{message}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">Used only to tell you when the feed launches. Unsubscribe any time.</p>
        </Card>
      </div>
    </section>
  )
}
