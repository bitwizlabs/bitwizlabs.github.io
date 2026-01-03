---
title: "CDC: Two Flip-Flops Are Not Magic"
date: 2026-01-02T05:19:00Z
draft: false
description: "Understanding clock domain crossing - synchronizers, metastability, pulse transfer, gray code, and why 2-flop sync only works for levels"
tags: ["FPGA", "CDC", "timing", "metastability", "hardware"]
categories: ["articles"]
---

*Timing Series: Part 5 of 6*

*Previous: [Silicon Real Estate: Your Resource Budget](/articles/silicon-real-estate-your-resource-budget/)*

---

## The Bug You Can't Reproduce

You're debugging a data corruption bug. It happens once every few hours under heavy load. Sometimes once a day. The data path looks fine. The control logic looks fine. You add ILA triggers. You wait. You catch it.

A control signal that pulses for one cycle is sometimes missed entirely. The path crosses clock domains. You have a 2-flop synchronizer.

"But I synchronized it," you say.

You synchronized the wrong thing. A 2-flop synchronizer handles level signals. You sent it a pulse.

---

## What Actually Happens at a Domain Boundary

When a signal crosses from one clock domain to another, the destination flip-flop samples at arbitrary points relative to the source. If it samples during a transition, the internal node voltage lands in the forbidden zone between 0 and 1.

This is metastability. The flip-flop will eventually resolve, but "eventually" might be longer than your clock period.

```
Voltage
   │
Voh├─────────────────────────────┐
   │                             │ ← Valid "1"
   │                             │
Vih├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─
   │      Metastable zone        │
Vil├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─
   │                             │
   │                             │ ← Valid "0"
Vol├─────────────────────────────┘
   └──────────────────────────────────────► Time
```

A 2-flop synchronizer works by giving the first flop time to resolve before the second flop samples. The resolution time is statistical. Given enough time, the probability of still being metastable drops exponentially.

**MTBF (Mean Time Between Failures)** quantifies this:

```
MTBF = e^(Tr / τ) / (f_src × f_dst × T0)
```

Where:
- `Tr` = resolution time available (roughly one clock period minus setup)
- `τ` = metastability time constant (~20-50 ps for modern FPGAs)
- `f_src`, `f_dst` = source and destination clock frequencies
- `T0` = metastability window (vendor-specific constant)

For a 100 MHz source and 156 MHz destination with typical UltraScale parameters (τ ≈ 30 ps, Tr ≈ 5 ns), the exponential term dominates: e^(5000/30) ≈ 10^72. Even with pessimistic constants, MTBF exceeds 10^50 years. Add a third flop and you're adding another factor of 10^72 to that already astronomical number. For safety-critical designs or very high clock frequencies, add a third synchronizer stage.

But this only works if the input is stable long enough for the synchronizer to sample it. A pulse that's shorter than the destination clock period might slip through entirely unsampled.

---

## The Five Crossing Types

Not all crossings are the same. The structure you need depends on what information you're transferring:

| Crossing Type | Information | Structure | Common Mistake |
|---------------|-------------|-----------|----------------|
| **Level** | Slowly-changing signal | 2-flop synchronizer | Sending pulses through it |
| **Pulse** | Single-cycle event | Toggle synchronizer | Direct 2-flop sync (loses pulses) |
| **Bus** | Multi-bit value | Gray code or async FIFO | Binary counter crossing (corruption) |
| **Handshake** | Command with acknowledgment | Req/ack protocol | No confirmation of receipt |
| **Reset** | Async assert, sync deassert | Reset synchronizer | Synchronous-only reset |

Each has different requirements. Each has a different failure mode when you use the wrong structure.

---

## Level Synchronization: The One Case 2-Flops Handle

A 2-flop synchronizer works for **level signals**: signals that change slowly relative to the destination clock and hold their value for multiple destination cycles.

```systemverilog
module sync_level #(
    parameter STAGES = 2
) (
    input  logic clk_dst,
    input  logic async_in,
    output logic sync_out
);

    (* ASYNC_REG = "TRUE" *) logic [STAGES-1:0] sync_reg;

    always_ff @(posedge clk_dst) begin
        sync_reg <= {sync_reg[STAGES-2:0], async_in};
    end

    assign sync_out = sync_reg[STAGES-1];

endmodule
```

