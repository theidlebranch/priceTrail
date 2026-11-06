# Reviewers sign in with Google or GitHub

The review page can publish a price, so it needs a login. Reading the public site stays open, with no account. A reviewer signs in with Google or GitHub, and only accounts listed in the environment can open `/review`. The only role in this step is `reviewer`. A later member role can save a personal watchlist, and a later owner role can change the reviewer list. Company accounts are a later step.

A shared password was the smaller option, and it cannot tell two reviewers apart. Letting any Google or GitHub account in would let a stranger publish a price. Designing normal users, admins, superadmins, and company model lists before this page would add tables the review queue does not use yet.

An empty allowlist means nobody can review. `reviewed_by` stores the provider and the account id, so two people with the same display name stay distinct. This decision does not add a login library, a route lock, or a call to `publishPriceVersion()`.
