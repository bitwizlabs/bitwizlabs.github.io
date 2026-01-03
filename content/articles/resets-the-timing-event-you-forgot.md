---
title: "Resets: The Timing Event You Forgot"
date: 2026-01-03T20:01:00Z
draft: false
description: "Understanding reset timing - recovery, removal, async assert sync deassert, reset trees, and why sporadic startup failures haunt your design"
tags: ["FPGA", "resets", "timing", "recovery", "removal", "hardware"]
categories: ["articles"]
---

*Timing Series: Part 6 of 6*

*Previous: [CDC: Two Flip-Flops Are Not Magic](/articles/cdc-two-flip-flops-are-not-magic/)*

---

## The Flop That Didn't Reset

You're debugging a sporadic startup failure. The system initializes correctly nine times out of ten. On the tenth, one module starts in a corrupted state while everything else works fine. The state machine begins in an illegal state. The counter starts at 7 instead of 0. The FIFO pointers are misaligned.

You add more reset logic. You connect the reset to more flip-flops. The problem gets worse.

The issue isn't your reset signal. It's when your flip-flops release.

---

## Recovery and Removal: The Timing You Forgot

You already know setup and hold from Article 3. Reset has equivalent timing requirements, and most engineers ignore them.

**Recovery time:** How long before the clock edge the reset must deassert. This is the setup equivalent for reset.

**Removal time:** How long after the clock edge the reset must stay deasserted. This is the hold equivalent for reset.

```
                           +--- Clock Edge
                           |
                           v
        ===================+===================
                           |
                     <-----+----->
                   Recovery|Removal
                     Time  | Time
                           |
        -------------------+-------------------
                   Reset Must Be Stable
```

When reset deasserts too close to a clock edge, the flip-flop doesn't know whether to stay in reset or exit. The output is indeterminate. Some flip-flops exit reset. Some don't. Some exit to an undefined state.

Typical UltraScale values (speed grade dependent; check your device datasheet):

| Timing Check | Typical Value |
|--------------|---------------|
| Recovery     | 0.5 ns        |
| Removal      | 0.3 ns        |

These values are illustrative. Actual values range from ~0.1 ns to ~0.8 ns depending on device, speed grade, and primitive. Always check your specific timing model.

These numbers are small, but so is your timing margin. At 156 MHz with 2-3 ns of reset skew across a large device, you can easily violate removal on some flip-flops while meeting it on others.

That's your sporadic startup bug. Nine times out of ten, the reset deassertion lands safely away from the clock edge. On the tenth, it lands inside the recovery or removal window on some subset of your flip-flops.

---

## Why Async Assert, Sync Deassert

You've seen the reset synchronizer in Article 5. Now you know why it's structured the way it is.

**Asynchronous assert** means the flip-flop enters reset immediately, regardless of clock state. The clock might be stopped. It might be unstable during power-on. The reset still takes effect.

**Synchronous deassert** means the reset releases on a clock edge, guaranteeing that recovery and removal are met. The synchronizer chain ensures the deassertion happens cleanly, away from any clock edge ambiguity.

```systemverilog
module reset_sync (
    input  logic clk,
    input  logic async_rst_n,  // Active-low async reset
    output logic sync_rst_n    // Synchronized reset
);

    (* ASYNC_REG = "TRUE" *) logic [1:0] rst_reg;

    always_ff @(posedge clk or negedge async_rst_n) begin
        if (!async_rst_n)
            rst_reg <= 2'b00;  // Async assert: immediate
        else
            rst_reg <= {rst_reg[0], 1'b1};  // Sync deassert: on clock edge
    end

    assign sync_rst_n = rst_reg[1];

endmodule
```

The asynchronous sensitivity list (`or negedge async_rst_n`) means assertion doesn't wait for a clock. The synchronous path (`rst_reg <= {rst_reg[0], 1'b1}`) means deassertion propagates through two flip-flops, each sampling on clean clock edges.

When `async_rst_n` goes low, both flops are forced to 0 immediately. No sampling, no metastability. When it goes high, `rst_reg[0]` samples the asynchronous rising edge and may go metastable. The second stage samples `rst_reg[0]` one cycle later, after resolution. Two cycles of synchronous delay ensure the deassert is clean.

If you use synchronous-only reset (`always_ff @(posedge clk)` without the async term), reset assertion requires a running clock. During power-on, before the clock stabilizes, your flip-flops don't reset. Your design starts in garbage.

---

## The Reset Tree Problem

A large design has tens of thousands of flip-flops that need reset. That single `sync_rst_n` signal must fan out across the entire device.

```
            sync_rst_n
                 |
        +--------+--------+
        |        |        |
        v        v        v
      Buffer   Buffer   Buffer
        |        |        |
   +----+---+    |    +---+----+
   |    |   |    |    |   |    |
   v    v   v    v    v   v    v
  FF   FF  FF   FF   FF  FF   FF

       <---- 2-3 ns skew ---->