**ASYNC_REG** tells the tool these flops are a synchronizer. The tool avoids retiming them and places them physically close to minimize the path between stages.

**When this works:**
- Configuration registers that change rarely
- Mode select signals
- Enable signals that assert and stay asserted

**When this fails:**
- Pulses shorter than destination period
- Signals that toggle every source cycle
- Any signal where missing a transition matters

The input must be stable for at least 2-3 destination clock cycles. If you can't guarantee that, you need a different structure.

---

## Pulse Synchronization: Where Everyone Fails First

A single-cycle pulse in a fast domain can be shorter than the destination clock period. The synchronizer might sample it as 0 on both edges. The pulse vanishes.

If the pulse lands right at a sampling edge, the synchronizer goes metastable. It will resolve to 0 or 1, but you can't predict which. Either you miss the pulse entirely, or you catch it once. You won't catch a single-cycle pulse twice (that only happens when a pulse spans more than one destination period).

```
Source (200 MHz):
         ┌───┐
pulse ───┘   └─────────────────────────

Destination (100 MHz):
      ↑           ↑           ↑
      │           │           │
   sample      sample      sample
      │           │           │
      ▼           ▼           ▼
   (miss)      (miss)      (miss)
```

**The fix: toggle synchronization.** Convert the pulse to a level change, synchronize the level, then detect the edge in the destination domain.

```systemverilog
module sync_pulse (
    input  logic clk_src,
    input  logic clk_dst,
    input  logic rst_src,
    input  logic rst_dst,
    input  logic pulse_in,
    output logic pulse_out
);

    // Source domain: toggle on each pulse
    logic toggle_src;
    always_ff @(posedge clk_src) begin
        if (rst_src)
            toggle_src <= 1'b0;
        else if (pulse_in)
            toggle_src <= ~toggle_src;
    end

    // Destination domain: synchronize the toggle
    (* ASYNC_REG = "TRUE" *) logic [1:0] sync_reg;
    logic toggle_dst_d;

    always_ff @(posedge clk_dst) begin
        if (rst_dst) begin
            sync_reg    <= 2'b0;
            toggle_dst_d <= 1'b0;
        end else begin
            sync_reg    <= {sync_reg[0], toggle_src};
            toggle_dst_d <= sync_reg[1];
        end
    end

    // Edge detect: pulse on any toggle change
    assign pulse_out = sync_reg[1] ^ toggle_dst_d;

endmodule
```

The toggle level changes slowly (holds for many cycles). The synchronizer captures it reliably. The XOR detects the edge in the destination domain.

**Limitation:** If the source sends pulses faster than the destination can process them (back-to-back every cycle), pulses merge. This structure handles pulses that are separated by at least 2-3 destination cycles.

---

## Bus Synchronization: Gray Code or FIFO

Multi-bit values can't be synchronized bit by bit. If you sample a binary counter mid-transition, you can read garbage:

```
Binary count:  0111 → 1000
               ^^^^
               All bits change simultaneously

If you sample during transition:
  bit 3: sees new value (1)
  bit 2: sees old value (1)
  bit 1: sees old value (1)
  bit 0: sees old value (1)

Sampled value: 1111 (garbage)
```

**Gray code** solves this for counters and pointers. Only one bit changes per increment:

```
Binary  Gray
0000    0000
0001    0001
0010    0011
0011    0010
0100    0110
0101    0111
0110    0101
0111    0100
1000    1100
```

```systemverilog
parameter int WIDTH = 8;  // Adjust for your pointer width

// Binary to Gray
function automatic logic [WIDTH-1:0] bin2gray(input logic [WIDTH-1:0] bin);
    return bin ^ (bin >> 1);
endfunction

// Gray to Binary
function automatic logic [WIDTH-1:0] gray2bin(input logic [WIDTH-1:0] gray);
    logic [WIDTH-1:0] bin;
    bin[WIDTH-1] = gray[WIDTH-1];
    for (int i = WIDTH-2; i >= 0; i--)
        bin[i] = bin[i+1] ^ gray[i];
    return bin;
endfunction
```

