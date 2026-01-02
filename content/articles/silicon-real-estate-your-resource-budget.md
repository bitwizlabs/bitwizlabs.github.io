---
title: "Silicon Real Estate: Your Resource Budget"
date: 2025-12-31
updated: 2026-01-02
draft: false
description: "Understanding FPGA resource utilization - LUTs, registers, BRAM, DSPs, and why 94% utilization means your design won't close timing"
tags: ["FPGA", "resources", "utilization", "timing", "hardware"]
categories: ["articles"]
---

*Timing Series: Part 5 of 5*
*Previous: [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/)*

---

## Friday Afternoon

Friday afternoon. Timing met with 200 ps margin. I merged a teammate's "small" feature branch—an extra output mux, some debug registers, maybe 2000 LUTs.

Monday morning: 847 failing paths. Six-hour build times. Demo on Thursday.

I hadn't added logic. I'd crossed the congestion cliff.

```
Before merge:                    After merge:
LUT utilization: 89%             LUT utilization: 93%
WNS: +0.200 ns                   WNS: -0.847 ns
Build time: 1.5 hours            Build time: 6.2 hours
Failing paths: 0                 Failing paths: 847
```

The utilization report said I was fine. 93% fits. But the router disagreed. Every wire fought for routing tracks. Critical paths detoured through congested regions. Placement became a puzzle with no good solutions.

You need to read the reports that matter, recognize the patterns that predict trouble, and know when to optimize—before you hit the cliff, not after.

---

## Resource Smells

Experienced engineers recognize these patterns in utilization reports. They rarely write them down:

| Pattern | What It Means | Likely Problem |
|---------|---------------|----------------|
| **LUTs >> FFs** (e.g., 85% vs 25%) | Logic-heavy, under-pipelined | Long combinational paths, timing pressure |
| **FFs >> LUTs** (e.g., 20% vs 60%) | Over-pipelined or shift-register heavy | Probably fine, but check for wasted pipeline stages |
| **DSPs at 0% but LUTs high** | Multiplies in fabric | LUT explosion; force DSP inference |
| **BRAM at 100%, LUTs low** | Memory-bound design | Consider URAM, external memory, or algorithmic changes |
| **Build time doubles with 5% more logic** | Congestion cliff | You're at the edge; optimize or upsize device |
| **Same paths fail with different seeds** | Placement-sensitive design | Fragile timing; need headroom, not constraints |

When you see these patterns, don't wait for timing to fail. Act while you have options.

---

## What You're Actually Buying

An FPGA isn't a homogeneous sea of logic. It's a grid of heterogeneous resources arranged in columns:

```
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ CLB │ CLB │BRAM │ CLB │ DSP │ CLB │ CLB │BRAM │ CLB │ CLB │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ CLB │ CLB │BRAM │ CLB │ DSP │ CLB │ CLB │BRAM │ CLB │ CLB │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ CLB │ CLB │BRAM │ CLB │ DSP │ CLB │ CLB │BRAM │ CLB │ CLB │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
         │           │                    │
         └── BRAM    └── DSP              └── BRAM
             Column      Column               Column
```

CLBs (Configurable Logic Blocks) contain LUTs and registers. BRAM columns hold block RAM. DSP columns hold DSP48 slices. The resources aren't interchangeable, and their locations are fixed.

This matters because:

1. **DSPs are location-locked.** A multiply in your datapath must route to a DSP column. If your logic is on the far side of the device, that's a long wire.

2. **BRAMs cluster.** A memory-heavy design pulls logic toward BRAM columns. If you have two memory-heavy modules, they fight for the same columns.

3. **CLBs fill from the inside out.** High utilization means logic gets pushed to the edges, making routes longer.

The utilization percentage is a scalar. The reality is spatial. Two designs at 80% LUT can have completely different timing outcomes depending on how that 80% is distributed.

---

## LUTs: The Universal Soldier

A LUT (Look-Up Table) is a truth table in silicon. A 6-input LUT (LUT6) stores 64 bits: one for each combination of six inputs. Any combinational function of six or fewer inputs fits in one LUT.

```systemverilog
// This is one LUT
assign y = (a & b) | (c ^ d) | (e & ~f);

// But a 7-input function needs two LUTs:
assign y = a ? (b ? c : d) : (e ? f : g);  // 7 inputs = 2 LUTs
```

