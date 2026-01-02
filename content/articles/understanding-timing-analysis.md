---
title: "Understanding Timing Analysis"
date: 2025-12-28
draft: false
description: "A deep dive into static timing analysis - understanding slack, path delays, clock skew, and why period minus data path is not your margin"
tags: ["FPGA", "timing", "STA", "hardware"]
categories: ["articles"]
---

*Timing Series: Part 2 of 4*

*Previous: [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/)*

---

## The Path You Can't Explain

You're staring at this:

```
Slack (VIOLATED) :        -0.247ns  (required time - arrival time)
  Source:                 tx_reg[7]/Q
  Destination:            fifo_wr_reg/D
  Path Group:             clk_156
  Path Type:              Setup (Max at Slow Process Corner)
  Requirement:            6.400ns
  Data Path Delay:        5.847ns  (logic 1.423ns (24.3%)  route 4.424ns (75.7%))
  Logic Levels:           4  (LUT6=3 CARRY4=1)
  Clock Path Skew:        -0.360ns (DCD - SCD)
  Clock Uncertainty:      0.400ns
```

Data path is 5.847 ns. Period is 6.4 ns. You subtract and get 0.553 ns. That number is meaningless as "margin" because it ignores clock-to-source, clock-to-dest, setup, and uncertainty.

You add a pipeline register. Timing gets worse.

You're not debugging. You're guessing. If you can't reproduce slack with the expanded path report, you're hallucinating.

---

## Before You Interpret Any Timing Report

For signoff-quality path debugging:

- [ ] Post-route timing (not synthesis, not post-placement)
- [ ] `check_timing -verbose` shows no relevant issues for the clocks/ports you're debugging
- [ ] `report_clock_interaction` matches reality (async domains marked async, related marked related)
- [ ] `report_methodology` passes (Vivado)
- [ ] All clocks constrained
- [ ] Unconstrained endpoints are documented exceptions, not accidents

If these aren't met, you might be chasing ghosts.

---

## The Key Rule You're Missing

**Data Path Delay is only one term inside Arrival Time.** Period minus Data Path is not slack.

Slack is computed from Arrival Time and Required Time. Both include clock network delays. Your intuitive subtraction skips those terms entirely.

---

## Misconstrained Critical Paths: Check Before You Debug

Sometimes the critical path is misconstrained—optimizing it won't improve real timing closure. The tool isn't wrong; your constraints are. It's often a CDC path that should be constrained differently (related-clock constraint if truly related, async clock groups if truly async, or false path only when the transfer is logically invalid to time)—not "optimized."

**Signs of a misconstrained path:**

- Source and destination are in different clock domains
- The path goes through a synchronizer but exceptions aren't set
- `report_clock_interaction` shows the domains as "Timed" when they should be "Async"
- The domains are actually related (same PLL/MMCM) but constraints don't model the relationship, so the tool assumes worst-case

Most CDC constraints target the crossing (domain A to domain B), not the internal reg-to-reg timing inside a synchronizer chain. You still time the synchronizer flops within their own clock domain like normal; you constrain the crossing so STA doesn't pretend it's a single-cycle synchronous transfer.

**The fix:** Don't throw false paths at it until you verify CDC is architecturally correct. Model related clocks explicitly when they're truly related. Add `set_clock_groups` or `set_false_path` only after confirming the synchronizer exists and is properly marked with `ASYNC_REG`.

**The trap:** Exceptions that are too broad. If your false path regex matches more than intended, you've silently disabled timing on real paths. Always verify with `report_exceptions -verbose`. If you can't explain exactly which paths your exception matches, you don't deserve that exception.

Check this first. Otherwise you'll optimize a path that doesn't matter.

---

## What Timing Analysis Actually Does

Static timing analysis doesn't simulate your design. It doesn't know what values your signals carry. STA checks the world your constraints describe. If your constraints lie, timing will confidently lie back.

STA builds a timing graph from every enabled path. False paths, disabled arcs, and clock group exclusions are skipped. Startpoints and endpoints include registers, I/O ports, RAM blocks, DSPs, and clock pins.

For every enabled path, the tool checks: does data arrive inside the capture window? Too late: setup violation. Too early: hold violation.

No vectors. No toggle coverage. Graph traversal and arithmetic.

---

## The Sampling Window

A flip-flop isn't a perfect sampler. It needs the input stable for a window around the clock edge.