```

High fanout means long routing delays. Different flip-flops see the reset deassert at different times. A 50,000-flop design with reset skew of 2-3 ns across the device means some flip-flops exit reset 2-3 ns before others.

At 156 MHz (6.4 ns period), 3 ns of skew is almost half a clock cycle. One group of flip-flops exits reset on cycle N. Another group exits on cycle N+1. Your state machine starts in an illegal state because some state bits reset while others didn't.

The tools insert buffer trees to manage fanout, but they optimize for delay balance, not perfect synchronization. If you need tighter skew, you constrain it explicitly.

On Xilinx 7-series and UltraScale devices, the Global Set/Reset (GSR) provides device-wide reset during configuration. After configuration completes, GSR deasserts and its behavior varies by device. Use your own synchronized reset tree for runtime resets.

On multi-SLR devices, reset tree skew across SLR boundaries can exceed 5 ns. Consider per-SLR reset synchronizers if your design spans SLRs.

---

## Reset Domains and Sequencing

Every clock domain needs its own reset synchronizer. A single async reset entering multiple domains creates a race on deassertion.

```
                 async_rst_n
                      |
          +-----------+-----------+
          |           |           |
          v           v           v
    +----------+ +----------+ +----------+
    | reset_   | | reset_   | | reset_   |
    | sync_100 | | sync_156 | | sync_200 |
    +----+-----+ +----+-----+ +----+-----+
         |            |            |
    clk_100      clk_156      clk_200
    domain       domain       domain