Modern FPGAs use fracturable LUTs. One LUT6 can function as two independent LUT5s sharing the same inputs, or one LUT6 with a single output. The tools handle this automatically, but it means LUT utilization isn't always intuitive. Sometimes adding logic costs nothing because it fits in the unused half of an existing LUT.

### LUTs as Memory

LUTs can also function as distributed RAM or shift registers:

**Distributed RAM**: Small, fast memories implemented in LUTs. A 64×1 RAM uses one LUT. Good for register files, small FIFOs, and CAMs.

**Shift Registers (SRL)**: A LUT configured as a 32-deep shift register. SRL32 uses one LUT for 32 bits of delay. No routing between stages. The shift happens inside the LUT.

```systemverilog
// Infers SRL32 - one LUT for 32 cycles of delay (1-bit wide)
logic [31:0] delay_line;  // 32-stage shift register, 1-bit wide
always_ff @(posedge clk)
    delay_line <= {delay_line[30:0], data_in};
assign data_out = delay_line[31];
```

**When to use SRL vs. BRAM:**

| Depth | Width | Recommendation |
|-------|-------|----------------|
| ≤ 32  | Any   | SRL (one LUT per bit) |
| 33-64 | Any   | Two SRLs cascaded |
| > 64  | > 8   | BRAM |
| > 64  | ≤ 8   | SRL cascade may still win |

The crossover depends on your LUT budget. If you're LUT-constrained, use BRAM earlier. If you're BRAM-constrained, cascade SRLs deeper.

---

## Registers: The "Free" Resource

Every LUT in a CLB has flip-flops attached. A Xilinx UltraScale CLB has 8 LUTs and 16 flip-flops. You get roughly 2 FFs per LUT, and they're often underutilized.

Look at that utilization report again:

```
| CLB LUTs       | 142847 | 152064|  93.94%    |
| CLB Registers  | 98234  | 304128|  32.30%    |
```

LUTs at 94%, registers at 32%. This is typical for logic-heavy designs. The registers are "free" in the sense that they're already there. Using more FFs doesn't cost LUTs.

This is why pipelining is cheap. Adding a register stage costs FFs, not LUTs. The logic between pipeline stages costs LUTs. When you pipeline a design:

```systemverilog
// Unpipelined: long combinational path
assign result = complex_function(a, b, c, d, e, f, g, h);

// Pipelined: same LUTs, more FFs, shorter paths
always_ff @(posedge clk) begin
    stage1 <= partial_function(a, b, c, d);
    stage2 <= partial_function(e, f, g, h);
    result <= combine(stage1, stage2);
end
```

The LUT count stays roughly the same. The FF count increases. Timing improves because each path is shorter.

**Register replication** is another "free" trick. When a register drives high fanout, the tools can duplicate it:

```systemverilog
// One register driving 500 loads - long routes, high delay
logic broadcast_reg;

// Tools replicate to reduce fanout - more FFs, shorter routes
(* max_fanout = 50 *) logic broadcast_reg;
```

The duplicate registers cost FFs, which you have in abundance. The reduced fanout improves timing.

The exception: control sets. Each unique combination of clock, enable, and reset creates a control set. Xilinx CLBs have limited control sets per slice. Excessive variety forces suboptimal packing and can make "free" registers expensive.

---

## BRAM: The Memory Question

Block RAM (BRAM) is dedicated memory silicon. A BRAM36 provides 36 Kb of storage, configurable in various aspect ratios:

| Configuration | Depth | Width | Ports |
|---------------|-------|-------|-------|
| 32K × 1       | 32768 | 1     | True dual-port |
| 16K × 2       | 16384 | 2     | True dual-port |
| 4K × 9        | 4096  | 9 (8+parity) | True dual-port |
| 2K × 18       | 2048  | 18    | True dual-port |
| 1K × 36       | 1024  | 36    | True dual-port |
| 512 × 72      | 512   | 72    | Simple dual-port* |

*Simple dual-port: one dedicated read port and one dedicated write port, versus true dual-port where both ports can read or write independently.

A BRAM36 can split into two independent BRAM18s. True dual-port means both ports can read or write independently on each clock edge.

### When BRAM, When Distributed?

| Memory Size | Recommendation | Reason |
|-------------|----------------|--------|
| < 64 bits total | Registers | Don't waste a BRAM |
| < 256 × 8 | Distributed RAM | LUT-based, fast, close to logic |
| ≥ 256 × 8 | BRAM | Dedicated silicon, no LUT cost |
| > 36 Kb | Cascade BRAMs | Or use UltraRAM if available |