```
                    ┌─── Capture Edge
                    │
                    ▼
        ════════════╪════════════
                    │
             ◄──────┼──────►
             Setup  │  Hold
             Time   │  Time
                    │
        ────────────┴────────────
              Stable Window
```

**Setup time (Tsu):** Data must arrive before the clock edge by at least this much.

**Hold time (Th):** Data must remain stable after the clock edge for at least this much.

A violation can produce a wrong sample or metastability. Either one can create behavior your RTL never modeled.

---

## Anatomy of a Timing Path

Every timing path has the same structure:

```
Launch       ┌──────────────┐         Capture
Clock ──────►│ Source Reg Q ├────────────────────────►│ Dest Reg D │◄────── Clock
Edge         └──────────────┘      Data Path          └────────────┘         Edge
   │                              (logic + routing)                            │
   │                                                                           │
   └───────────────────────────────────────────────────────────────────────────┘
                                  Clock Path
```

**Launch clock edge:** Your reference time (0 ns) in the report's timeframe. Phase-shifted, multicycle, or generated clocks shift this.

**Data path:** Clock-to-Q + combinational + routing. Depending on the report view, clock-to-Q may be shown separately from "Data Path Delay." Use `-path_type full_clock_expanded` to see the exact split. Don't assume the summary's "Data Path Delay" is the same thing across tools or report modes.

**Capture clock edge:** For single-cycle paths on the same clock, this is the next active edge. Multicycle paths, phase-shifted clocks, and DDR timing change this.

**Clock path:** The route from clock source to both registers, including skew between them.

---

## The Setup Slack Equation

Setup analysis checks whether data arrives early enough.

```
Setup Slack = Data Required Time - Data Arrival Time
```

Positive slack: passing. Negative slack: failing.

The tool computes:

```
Data Arrival Time:
    Launch clock edge (0 ns reference)
  + Clock network delay to source register
  + Clock-to-Q + combinational + routing

Data Required Time:
    Capture clock edge (Requirement: often period for same-clock single-cycle, but can be multicycle or phase-adjusted)
  + Clock network delay to destination register
  - Setup time (Tsu)
  - Clock uncertainty
```

**Note:** If the path is multicycle or between related clocks with phase offset, "Capture edge = period" is wrong. Treat Requirement as ground truth for the capture edge used for this path. If it isn't your clock period, you're not looking at a plain single-cycle path—stop and find out why before touching RTL.

---

## Solving the Mystery

Back to the opening report. Let's trace every number.

**Data Arrival Time:**

| Component | Value |
|-----------|-------|
| Launch edge | 0 ns |
| Clock to source reg | 1.280 ns |
| Data path delay | 5.847 ns |
| **Arrival** | **7.127 ns** |

**Data Required Time:**

| Component | Value |
|-----------|-------|
| Capture edge | 6.400 ns |
| Clock to dest reg | 0.920 ns |
| Setup time (Tsu) | 0.040 ns |
| Uncertainty | 0.400 ns |
| **Required** | **6.400 + 0.920 - 0.040 - 0.400 = 6.880 ns** |

**Slack:**

```
Slack = Required - Arrival = 6.880 - 7.127 = -0.247 ns  ✓
```

The math closes. In this example, "Data path delay" is the end-to-end data delay term the tool reports for this path. The clock-to-source/dest numbers (1.280 ns, 0.920 ns) come from `report_timing -path_type full_clock_expanded`, not the one-line summary.

Skew is the difference between clock arrivals: DCD (Destination Clock Delay) minus SCD (Source Clock Delay). In this example, it matches exactly: 0.920 - 1.280 = -0.360 ns.

**Negative skew hurts setup.** The destination clock arrives before the source clock, so the capture deadline comes while data is still traveling.

---

## Why STA Is Pessimistic

STA uses worst-case assumptions and may apply common-path adjustments in detailed reports. If your hand math is off by ~0.05–0.3 ns, it's usually CPPR (common path pessimism removal: reduces pessimism when launch and capture clocks share clock routing), jitter decomposition, or clock uncertainty modeling—not a mistake in your subtraction.

For exact tracing, use the detailed path report with `full_clock_expanded`. The summary view hides adjustment terms.

---

## Reading the Timing Report

Here's what each field tells you:

