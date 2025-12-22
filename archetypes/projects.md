---
title: "{{ replace .Name "-" " " | title }}"
slug: "{{ .Name }}"
date: {{ .Date }}
draft: true
summary: ""
tags: []
status: "In Progress"  # Shipped, In Progress, Archived
repo_url: ""

# Metrics (fill in what applies)
metrics:
  fmax_mhz: 0
  throughput: ""  # e.g., "25 Gbps" or "10 Mpps"
  resources_summary: ""  # e.g., "12K LUT, 8K FF, 24 BRAM"
---

## One-liner

<!-- Required: Single sentence describing what this is -->

## Why I built this

<!-- Required: The problem this solves, the motivation -->

## Spec and constraints

<!-- Required: Target device, interfaces, performance requirements -->

## Architecture

<!-- Required: High-level design, block diagrams -->

```
[ASCII diagram here]
```

## Key design decisions

<!-- Required: Trade-offs made, alternatives considered -->

## Verification plan

<!-- Required: How this was tested -->

## Results

<!-- Required: Actual performance, resource usage -->

---

<!-- Optional sections below -->

## Bugs I hit

<!-- Optional but recommended: Problems encountered and solutions -->

## How to use it

<!-- Optional: Usage instructions, integration notes -->

## What's next

<!-- Optional: Future improvements, roadmap -->

---

*Questions? [hello@bitwiz.io](mailto:hello@bitwiz.io)*
