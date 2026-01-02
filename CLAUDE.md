# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hugo static site for bitwiz.io, a technical blog focused on FPGA engineering, digital design, and timing closure.

## Development Commands

```bash
hugo server              # Start local dev server at localhost:1313
hugo                     # Build static site to /public
hugo --gc --minify       # Production build
```

No test suite, linting, or package management exists—this is a pure content + templates project.

## Architecture

**Content Structure:**
- `content/articles/` - Technical articles (FPGA timing series + future content)
- `content/projects/` - Project showcase pages
- `content/about.md`, `content/resources/` - Static pages
- `content/_index.md` - Homepage content

**Layout Customization:**
- `layouts/_default/index.html` - Homepage with featured projects and timing series (auto-numbered)
- `layouts/_default/list.html` - Article/project list template
- `layouts/partials/post-date.html` - Date display (supports `updated` field in frontmatter)
- `layouts/partials/extended_head.html` - SEO meta tags (noindex for tag pages)

**Styling:**
- `static/style.css` - Custom terminal theme (black bg, green accent, Fira Code font)
- Theme: `hugo-theme-terminal` (git submodule in `themes/`)

## Content Frontmatter

**Articles:**
```yaml
title: "Article Title"
date: 2025-12-28
draft: false
description: "SEO description"
tags: ["fpga", "timing"]
categories: ["series"]
updated: 2025-12-30  # Optional, shown as [Updated: date]
```

**Projects:**
```yaml
title: "Project Name"
status: "coming soon"
featured: true       # Appears on homepage
weight: 1           # Sort order
```

## Content Voice

- Direct, failure-first pedagogy (show what breaks before the fix)
- No fluff, no hedging
- ASCII diagrams for visual concepts
- SystemVerilog code examples
- Target audience: working FPGA engineers

## Timing Series Structure

Currently 5 published articles covering timing fundamentals through resource budgeting. Planned expansion includes CDC, Resets, and FSMs.

**Adding articles to the series:**
1. Create `content/articles/slug-name.md`
2. Use frontmatter: `categories: ["series"]` for auto-numbering
3. Update `updated:` field only for content changes, not formatting fixes

## Common Tasks

**Update article date:**
Change `updated:` in frontmatter, not `date:` (date is original publish date)

**Add homepage featured project:**
Set `featured: true` and `weight: N` in project frontmatter

**Cross-references between articles:**
Use relative links: `/articles/article-slug/`

## Key Implementation Details

- Homepage featured projects filter: `where .Site.RegularPages ".Params.featured" true`
- Timing series auto-numbers articles by ascending date order
- Theme is a git submodule—clone with `--recursive` or run `git submodule update --init --recursive`
- Deployment is automatic via GitHub Actions on push to `main`
- Use `noindex: true` in frontmatter to exclude pages from search engines

## Configuration

Main config in `hugo.toml`:
- baseURL: https://bitwiz.io/
- Theme color: green
- Syntax highlighting: Monokai
- Pagination: 10 items