| Field | What It Tells You |
|-------|-------------------|
| Slack | How much you're failing (or passing) by |
| Source/Destination | The exact registers. Source shows Q pin (data startpoint), destination shows D pin |
| Path Group | Which clock domain. Filter reports with `-group` |
| Path Type | Setup or hold, which timing model |
| Requirement | Capture edge used for the check (often period, may be multicycle or phase-adjusted) |
| Data Path Delay | Total delay with logic/route split. The split guides your fix |
| Logic Levels | Combinational depth |
| Clock Path Skew | Negative hurts setup, positive helps. The summary value may not reflect all adjustments; use `-path_type full_clock_expanded` to see the effective terms |
| Clock Uncertainty | Jitter from your source, PLLs, and tool-applied margin. Can differ for setup vs hold |

Use `report_timing_summary` for signoff overview. Use `report_timing` for root cause.

---

## The Logic/Route Split

This path is 75.7% routing, 24.3% logic.

**Route-dominated (>60% routing):** Usually a physical problem. Registers are scattered, fanout is high, or logic is crossing clock regions.

**Logic-dominated (>60% logic):** RTL problem. Too many levels, complex expressions, long carry chains.

**Mixed:** Try retiming first, then look at placement.

Treat this as a diagnostic, not a verdict.

### Route-Dominated Fix Example

First try to keep the endpoints physically close (pblock, floorplan, or hierarchy). If fanout still spreads across the fabric, duplicate the launch register near sink clusters (register replication) so each copy drives local loads.

If source and dest land in different clock regions or SLRs, constrain the block or add a pipeline stage at the boundary.

### Logic-Dominated Fix Example

If your logic is a deep conditional chain or wide mux feeding an address/data bus, precompute selects one stage earlier or pipeline the select. Breaking the mux tree is usually more effective than sprinkling registers randomly.

---

## Clock Skew

The clock paths to source and destination aren't equal. The difference is clock skew.

```
Skew = Clock path to destination - Clock path to source
     = 0.920 - 1.280 = -0.360 ns
```

**Positive skew** helps setup (and hurts hold). Destination clock arrives late, giving data more time.

**Negative skew** hurts setup (and helps hold). Destination clock arrives early, shortening your window.

Why skew can be large:

- Clock region crossings
- Different clock buffer trees
- Generated or gated clocks
- Placement pulling endpoints into different regions

If your path only passes because of favorable skew, it's fragile. Skew changes when you add registers, duplicate logic, or floorplan.

---

## The Hold Slack Equation

Hold analysis asks: can the new data launched on this edge race through so fast it corrupts the capture happening on the same edge?

The destination register is capturing old data while the source register is launching new data. Both fire on the same clock edge. If new data arrives before the hold window expires, you've corrupted the capture.

```
Hold Slack = Data Arrival Time - Data Required Time
```

(Subtraction is reversed from setup.)

```
Data Arrival Time:
    Launch clock edge
  + Clock network delay to source register
  + Clock-to-Q + combinational + routing (minimum)

Data Required Time:
    Capture clock edge (same edge as launch)
  + Clock network delay to destination register
  + Hold time (Th)
  + Clock uncertainty (hold)
```

Hold uses minimum delays. Setup uses maximum. The tool runs both.

---

## What a Hold Violation Looks Like

```
Slack (VIOLATED) :        -0.087ns  (arrival time - required time)
  Source:                 fast_reg/Q
  Destination:            pipe_reg[0]/D
  Path Type:              Hold (Min at Fast Process Corner)
  Data Path Delay:        0.284ns  (logic 0.141ns  route 0.143ns)
  Clock Path Skew:        0.156ns (DCD - SCD)
```

Short data path. Fast corner. Positive skew (hurting hold). The data races through faster than the hold window.

---

## Why Hold Violations Appear After Routing

During synthesis, the tool estimates wire delays. After routing, short paths can be even shorter than estimated.

A path that "passed" hold with estimates can fail once real routing is extracted. Pre-route timing is directional. Post-route timing is signoff.

---

## Hold Fixes

When hold fails, you need to slow down the data path. Follow this order:

1. **Let the tool fix it first.** Run `phys_opt_design -hold_fix` (Vivado). The tool adds delay on the data path automatically. Re-check setup afterward—hold-fixing trades margin. If you're also close on setup, run hold-fix late in the flow.

2. **Add intentional delay locally.** Add a small, tool-friendly delay element on the data path and preserve it with `DONT_TOUCH` or `KEEP`. If you don't lock it down, the tool will optimize your "delay" away.

3. **For I/O paths, use IDELAY/ODELAY.** Programmable delay elements are designed for this.

If you're tight on both setup and hold, your architecture is wrong. No amount of delay insertion fixes a fundamental timing problem. Rethink the clock relationship or add a synchronizer.

