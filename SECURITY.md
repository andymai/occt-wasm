# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing the maintainer directly rather than opening a public issue.

## Scope

The occt-wasm build tooling (xtask, Dockerfile, scripts) is MIT/Apache-2.0 licensed.

The compiled WASM output inherits OCCT's LGPL-2.1 license and includes OCCT's C++ code. Security issues in OCCT itself should be reported to [OpenCascade](https://dev.opencascade.org/).

## Supply Chain

In response to the 2025–2026 wave of npm and GitHub Actions supply-chain attacks (Shai-Hulud worm, chalk/debug compromise, tj-actions tag retag, prt-scan AI campaign), the build is configured to fail closed on the patterns those attacks exploited:

| Defense | Where | What it blocks |
|---|---|---|
| All GitHub Actions pinned to commit SHA | `.github/workflows/*.yml` | Tag-retag attacks (tj-actions class). |
| OSV scan against `Cargo.lock` + both `package-lock.json` files (PRs report-only, main blocking) | `.github/workflows/osv-scan.yml` | Known-CVE versions in any ecosystem. |
| Dependabot cooldown (7d default / 14d major) across cargo, npm (root + `ts/`), github-actions | `.github/dependabot.yml` | Fresh malicious uploads. |

Direct install-time cooldown via `.npmrc` `min-release-age` is not enabled here: npm bundled with Node 24 is 11.6.1, which silently ignores the field (added in npm 11.10). Revisit once Node ships a newer npm.