**UltraRAM (URAM)**: On UltraScale+ devices, UltraRAM provides 288 Kb blocks, 8× larger than BRAM36. Use URAM for large buffers, deep FIFOs, or lookup tables where BRAM count would otherwise dominate. URAM is column-locked like BRAM, but with fewer columns, so placement matters even more.

The threshold isn't exact. If you're LUT-constrained, push more memories into BRAM. If you're BRAM-constrained, push small memories into distributed RAM.

**Common BRAM inference pattern:**

```systemverilog
// Infers BRAM with read-first behavior
logic [31:0] mem [0:1023];
logic [31:0] dout;

always_ff @(posedge clk) begin
    if (we)
        mem[addr] <= din;
    dout <= mem[addr];  // Read-first: reads old value on write
end
```

**Read-first vs. write-first matters.** Read-first reads the old value when writing to the same address. Write-first reads the new value. No-change holds the output. Get this wrong and your simulation won't match hardware.

---

## DSP: The Multiplier Trap

A DSP48E2 (UltraScale) is a hardened arithmetic unit:

```
        ┌─────────────────────────────────────┐
A ──────┤                                     │
        │   Pre-adder ─► Multiplier ─► ALU    ├──► P (48-bit)
B ──────┤       (D±A)      (27×18)    (+/−)   │
        │                                     │
C ──────┤────────────────────────────────────►│
D ──────┤                                     │
        └─────────────────────────────────────┘
```

One DSP48 can do:
- 27×18 signed multiply
- 48-bit add/subtract/accumulate
- Pre-add (D ± A) before multiply
- Pattern detect (for saturation, convergent rounding)

All in one cycle, with optional pipeline registers at each stage.

**The fabric alternative is expensive:**

| Operation | DSP Cost | Fabric Cost (LUTs) |
|-----------|----------|-------------------|
| 18×18 multiply | 1 DSP | ~300 LUTs |
| 27×18 multiply | 1 DSP | ~500 LUTs |
| 48-bit add | 0 (use ALU) | ~50 LUTs |
| MAC (multiply-accumulate) | 1 DSP | ~400 LUTs |

If you run out of DSPs and the tools spill multiplies to fabric, your LUT count explodes. A design that "fits" on paper suddenly consumes 40% more LUTs than expected.

**DSP inference pattern:**

```systemverilog
// Infers one DSP48 with internal pipeline
logic signed [26:0] a;
logic signed [17:0] b;
logic signed [47:0] p;

always_ff @(posedge clk) begin
    p <= a * b;  // Single-cycle, pipelined inside DSP
end
```

**Fabric multiply (avoid if possible):**

```systemverilog
// Forces fabric implementation - LUT explosion
(* use_dsp = "no" *) logic signed [47:0] p;
always_ff @(posedge clk) begin
    p <= a * b;
end
```

DSPs are column-locked. If your multipliers are in one module and the data sources are across the device, routing becomes the bottleneck. Place DSP-heavy logic near DSP columns, or let the tools floorplan for you.

---

## The Utilization Cliff

The relationship between utilization and timing is non-linear:

```
Timing Margin
     │
 100%│ ─────────────────────┐
     │                      │
  75%│                      └───────┐
     │                              │
  50%│                              └─────┐
     │                                    │
  25%│                                    └───────┐
     │                                            │
   0%│────────────────────────────────────────────└──
     └────────────────────────────────────────────────
       0%    50%    70%    85%    95%    100%
                    LUT Utilization
```

| Utilization | Experience |
|-------------|------------|
| < 70% | Comfortable. Timing closes easily. Incremental builds work. |
| 70-85% | Watch closely. Timing becomes sensitive to placement. Some builds fail. |
| 85-95% | Pain. Long compile times. Fragile timing. Incremental fails often. |
| > 95% | War. Hours of routing. Many failing paths. Design may not close. |

The cliff isn't exactly at these numbers. It depends on your device, clock frequency, and design structure. But the pattern holds: timing degrades gradually until you hit a threshold, then collapses.

**Why does this happen?**

1. **Routing congestion.** At high utilization, wires compete for routing tracks. The router takes longer paths, adding delay.

2. **Placement pressure.** The placer can't keep related logic together. Fanout routes get longer.

