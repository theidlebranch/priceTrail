# People hear about changes without signing in

A member has to open the site to learn that something happened. Accept and decline on a lab suggestion only stamp the row. The status and the note show on `/contributions` when that person comes back. The same is true of a new model, a price change, and a deprecation: the site stores the fact, and nobody is told.

We will tell them while they are signed out. Signing in to look is not the product. The channels are email, a Slack message, a Discord message, and a notification bubble on the site. The bubble is what they see after they come back. Email, Slack, and Discord are how they hear about it before that.

The first events are a lab suggestion accepted or declined (the person who suggested it, and the reviewer who decided it), a new model, a price change, and a deprecation. Later events of the same kind use the same path. Accept and decline keep writing only the decision. This work reads that row. It does not add a lab, a source, or a schedule, and it does not call `publishPriceVersion()`.

Step 42 stays one Slack webhook and one Discord webhook for the whole site, after a visit. Its two-hour limit was a way to keep that step small, and to leave personal email out of the MVP if it would take longer. That limit does not cancel this. Personal notifications are required even when they take longer. There is no user table and no stored email yet. An account id is `google:<id>` or `github:<id>`, which can mark a bubble, and cannot send mail. Collecting an address, and a Slack or Discord destination for one account, is part of the work.

The decision is [docs/build-plan.md](../build-plan.md) step 51.
