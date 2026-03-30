# @atc/docs — Docusaurus Documentation Site

## Overview

A new `@atc/docs` package containing a Docusaurus v3 static site with ATC/aviation-themed branding. Serves existing repo documentation (specification, contributing guide, agent operating manual) as a browsable site, with room to grow into guides, tutorials, and API reference.

## Structure

```
packages/docs/
├── package.json          # @atc/docs, private
├── docusaurus.config.ts  # TypeScript config
├── sidebars.ts           # Sidebar navigation
├── tsconfig.json
├── src/
│   ├── css/
│   │   └── custom.css    # ATC aviation theme
│   └── pages/
│       └── index.tsx     # Custom landing page
├── docs/
│   ├── specification.md  # From repo docs/specification.md
│   ├── contributing.md   # From repo docs/contributing.md
│   ├── design-brief.md   # From repo docs/spec.md (renamed for clarity)
│   └── agent/
│       └── operating-manual.md  # From repo docs/agent/operating-manual.md
└── static/
    └── img/              # Logo, favicon
```

## Aviation Branding

### Color Palette

| Role        | Color     | Usage                       |
|-------------|-----------|-----------------------------|
| Background  | `#1a1a2e` | Primary dark background     |
| Surface     | `#16213e` | Cards, sidebar              |
| Accent      | `#00ff41` | Radar green, links, active  |
| Warning     | `#ffbf00` | Amber, callouts             |
| Text        | `#e0e0e0` | Body text                   |
| Heading     | `#ffffff` | Headings                    |

### Typography

- Headers: monospace font family (aviation instruments aesthetic)
- Body: clean sans-serif (system font stack)

### Landing Page

- Radar-sweep or control tower visual motif
- Concise project introduction
- Quick-links to key docs sections

### Navbar & Footer

- Navbar: "ATC Docs" title with radar/tower icon
- Footer: links to GitHub repo, specification, contributing guide

## Existing Docs Integration

Existing markdown files are copied into `packages/docs/docs/` with added Docusaurus frontmatter (title, sidebar_position, slug). Organized into sidebar sections:

1. **Getting Started** — project overview
2. **Specification** — specification.md (the formal spec)
3. **Contributing** — contributing.md
4. **Design Brief** — spec.md (original informal design notes)
5. **Agent Guide** — agent/operating-manual.md

## Package Configuration

- **Name:** `@atc/docs`
- **Private:** true (not published)
- **Scripts:**
  - `dev` — `docusaurus start`
  - `build` — `docusaurus build`
  - `serve` — `docusaurus serve`
  - `clear` — `docusaurus clear`
- **Dependencies:** `@docusaurus/core`, `@docusaurus/preset-classic`, `react`, `react-dom`
- **Dev dependencies:** `@docusaurus/module-type-aliases`, `@docusaurus/types`, `typescript`
- **Docusaurus version:** v3 (latest)

## Root Integration

- Add `docs:dev` and `docs:build` scripts to root `package.json` pointing at `pnpm --filter @atc/docs`

## Out of Scope

- Blog functionality (can be added later)
- Search (Docusaurus has built-in search that works out of the box)
- CI/CD deployment (separate concern)
- Custom Docusaurus plugins