3. **Feedback loops.** Longer routes mean more delay. More delay means the placer tries different arrangements. Different arrangements may have even longer routes.

---

## When Congestion Hits Your Timing Report

The utilization report won't warn you. But the timing report will—if you know what to look for.

**Route-dominated paths:**

```
  Location             Delay type                Incr(ns)  Path(ns)
  -------------------------------------------------------------------
  SLICE_X47Y120        net (fanout=1, routed)     0.832     4.123
  SLICE_X89Y156        net (fanout=1, routed)     1.247     6.891
                                                  ^^^^^
                                          Route delay >> logic delay
```

When route delays dwarf logic delays on critical paths, you have congestion. A path shouldn't need 1.2 ns to route between two slices unless wires are fighting for tracks.

**Unexpected clock region crossings:**

```
report_timing -from [get_pins */clk] -to [get_pins */D] -max_paths 10

Path crosses clock regions: X2Y1 → X0Y3 → X2Y2 → X1Y4
```

If your critical path bounces across clock regions, the placer couldn't keep logic together. This is a spatial problem, not a constraint problem.

**Congestion reports:**

```tcl
# Vivado
report_design_analysis -congestion

Congestion Report
-----------------
Direction  Level  Regions
---------  -----  -------
North      5      X0Y2:X3Y2
East       4      X2Y1:X2Y4
Global     3      X1Y2:X2Y3   ← Critical paths likely route through here
```

```tcl
# Quartus
report_routing_utilization
# Look for regions with >80% horizontal or vertical track usage
```

**What congestion looks like in `report_timing`:**

```
Slack (VIOLATED): -0.847ns
  Source: processing/stage2/data_reg[15]/C
  Destination: processing/stage3/result_reg[15]/D

Data Path Delay:      4.847ns  (logic 1.234ns  route 3.613ns)
                                              ^^^^^^^^^^^^
                                              75% is routing!
```

When 70%+ of your path delay is routing, you've hit the wall. No constraint changes will help. You need fewer LUTs or a bigger device.

---

## Case Study: From 93% to 53%

Here's how I recovered from Monday morning's disaster. Starting point: 93% LUT, 847 failing paths, 6-hour builds.

**Step 1: Find the hogs**

```tcl
report_utilization -hierarchical -hierarchical_depth 3
```

```
+--------------------------------+--------+-------+
| Instance                       | LUTs   | Util% |
+--------------------------------+--------+-------+
| top                            | 142847 | 93.9% |
|   packet_buffer                | 28400  | 18.7% | ← Distributed RAM
|   processing/correlator        | 31200  | 20.5% | ← Fabric multiplies
|   debug_mux                    | 8900   | 5.9%  | ← Debug logic
|   addr_decode (×4 instances)   | 6200   | 4.1%  | ← Duplicated
+--------------------------------+--------+-------+
```

**Step 2: Apply targeted fixes**

| Change | LUTs Before | LUTs After | Saved |
|--------|-------------|------------|-------|
| Move packet_buffer from distributed RAM to BRAM | 28,400 | 2,100 | 26,300 |
| Replace fabric multiplies with DSP inference | 31,200 | 8,400 | 22,800 |
| Remove debug MUXes (gate behind `DEBUG` parameter) | 8,900 | 0 | 8,900 |
| Share address decoder across instances | 6,200 | 1,800 | 4,400 |

**Total saved: 62,400 LUTs**

**Step 3: Results**

```
Before:                          After:
LUT utilization: 93.9%           LUT utilization: 52.9%
WNS: -0.847 ns                   WNS: +0.892 ns
Build time: 6.2 hours            Build time: 38 minutes
Failing paths: 847               Failing paths: 0
```

I overshot. 53% gives room for the next feature. The packet buffer change was the biggest win—distributed RAM for a 4K×64 buffer was burning LUTs that BRAM handles for free.

**The multiplier fix:**

```systemverilog
// Before: fabric multiply (tools didn't infer DSP due to width mismatch)
logic [31:0] a, b;
logic [63:0] product;
assign product = a * b;  // 32×32 = 4 DSPs, but tools used fabric

// After: explicit DSP-friendly width
logic signed [26:0] a_dsp;
logic signed [17:0] b_dsp;
logic signed [47:0] product;
always_ff @(posedge clk)
    product <= a_dsp * b_dsp;  // Infers 1 DSP
```