Because only one bit changes at a time, you can synchronize each bit of the Gray-coded bus through a standard 2-flop synchronizer. The MTBF of the crossing equals the MTBF of a single-bit synchronizer, regardless of bus width. For safety-critical designs or very high clock frequencies, add a third synchronizer stage.

**For arbitrary data**, use an async FIFO. The data stays in one clock domain (stored in BRAM or registers). Only the gray-coded pointers cross domains. Xilinx provides `xpm_fifo_async` and `xpm_cdc_*` macros that implement these patterns correctly.

---

## Handshake Synchronization: Request-Acknowledge

When you need confirmation that the destination received your data, use a handshake:

```
Source Domain          │  Destination Domain
                       │
  ┌──────────┐         │         ┌──────────┐
  │ Assert   │   req   │         │ Sample   │
  │ request  │─────────┼────────►│ req      │
  │          │         │         │          │
  │          │   ack   │         │ Assert   │
  │ Wait for │◄────────┼─────────│ ack      │
  │ ack      │         │         │          │
  │          │         │         │          │
  │ Deassert │         │         │ Wait for │
  │ req      │─────────┼────────►│ req low  │
  │          │         │         │          │
  │ Wait for │         │         │ Deassert │
  │ ack low  │◄────────┼─────────│ ack      │
  └──────────┘         │         └──────────┘
```

This is a 4-phase handshake. Each signal is a level that holds until acknowledged. Each crossing uses a 2-flop synchronizer.

```systemverilog
// Source side (simplified)
always_ff @(posedge clk_src) begin
    case (state_src)
        IDLE: if (send) begin
            data_src <= data_in;
            req      <= 1'b1;
            state_src <= WAIT_ACK;
        end
        WAIT_ACK: if (ack_sync) begin
            req       <= 1'b0;
            state_src <= WAIT_ACK_LOW;
        end
        WAIT_ACK_LOW: if (!ack_sync) begin
            state_src <= IDLE;
        end
    endcase
end
```

Handshakes are slow (4 synchronizer delays round-trip) but reliable. Use them for commands, configuration updates, or any crossing where you must confirm receipt.

---

## Reset Synchronization: The One You Forgot

Resets need special handling: **asynchronous assert, synchronous deassert**.

Asynchronous assert ensures the reset takes effect immediately, regardless of clock state. Synchronous deassert prevents recovery/removal timing violations at the flip-flops.

```systemverilog
module reset_sync (
    input  logic clk,
    input  logic async_rst_n,  // Active-low async reset
    output logic sync_rst_n    // Synchronized reset
);

    (* ASYNC_REG = "TRUE" *) logic [1:0] rst_reg;

    always_ff @(posedge clk or negedge async_rst_n) begin
        if (!async_rst_n)
            rst_reg <= 2'b00;  // Async assert
        else
            rst_reg <= {rst_reg[0], 1'b1};  // Sync deassert
    end

    assign sync_rst_n = rst_reg[1];

endmodule
```

Every clock domain needs its own reset synchronizer. A single async reset entering multiple domains without synchronization creates race conditions on deassertion.

Article 7 covers reset timing in depth. For now: one reset synchronizer per domain, async assert, sync deassert.

---

## Constraining CDC Paths

Article 2 introduced `set_clock_groups` and `set_false_path`. Here's how to apply them correctly for CDC.

### Clock Groups for Truly Asynchronous Domains

```tcl
set_clock_groups -asynchronous -group {clk_100} -group {clk_156}
```

This removes all timing paths between domains in both directions. Use it only when you've verified that proper CDC structures exist for every crossing.

### False Path to First Synchronizer Stage

More surgical: constrain only the synchronizer input.

```tcl
# Target first stage of synchronizers by ASYNC_REG property
set_false_path -to [get_cells -hier -filter {ASYNC_REG == TRUE}]
```

This disables timing to the synchronizer input (where metastability is expected) but still times paths within the destination domain.

**Do not false-path to later stages or the entire domain.** Only the first stage is allowed to go metastable by design.

### Verify Your Exceptions

```tcl
report_exceptions -verbose
```

Check that your constraints match only intended targets. An over-broad regex can silently disable timing on real paths.

---

## CDC Verification: Trust But Verify

Run CDC analysis before signoff.

**Vivado:**
```tcl
report_cdc -details
report_clock_interaction
```

