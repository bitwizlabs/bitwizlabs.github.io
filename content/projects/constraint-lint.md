---
title: "constraint-lint"
date: 2026-01-01
draft: false
description: "Your XDC file is code. Vivado doesn't lint it."
tags: ["FPGA", "timing", "constraints", "tooling", "open-source"]
categories: ["projects"]
status: "Coming Soon"
featured: true
weight: 1
---

## The Problem

Your XDC file is code. Vivado doesn't lint it.
```tcl
create_clock -name clk156 -period 6.400 [get_ports clk_156]
```

The port is `clk156`. The clock attaches to nothing. Vivado warns once. It disappears into 200k lines of logs.

Your constraint file says the clock exists. Your log has one warning: no valid objects matched. WNS is meaningless because the domain you thought you constrained doesn't exist. You find out in the lab.

---

## What constraint-lint Does

Lint for XDC/SDC. Runs in CI. Turns constraint warnings into hard failures.

```text
$ constraint-lint --dcp build/post_synth.dcp --xdc constraints/*.xdc

ERROR [zero_match] timing.xdc:12
  create_clock -name clk156 -period 6.400 [get_ports clk_156]

  Pattern: clk_156
  Matched: 0 ports
  Did you mean: clk156 (1 port)

ERROR [multicycle_hold] timing.xdc:47
  set_multicycle_path -setup 2 has no matching -hold 1

  Symptom: Hold violations at fast corner
  Fix:     Add: set_multicycle_path -hold 1 -from [...] -to [...]

WARNING [io_delay_range] timing.xdc:89
  set_input_delay -max without -min

  Risk: Hold timing unconstrained at fast corner

============================================================
2 error(s), 1 warning(s)
Exit code: 1
```

Input: XDC/SDC, optional DCP. Output: file:line diagnostics and fixes.

With a DCP, it verifies matches against the checkpoint netlist. Without one, it catches structural mistakes and suspicious patterns in the XDC.

Nonzero exit on errors. CI-friendly.

---

## Checks

| Check | What It Catches |
|-------|-----------------|
| **Zero-match** | Constraints that match nothing (silent no-ops) |
| **Clock attach** | Clocks not created or not attached (zero-match targets, wrong objects) |
| **Unclocked endpoints** | Endpoints not analyzed (missing clocks, bad propagation) |
| **Multicycle pairing** | `-setup N` without `-hold N-1` |
| **I/O delay completeness** | Missing `-min` or `-max` |
| **Exception scope** | False paths that over-match or under-match |

These are the signoff gates from [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/). That article is the spec. This tool is the enforcement.

---

## Non-Goals

This does not replace STA. It does not "fix timing." It catches constraint bugs that make STA results meaningless.

Use it alongside `check_timing`, not instead of it.

If you use `-quiet` or warnings aren't fatal, you will ship constraint bugs.

---

## Status

Spec is published. Implementation starting. Open source (MIT).

Starts with Vivado XDC semantics, plus generic SDC checks where they map cleanly.

GitHub link will appear here when the repo opens. First milestone: zero-match and clock attach checks.

Have a constraint bug that cost you a day? Send the XDC snippet, the warning you ignored, and what broke. Even 10 lines is enough if it reproduces the bug. Redact names, keep structure: [alexis@bitwiz.io](mailto:alexis@bitwiz.io)

---

*"Catch constraint bugs before timing lies to you."*