The original code used 32-bit operands. The tools would need 4 DSPs for a full 32×32 multiply, so they fell back to fabric. Reducing to 27×18 (which fit my actual data range) gave me 1 DSP per multiply.

---

## Quick Wins Checklist

Before upsizing the device, try these:

**Memory:**
- [ ] Any distributed RAM > 256×8? Move to BRAM.
- [ ] Any BRAM < 256×8? Move to distributed RAM.
- [ ] Deep shift registers (>32)? Consider BRAM-based delay line.

**Arithmetic:**
- [ ] DSP utilization low but LUTs high? Check for fabric multiplies.
- [ ] Multiplier operands wider than 27×18? Can you reduce precision?
- [ ] Multiply chains? Restructure for DSP cascade.

**Debug/Development:**
- [ ] Debug MUXes and ILA still instantiated? Gate behind parameter.
- [ ] Assertion logic synthesized in? Use `translate_off`.
- [ ] Unused module outputs? Remove dead logic.

**Structure:**
- [ ] Same logic instantiated multiple times? Share it.
- [ ] Large one-hot state machines? Consider binary encoding.
- [ ] Wide muxes (>16:1)? Add pipeline stage or restructure.

**Timing:**
- [ ] Route-dominated critical paths? Need fewer LUTs, not constraints.
- [ ] Cross-clock-region paths? Consider floorplanning.
- [ ] High fanout nets? Add `max_fanout` attribute.

---

## Reading the Report

The utilization report has layers. The summary hides important details.

**Hierarchical breakdown:**

```tcl
report_utilization -hierarchical -hierarchical_depth 3
```

```
+--------------------------------+--------+-------+--------+
| Instance                       | LUTs   | FFs   | BRAM   |
+--------------------------------+--------+-------+--------+
| top                            | 142847 | 98234 | 289    |
|   eth_rx                       | 12340  | 8920  | 16     |
|   eth_tx                       | 11280  | 7650  | 12     |
|   processing                   | 98000  | 65000 | 240    |
|     stage1                     | 24500  | 16250 | 60     |
|     stage2                     | 24500  | 16250 | 60     |
|     stage3                     | 24500  | 16250 | 60     |
|     stage4                     | 24500  | 16250 | 60     |
+--------------------------------+--------+-------+--------+
```

Now you know where the resources went. If `processing` uses 69% of your LUTs, that's your optimization target.

**Primitives vs. logical resources:**

The report shows both. "LUTs" might mean:
- LUT6 (6-input LUT as logic)
- LUT5 (fractured half of LUT6)
- LUTRAM (LUT configured as distributed RAM)
- SRL (LUT configured as shift register)

Quartus equivalents:

```tcl
# Resource usage by entity
report_resource_usage -hierarchy

# ALM utilization detail
report_fitter_resource_usage -resource alm
```

---

## Estimating Before Synthesis

Before you write RTL, estimate whether it fits:

| Resource | Estimation Rule |
|----------|-----------------|
| **DSPs** | Count your multipliers. Each 18×18 or smaller = 1 DSP. Larger = 2-4 DSPs. |
| **BRAMs** | Sum memory bits ÷ 36,000 = BRAM36 count. Round up per memory. |
| **LUTs** | Everything else. State machines, muxes, comparators, control logic. |
| **FFs** | Pipeline depth × datapath width + control registers. Usually not the constraint. |

**Example: Ethernet processing pipeline**

```
4 × 18×18 multipliers        =  4 DSPs
2 × 4K×32 buffers            =  8 BRAM36 (each 4K×32 = 131Kb → 4 BRAMs; 131Kb ÷ 36Kb ≈ 4)
1 × 16K×8 lookup table       =  4 BRAM36
16-stage pipeline, 256-bit   = ~4000 FFs
Control + datapath logic     = ~15000 LUTs (estimate 3× your intuition)
```

Rule of thumb: **estimate LUTs at 3× your intuition**. You always forget the muxes, the debug logic, the edge cases, and the tool overhead.

---

## Common Resource Traps

| Trap | Symptom | Fix |
|------|---------|-----|
| **Inferred latch** | Unexpected LUT+FF combo, simulation mismatch | Complete all branches in combinational always blocks |
| **Distributed RAM instead of BRAM** | LUT explosion, works in sim | Check memory size, ensure proper read/write templates |
| **BRAM for tiny memory** | BRAM wasted on 16×8 | Use registers or distributed RAM for small memories |
| **Fabric multiply** | LUT explosion, DSPs unused | Remove `use_dsp = "no"`, check operand widths |
| **SRL where you need reset** | SRL doesn't reset, FF does | Use registers if reset required |
| **High fanout register** | Long routes, timing fail | Add `max_fanout` attribute, let tools replicate |
| **Uninitialized BRAM** | Works in sim, fails in hardware | Add explicit initialization or reset sequence |