**Quartus:**
Use the CDC Viewer in Timing Analyzer for detailed analysis.

**What to look for:**
- Paths flagged as "unsafe" with no synchronizer
- Multi-bit buses crossing without gray code or FIFO
- ASYNC_REG not applied to synchronizer flops
- Single-flop synchronizers (should be 2+)

**False positives exist.** A path might be safe due to architectural constraints the tool doesn't understand. Document these explicitly.

---

## Common CDC Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Pulse through 2-flop sync | Pulses lost or duplicated | Use toggle synchronizer |
| Binary counter crossing | Corrupted counts, sporadic errors | Gray-code the pointer |
| No ASYNC_REG attribute | Synchronizer stages separated by placer | Add `(* ASYNC_REG = "TRUE" *)` |
| Single-flop synchronizer | Metastability propagates | Always use 2+ stages |
| False-path entire domain | Real paths untimed | Target first sync stage only |
| Reset without sync | Flip-flops exit reset on different cycles | One reset synchronizer per domain |
| Fast-to-slow pulse | Pulse shorter than destination period | Toggle sync or handshake |
| Over-broad exception regex | Silent timing holes | Verify with `report_exceptions` |

---

## Quick Reference

### Crossing Type Decision Table

| Input Signal | Changes How Often? | Need Confirmation? | Use This |
|--------------|-------------------|-------------------|----------|
| Level (config, mode) | Rarely | No | 2-flop sync |
| Single-cycle pulse | Per event | No | Toggle sync |
| Single-cycle pulse | Per event | Yes | Handshake |
| Counter/pointer | Every cycle | No | Gray code + 2-flop sync |
| Arbitrary data stream | Every cycle | No | Async FIFO |
| Reset | Rarely | No | Reset synchronizer |

### MTBF Rule of Thumb

2-flop synchronizer MTBF > 100 years for typical FPGA designs at ≤200 MHz. Add a third flop if your application demands more (safety-critical, very high frequencies).

### Constraint Patterns

```tcl
# Async clock groups (removes all paths between groups)
set_clock_groups -asynchronous -group {clk_a} -group {clk_b}

# False path to sync first stage only
set_false_path -to [get_cells -hier -filter {ASYNC_REG == TRUE}]

# Verify exception coverage
report_exceptions -verbose
```

### Verification Commands

**Vivado:**
```tcl
report_cdc -details
report_clock_interaction
check_timing -verbose
```

**Quartus:**
```tcl
report_clocks
check_timing
# Use CDC Viewer in GUI for detailed analysis
```

### Vendor CDC Macros

Xilinx provides `xpm_cdc_*` macros in the XPM library:
- `xpm_cdc_single` - Single-bit level sync
- `xpm_cdc_array_single` - Multi-bit level sync (use with caution)
- `xpm_cdc_gray` - Gray-coded bus sync
- `xpm_cdc_handshake` - Full handshake with data
- `xpm_cdc_pulse` - Pulse transfer
- `xpm_cdc_async_rst` - Reset synchronizer

These are pre-verified, correctly constrained, and portable. Use them.

---

## The Contract, Revisited

Article 2 showed you how to constrain CDC paths. This article shows you what to build first.

CDC isn't about flip-flops. It's about understanding what information you're transferring and choosing a structure that preserves that information despite asynchronous sampling.

Two flip-flops handle exactly one case: a slowly-changing level signal. For pulses, use toggle. For buses, use gray code or FIFO. For confirmation, use handshake. For reset, use async-assert sync-deassert.

The constraint tells the tool what you've built. It doesn't make CDC safe. The structure does.

If you can't name the crossing type and the structure that handles it, you don't have CDC. You have a bug waiting to happen.

---

## Timing Series

0. [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/) - Why timing satisfies or breaks
1. [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/) - How to write constraints
2. [Understanding Timing Analysis](/articles/understanding-timing-analysis/) - How to read timing reports
3. [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/) - How to fix violations
4. [Silicon Real Estate: Your Resource Budget](/articles/silicon-real-estate-your-resource-budget/) - How to manage resources
5. **CDC: Two Flip-Flops Are Not Magic** - How to cross clock domains *(you are here)*
6. [Resets: The Timing Event You Forgot](/articles/resets-the-timing-event-you-forgot/) - How to handle resets
