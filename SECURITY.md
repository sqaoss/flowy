# Security Policy

We take the security of Flowy CLI seriously. Thank you for helping keep it and
its users safe.

## Supported versions

Flowy CLI is released continuously from `main` via semantic-release, and only
the **latest published version** of `@sqaoss/flowy` on npm is supported with
security fixes. Please upgrade before reporting:

```bash
npm i -g @sqaoss/flowy@latest
```

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through **GitHub Security Advisories**: open a private report at
<https://github.com/sqaoss/flowy/security/advisories/new>. This keeps the
discussion confidential until a fix is released, and lets us collaborate on a
patch with you directly. If you cannot use GitHub Security Advisories, open a
minimal public issue asking a maintainer to contact you privately — without
disclosing any vulnerability details.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof of concept.
- The Flowy CLI version (`flowy --version`) and how it was configured
  (self-hosted via `flowy serve`, or the hosted `flowy-ai.fly.dev` service).
- Any relevant logs or output, with **API keys and tokens redacted**.

## What to expect

- **Acknowledgement** within 3 business days.
- An initial assessment and severity triage within 7 business days.
- We aim to ship a fix for confirmed, high-severity issues in the latest
  release as quickly as practical, and will keep you updated on progress.
- With your permission, we'll credit you in the release notes once a fix is
  published. We support coordinated disclosure and ask that you give us a
  reasonable window to remediate before any public disclosure.

## Scope

This policy covers the `@sqaoss/flowy` CLI and the bundled self-hosted server
in this repository. The hosted service at `flowy-ai.fly.dev` is operated
separately; vulnerabilities specific to the hosted service can be reported
through the same channels above and will be routed accordingly.