**Inferred latch example:**

```systemverilog
// BAD: infers latch because else branch missing
always_comb begin
    if (sel)
        out = a;
    // else??? latch!
end

// GOOD: all branches covered
always_comb begin
    if (sel)
        out = a;
    else
        out = b;
end
```

---

## The Audit Checklist

Before synthesis:
- [ ] All memories sized and type decided (BRAM vs. distributed)
- [ ] Multiplier count known, DSP budget checked
- [ ] Pipeline depth estimated, register budget checked
- [ ] Total LUT estimate < 70% of target device

After synthesis:
- [ ] Check hierarchical utilization. Any surprise hogs?
- [ ] Check DSP and BRAM inference. Expected counts?
- [ ] Check for inferred latches (`report_drc` in Vivado)
- [ ] Check for fabric multipliers when DSPs expected

After implementation:
- [ ] Utilization under 85%? If not, consider larger device.
- [ ] Congestion report clean? If not, floorplan or refactor.
- [ ] Timing met with margin? If barely, you're fragile.

When to stop and refactor:
- LUT utilization > 90% and timing fails
- Build times exceed 4 hours
- Incremental builds fail repeatedly
- Same paths fail with different placement seeds

---

## Quick Reference

### Resource Summary

| Resource | What It Is | When to Use | Watch Out For |
|----------|------------|-------------|---------------|
| **LUT** | 6-input truth table | Logic, small muxes, distributed RAM, SRL | Utilization > 85% kills timing |
| **FF** | Flip-flop | Pipelining, registers | Usually abundant; use freely |
| **BRAM** | 36Kb memory block | Buffers > 256×8, lookup tables | Column-locked; overuse creates placement pressure |
| **DSP** | Multiply-accumulate | Any multiply ≥ 8×8 | Column-locked; fabric fallback is expensive |

### Utilization Thresholds

| LUT % | Status | Action |
|-------|--------|--------|
| < 70% | Comfortable | Continue normally |
| 70-85% | Caution | Monitor timing closely |
| 85-95% | Warning | Consider refactoring or larger device |
| > 95% | Critical | Design likely won't close; refactor required |

### Resource Smells (Quick Check)

| Pattern | Meaning |
|---------|---------|
| LUTs >> FFs | Under-pipelined, logic-heavy |
| DSPs = 0%, LUTs high | Fabric multiplies |
| BRAM = 100% | Memory-bound |
| Build time spikes | Congestion cliff |

### Estimation Formulas

```
BRAM count ≈ Σ (memory_bits / 36,000), rounded up per memory
DSP count  ≈ Σ multipliers (width ≤ 27×18 = 1 DSP each)
LUT count  ≈ 3 × your intuition
FF count   ≈ pipeline_depth × datapath_width + control
```

### Key Commands

**Vivado:**
```tcl
report_utilization -hierarchical
report_design_analysis -congestion
report_timing_summary -delay_type min_max
# Check for route-dominated paths:
report_timing -max_paths 10 -nworst 1 -input_pins
```

**Quartus:**
```tcl
report_resource_usage -hierarchy
report_fitter_resource_usage -resource alm
report_routing_utilization
report_ram_utilization
```

---

Resource budgeting isn't about fitting. It's about leaving room. Room for timing closure. Room for last-minute features. Room for the next engineer who inherits your design. A design at 70% utilization with margin is worth more than a design at 95% that barely closes.

The utilization report gives you one number. Reality is a spatial puzzle of competing resources, congested routes, and non-linear cliffs. Know what you're buying, know where the cliffs are, and leave room to maneuver.

*Next in the series: CDC—Two Flip-Flops Are Not Magic*

---

## Timing Series

1. [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/) — Why timing satisfies or breaks
2. [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/) — How to write constraints
3. [Understanding Timing Analysis](/articles/understanding-timing-analysis/) — How to read timing reports
4. [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/) — How to fix violations
5. **Silicon Real Estate: Your Resource Budget** — How to manage resources *(you are here)*

---

*← Previous: [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/)*