---

## Timing Models

Silicon speed varies with process, voltage, and temperature. FPGA vendors collapse this into timing models.

| Timing Model | Conditions | What It Catches |
|--------------|------------|-----------------|
| Slow (Max delays) | Low voltage, hot, slow transistors | Setup violations |
| Fast (Min delays) | High voltage, cold, fast transistors | Hold violations |

**Setup fails at slow:** Logic is slow, data arrives late.

**Hold fails at fast:** Logic is fast, data arrives too early.

On modern FinFET nodes (16nm and below), temperature inversion means cold silicon can be slower than hot at low voltage. Xilinx timing models account for this internally.

---

## WNS vs TNS: Reading the Right Number

**WNS (Worst Negative Slack):** The single worst-failing path.

**TNS (Total Negative Slack):** Sum of all negative slacks.

| Pattern | Meaning | Action |
|---------|---------|--------|
| WNS small, TNS massive | Widespread problem | Architectural issue. Phys-opt won't save you |
| WNS large, TNS small | One monster path | Surgical fix: pipeline or restructure that path |
| Both small negative | Close to closing | Phys-opt may help |
| Both zero | Timing closed | Ship it |

Don't fixate on WNS alone. A design with one path at -0.5 ns is very different from 500 paths at -0.001 ns each.

---

## Why Your Fix Made It Worse

You added a pipeline register to break that 4-level path. Timing got worse.

### Reason 1: Fanout explosion

This is the #1 cause. Your new register has 47 loads because you put it at a convergence point.

Check fanout directly:

```tcl
report_high_fanout_nets -fanout_greater_than 20 -max_nets 10
```

Check timing from the new register:

```tcl
set paths [get_timing_paths -from [get_pins -hier *your_new_reg*/Q] -max_paths 20]
report_timing -of_objects $paths
```

If the new register's fanout paths are now critical, you moved the problem.

### Reason 2: You pipelined the wrong path

The path you fixed was one of ten with similar slack.

Check:

```tcl
report_timing -max_paths 50 -slack_lesser_than 0
```

Look at the distribution. If failing paths share a common source or destination, that's the real problem.

### Reason 3: Placement chaos

The new register landed far from the datapath.

Check: Open the placed design. Is the new register physically between source and destination?

### Reason 4: Clock skew shifted

The new register has different clock arrival.

Check: Compare Clock Path Skew before and after.

---

## Recovery and Removal: Async Reset Timing

Setup and hold apply to synchronous data. Async resets have their own checks.

**Recovery time:** How long before the clock edge the reset must deassert. (Like setup.)

**Removal time:** How long after the clock edge the reset must stay deasserted. (Like hold.)

If your async reset violates recovery or removal, the register output is undefined.

**The right approach:** Don't time async reset assertion. Synchronize deassertion in each clock domain using a reset synchronizer chain. Then time the synchronizer like normal logic.

**Spot-check that recovery/removal is being analyzed:** pick 3 known async-reset flops (one per domain if you have multiple) and run `report_timing` to their async pins (CLR, PRE, etc.). Confirm recovery/removal checks exist. Pin names vary by design.

If reset is generated synchronously inside the FPGA, constrain the generating logic normally.

---

## The Debug Workflow

When timing fails, follow this sequence:

1. **Confirm constraint coverage.** Run `check_timing -verbose`. Check `report_clock_interaction`. Fix any real issues before debugging paths.

2. **Confirm it's a real path.** Is this a CDC path missing exceptions?

3. **Identify scope.** Is it one path (small TNS) or widespread (large TNS)?

4. **Classify the failure.** Route-dominated or logic-dominated? Setup or hold? Which timing model?

5. **Choose your fix class:**
   - Route-dominated → Floorplan, reduce fanout, register duplication
   - Logic-dominated → Reduce levels, retime, restructure RTL
   - Hold → Use tool hold-fix first, then intentional delay
   - Skew-dependent → Don't trust it, fix the underlying margin

6. **Re-run and compare.** Check arrival time, required time, and skew deltas. Did your fix move the problem or solve it?

---

## The Reports You Must Run

### Vivado

