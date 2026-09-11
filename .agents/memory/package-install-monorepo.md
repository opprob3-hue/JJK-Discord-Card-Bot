---
name: Monorepo package installation
description: Package-install callback defaults to the workspace root in this pnpm monorepo.
---

The package-install helper may invoke `pnpm add` at the workspace root and reject a dependency because of the workspace-root safety check. For a dependency that belongs to one package, use the package-scoped pnpm command with `--filter @workspace/<package>` after the helper cannot target a workspace package.

**Why:** Root installs can put runtime dependencies in the wrong package and fail the workspace's package-boundary rules.

**How to apply:** Keep runtime dependencies in the owning artifact's package.json and lockfile importer, not at the root.