```

Each synchronizer produces a reset aligned to its own clock. The domains exit reset on different cycles, but each exits cleanly relative to its own clock.

### Reset Sequencing

Some systems require ordered reset release. The PHY must initialize before the MAC. The memory controller must be ready before the DMA engine.

```systemverilog
module reset_sequencer (
    input  logic clk,
    input  logic async_rst_n,
    output logic rst_phy_n,
    output logic rst_mac_n,
    output logic rst_dma_n
);

    // Synchronized reset
    logic sync_rst_n;
    reset_sync u_sync (.clk, .async_rst_n, .sync_rst_n);

    // Sequence counter
    logic [7:0] count;

    always_ff @(posedge clk or negedge async_rst_n) begin
        if (!async_rst_n) begin
            count <= 8'd0;
        end else if (!sync_rst_n) begin
            count <= 8'd0;
        end else if (count != 8'd255) begin
            count <= count + 1;
        end
    end

    // Staged release
    assign rst_phy_n = (count >= 8'd10);   // PHY first
    assign rst_mac_n = (count >= 8'd50);   // MAC after PHY stable
    assign rst_dma_n = (count >= 8'd100);  // DMA after MAC ready

endmodule
```

The counter starts after the synchronized reset releases. Each downstream reset deasserts after a fixed delay, guaranteeing the sequence.

For more complex dependencies, use a state machine that waits for explicit "ready" signals from each module before releasing the next.

### PLL Lock as Reset Qualifier

If your design uses MMCMs or PLLs, don't release reset until the clock is stable.

```systemverilog
// Wait for PLL lock before releasing reset
wire pll_locked;
wire qualified_rst_n = async_rst_n && pll_locked;

reset_sync u_sync (
    .clk        (clk_from_pll),
    .async_rst_n(qualified_rst_n),
    .sync_rst_n (sync_rst_n)
);
```

The PLL asserts `locked` when its output is stable. Feeding `pll_locked` into the reset qualifier ensures your synchronized reset uses a stable clock.

---

## Constraining Reset Paths

Async reset inputs need special constraint handling. They're not synchronous data, so normal setup/hold doesn't apply. But recovery and removal still matter.

```tcl
# The reset input is asynchronous - no setup/hold timing
set_false_path -from [get_ports async_rst_n]
```

This removes the reset from setup/hold analysis. But it doesn't disable recovery/removal checks. The tools still verify that the reset synchronizer's internal paths meet recovery/removal.

For the synchronized reset output, normal timing applies. The reset tree from `sync_rst_n` to all destination flip-flops is timed like any other signal.

If reset skew matters, constrain it:

```tcl
# Limit reset skew across the tree
set_max_delay 2.0 -from [get_pins -hier *rst_reg_reg[1]/Q] \
                  -to [get_pins -hier */R]
```

This targets the R pin (synchronous reset on FDRE). For async clear (FDCE), target `*/CLR` instead. Your design may use either or both depending on how the tools infer your reset logic. Use `report_timing -from [get_pins -hier *rst_reg*/Q]` to identify the actual destination pins before constraining.

This bounds the maximum delay from the reset synchronizer output to the reset pins of destination flip-flops. Adjust the value based on your skew budget.

---

## Reading Recovery/Removal Reports

Vivado reports recovery and removal separately from setup and hold.

```tcl
# Recovery timing (reset deassertion before clock edge)
report_timing -delay_type recovery -max_paths 10

# Removal timing (reset stable after clock edge)
report_timing -delay_type removal -max_paths 10
```

A recovery report looks similar to a setup report:

```
Slack (MET) :             0.847ns  (required time - arrival time)
  Source:                 u_sync/rst_reg[1]/Q
  Destination:            u_fifo/wr_ptr_reg[0]/CLR (recovery check)
  Path Type:              Recovery (Max at Slow Process Corner)
  Requirement:            6.400ns
  Data Path Delay:        5.123ns
  Clock Path Skew:        -0.230ns
  Clock Uncertainty:      0.200ns
```

The slack is your margin. The tool computes it from the data path delay, clock arrival time, library recovery requirement, clock skew, and uncertainty. Positive slack means reset deasserts early enough for the flip-flop to exit cleanly. Negative slack means the deassertion lands too close to the clock edge.

**Failing recovery**: The flip-flop may fail to exit reset on the intended clock edge, remain in reset for an extra cycle, or become metastable and exit to an indeterminate state.

**Failing removal**: Exit from reset is corrupted. The flip-flop exits to an indeterminate state, not cleanly to 0 or 1.

Quartus reports these in the timing analyzer:

```tcl
# TimeQuest recovery/removal
report_timing -recovery -nworst 10
report_timing -removal -nworst 10
```

If you see recovery or removal violations, your reset is racing against the clock. Add more synchronizer stages, reduce reset fanout, or adjust constraints.

---

## Common Reset Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Synchronous-only reset | Reset ignored if clock stopped | Use async assert |
| Async reset without sync deassert | Sporadic startup failures | Add reset synchronizer |
| Same reset to multiple clock domains | Race on release | One synchronizer per domain |
| High-fanout reset without buffering | Recovery/removal violations | Let tools insert buffer tree, or constrain skew |
| Ignoring recovery/removal reports | "Works on my bench" failures | Check timing signoff |
| Reset glitch filter too aggressive | Legitimate resets ignored | Match filter width to reset spec |
| Releasing reset before PLL lock | Startup with unstable clock | Qualify reset with `pll_locked` |
| GSR for runtime reset | Reconfigures device or hits wrong flops | Use GSR only for power-on |

---

## The Reset Checklist

Before signoff:

- [ ] Every clock domain has its own reset synchronizer
- [ ] Reset uses async assert, sync deassert
- [ ] Recovery and removal timing clean (check reports explicitly)
- [ ] Reset skew within acceptable bounds for your application
- [ ] Reset sequencing matches hardware dependencies
- [ ] External reset inputs have glitch filtering if needed
- [ ] PLL/MMCM lock qualifies reset release
- [ ] Power-on reset handled separately from software reset

---

## Quick Reference

### Definitions

**Recovery time**: Minimum time reset must deassert *before* the clock edge (setup equivalent).

**Removal time**: Minimum time reset must stay deasserted *after* the clock edge (hold equivalent).

### Reset Synchronizer Template

```systemverilog
module reset_sync (
    input  logic clk,
    input  logic async_rst_n,
    output logic sync_rst_n
);
    (* ASYNC_REG = "TRUE" *) logic [1:0] rst_reg;

    always_ff @(posedge clk or negedge async_rst_n) begin
        if (!async_rst_n)
            rst_reg <= 2'b00;
        else
            rst_reg <= {rst_reg[0], 1'b1};
    end

    assign sync_rst_n = rst_reg[1];
endmodule
```

### Constraint Patterns

```tcl
# Async reset input - false path for setup/hold
set_false_path -from [get_ports async_rst_n]

# Check recovery/removal explicitly
report_timing -delay_type recovery -max_paths 10
report_timing -delay_type removal -max_paths 10

# Constrain reset tree skew if needed
set_max_delay 2.0 -from [get_pins -hier *rst_reg_reg[1]/Q] \
                  -to [get_pins -hier */R]
```

### Timing Report Commands

**Vivado:**
```tcl
report_timing -delay_type recovery -max_paths 10
report_timing -delay_type removal -max_paths 10
check_timing -verbose
```

**Quartus:**
```tcl
report_timing -recovery -nworst 10
report_timing -removal -nworst 10
check_timing
```

---

## The First Event

Reset is the first timing event your design experiences. Every assumption you make about initial state depends on reset completing correctly.

If flip-flops exit reset on different cycles, your carefully designed FSM starts in an illegal state. Your protocol handshake begins with stale values. Your counter starts at garbage instead of zero.

Article 5 showed you the reset synchronizer as a CDC structure. Now you know it's also a timing structure. The async assert handles a stopped clock. The sync deassert meets recovery and removal. The two-flop chain provides metastability protection on the deassertion edge.

Get reset wrong and "timing met" is meaningless. Your design passes all timing checks. Your constraints are complete. And on one boot in ten, it starts in garbage.

---

*Next in the series: FSMs: The State Machine Bugs You'll Ship*

---

## Timing Series

0. [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/) - Why timing satisfies or breaks
1. [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/) - How to write constraints
2. [Understanding Timing Analysis](/articles/understanding-timing-analysis/) - How to read timing reports
3. [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/) - How to fix violations
4. [Silicon Real Estate: Your Resource Budget](/articles/silicon-real-estate-your-resource-budget/) - How to manage resources
5. [CDC: Two Flip-Flops Are Not Magic](/articles/cdc-two-flip-flops-are-not-magic/) - How to cross clock domains
6. **Resets: The Timing Event You Forgot** - How to handle resets *(you are here)*