```tcl
# Worst setup paths
report_timing -max_paths 10 -sort_by slack

# Worst hold paths
report_timing -delay_type min -max_paths 10 -sort_by slack

# All failing paths
report_timing -max_paths 100 -slack_lesser_than 0

# Signoff overview
report_timing_summary -report_unconstrained

# Constraint sanity
check_timing -verbose
report_methodology
report_clock_interaction

# Verify exceptions hit intended targets
report_exceptions -verbose

# Detailed path with full clock expansion for hand-checking
set path [lindex [get_timing_paths -from [get_pins -hier *tx_reg*/Q] -to [get_pins -hier *fifo_wr_reg*/D] -max_paths 1 -sort_by slack] 0]
report_timing -of_objects $path -path_type full_clock_expanded
```

### Quartus (TimeQuest)

Run Report Timing in the GUI. Copy the Tcl from the Command Info tab—Intel documents that the report includes the exact command used. This avoids version-specific flag issues.

For scripting, common patterns:

```tcl
report_timing -setup -nworst 10
report_timing -hold -nworst 10
report_clock_transfers
check_timing
```

Verify flags with `report_timing -long_help` in your version.

---

## Common Interpretation Mistakes

| Mistake | Why It's Wrong | What To Do |
|---------|----------------|------------|
| Subtracting data path from period | Ignores clock paths, setup, uncertainty | Use the full slack equation |
| Only checking WNS | TNS shows if problem is systemic | Check both |
| Ignoring the logic/route split | Route-dominated needs placement, not retiming | Use split to guide fix |
| Fixing only the worst path | Other paths with similar slack become critical | Fix clusters |
| Trusting synthesis timing | No real routing data | Wait for post-route |
| Debugging before checking CDC | Misconstrained paths waste time | Check `report_clock_interaction` first |
| Ignoring `report_exceptions` | Overly broad exceptions disable real paths | Verify exception coverage |
| Not constraining async resets | Recovery/removal goes unchecked | Synchronize and verify |

---

## The Feedback Loop

Timing analysis isn't a gate at the end. It's a feedback loop.

**After synthesis:** Rough estimates. Catch architectural disasters.

**After placement:** Delays are real but routing is estimated. Critical paths become visible.

**After routing:** Final timing. This is signoff.

**After optimization:** Phys-opt can fix minor violations. If you have widespread negative slack across many paths, go back to RTL.

Run timing early. Run it often. The later you find violations, the harder they are to fix.

---

## Quick Reference

### The Equations

```
Setup Slack = (Capture Edge + Clk to Dest - Tsu - Uncertainty)
            - (Launch Edge + Clk to Source + Clk-to-Q + Comb + Route)

Hold Slack  = (Launch Edge + Clk to Source + Clk-to-Q + Comb + Route min)
            - (Capture Edge + Clk to Dest + Th + Uncertainty_hold)
```

### Why Period Minus Data Path Fails

Let `Data_Path_Delay` = the value on the report's "Data Path Delay" line for that path.

```
Arrival  = Clk_to_Source + Data_Path_Delay  (you forgot Clk_to_Source)
Required = Capture_Edge(Requirement) + Clk_to_Dest - Tsu - Uncertainty  (not just Period)
```

### Logic/Route Diagnostic

- Route > 60%: Usually placement/fanout
- Logic > 60%: Usually RTL
- Mixed: Retime first, then placement

### Report Commands

`report_timing_summary` for signoff overview. `report_timing` for root cause.

### Debug Checklist

- [ ] Check `report_clock_interaction` first
- [ ] Check top 50 paths, not just top 1
- [ ] Check WNS and TNS
- [ ] Is it logic-dominated or route-dominated?
- [ ] What timing model is failing?
- [ ] Is clock skew helping or hurting?
- [ ] What's the fanout of source and destination?
- [ ] Is this a real path or a CDC path missing exceptions?

---

## The Contract, Enforced

[Article 1](/articles/constraints-the-contract-you-forgot-to-sign/) was about writing the contract: constraints that define your timing requirements.

This article is about enforcement: how the tool checks whether your design meets those requirements.

The constraints are the law. The timing report is the verdict. That -0.247 ns isn't a suggestion.

You can trace the math now. You can read the report and identify the bottleneck. Route-dominated? Fix placement. Logic-dominated? Fix RTL. Skew-dependent? Treat as fragile—placement changes can flip the skew. Big TNS? It's architectural.

That's the difference between debugging and guessing.

---

## Timing Series

0. [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/) — Why timing satisfies or breaks
1. [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/) — How to write constraints
2. **Understanding Timing Analysis** — How to read timing reports *(you are here)*
3. [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/) — How to fix violations
4. [Silicon Real Estate: Your Resource Budget](/articles/silicon-real-estate-your-resource-budget/) — How to manage resources
