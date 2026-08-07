# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest minor line receives security fixes.

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately via [GitHub Security Advisories](https://github.com/kotru21/bsuir-iis-api/security/advisories/new)
("Report a vulnerability" on the repository's Security tab).

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce or a proof of concept.
- Affected version(s) of `bsuir-iis-api`.

You can expect an initial response within **7 days**. If the report is accepted, a fix will be
released as a patch version and credited to you in the advisory (unless you prefer otherwise).

## Scope Notes

This package is a client SDK for the public BSUIR IIS API. In scope:

- Request/response handling flaws introduced by this SDK (header injection, cache poisoning,
  SSRF-style base URL bypasses, unsafe deserialization).
- Supply-chain issues in this repository's build and release pipeline.

Out of scope: vulnerabilities in the upstream BSUIR IIS API itself — report those to BSUIR.
