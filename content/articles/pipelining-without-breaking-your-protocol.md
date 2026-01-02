---
title: "Pipelining Without Breaking Your Protocol"
date: 2025-12-30
updated: 2026-01-02
draft: false
description: "Understanding how to add pipeline registers without breaking valid/ready handshakes - skid buffers, register slices, and protocol-correct timing fixes"
tags: ["FPGA", "pipelining", "timing", "protocols", "hardware"]
categories: ["articles"]
---

*Timing Series: Part 3 of 5*

*Previous: [Understanding Timing Analysis](/articles/understanding-timing-analysis/)*

---

## The Register That Broke Everything

You added a pipeline register to fix timing. The path closed. The simulation failed.

```systemverilog
// Before: timing violation, functionally correct
assign data_out = transform(data_in);
assign valid_out = valid_in;

// After: timing clean, protocol broken
always_ff @(posedge clk) data_out <= transform(data_in);
assign valid_out = valid_in;  // Still combinational
```

You pipelined `data_out` but not `valid_out`. For one cycle, `valid_out` asserts while `data_out` holds stale data. Downstream captures garbage.

If you registered data, register valid in the same `always_ff`:

```systemverilog
// Fixed: valid and data move together
always_ff @(posedge clk) begin
    if (rst) begin
        valid_out <= 1'b0;
    end else begin
        valid_out <= valid_in;
        data_out  <= transform(data_in);
    end
end
```

One cycle mismatch equals one beat of garbage. The other half of "pipelining broke my design" tickets? Backpressure. If you ignore it, you lose data.

---

## Two Problems, Two Solutions

Pipelining a valid/ready interface requires solving two distinct problems:

1. **Forward path timing**: Break the combinational path from input to output (add registers)
2. **Backpressure handling**: Don't lose data when downstream stalls (add storage)

These are complementary, not alternatives. A bypass skid buffer handles backpressure but doesn't break timing. A naive register breaks timing but loses data under backpressure. A proper register slice does both.

---

## The Handshake Contract

Every streaming interface you use runs on valid/ready. AXI-Stream just put a logo on it.

**A transfer occurs when valid AND ready are both high on the same clock edge.**

```
         ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐
clk      │   │   │   │   │   │   │   │   │   │   │   │
      ───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───
              _______________
valid    ____/               \___________________________

                      _______
ready    ____________/       \___________________________

data     ----<  A  ><  B  ><  C  >-----------------------
                          ^
                          └── Transfer occurs here (B captured)
```

`A` is presented but not transferred (ready low). `B` is presented and transferred (both high). `C` never has valid asserted.

The producer controls `valid` and `data`. The consumer controls `ready`. Neither knows the other's next-cycle behavior. This is where pipelining goes to die:

**You cannot add latency to `valid` without adding the same latency to `data`.**

**You cannot add latency to `ready` without storage for the data already in flight.**

And the invariant that protocol specs bury in fine print:

**When valid is high and ready is low, the source must hold valid and data stable until the transfer completes.**

Every pipelining strategy depends on this. Violate it and nothing works. Every slice and FIFO in this article assumes the upstream obeys "hold stable while stalled." If it doesn't, your protocol is already broken-no amount of buffering will save you.

---

## The Happy Path: When Stalls Don't Exist

Before the complexity, here's the simplest correct pipeline stage:

```systemverilog
// Simplest correct pipeline stage
// ONLY works when downstream NEVER stalls (ready always high)
always_ff @(posedge clk) begin
    if (rst) begin
        valid_out <= 1'b0;
    end else begin
        valid_out <= valid_in;
        data_out  <= data_in;
    end
end

assign ready_out = 1'b1;  // Always accept
```

This works when `ready_in` is always high. Internal transform stages where you control both ends. Straight pipelines with no backpressure. Simple and correct.

The moment downstream can stall, everything changes.

When `ready_in` goes low while `valid_out` is high, you must hold `data_out` stable. But this register updates unconditionally every cycle. It overwrites data the downstream hasn't accepted yet.

That's where all the complexity comes from: storage for data that's been sent but not yet received.

---

## The Forward Path: The Bug Everyone Writes

Here's the broken register everyone writes first:

```systemverilog
// BROKEN: updates unconditionally, violates protocol
// Signal naming: *_upstream = toward source, *_downstream = toward sink
always_ff @(posedge clk) begin
    if (rst) begin
        valid_downstream <= 1'b0;
    end else begin
        valid_downstream <= valid_upstream;
        data_downstream  <= data_upstream;
    end
end
assign ready_upstream = ready_downstream;
```

This updates `data_downstream` every cycle, even when stalled. When `ready_downstream` is low and `valid_downstream` is high, you must hold `data_downstream` stable. You didn't. You overwrote it with whatever garbage `data_upstream` had next.

The fix: gate updates on "output can accept":

```systemverilog
// CORRECT: single-entry register slice
wire accept = ready_downstream || !valid_downstream;

always_ff @(posedge clk) begin
    if (rst) begin
        valid_downstream <= 1'b0;
    end else if (accept) begin
        valid_downstream <= valid_upstream;
        if (valid_upstream) data_downstream <= data_upstream;
    end
end

assign ready_upstream = accept;
```

This is a single-entry slice. It breaks forward timing and handles backpressure correctly. But `ready_upstream` is still combinational-chain ten of these and `ready` becomes your critical path.

---

## The Concrete Example: CRC Calculator

You have a CRC calculator with 4 LUT levels. Timing fails by -0.3 ns on the path from input to CRC output.

You add a pipeline register after LUT level 2:

```systemverilog
// Stage 1: first half of CRC calculation
always_ff @(posedge clk) begin
    crc_partial <= crc_stage1(data_in);
end

// Stage 2: second half
always_ff @(posedge clk) begin
    crc_out <= crc_stage2(crc_partial);
end
```

Timing closes. You ship. Production reports: every other packet has a bad CRC.

The problem: `valid_in` still propagates combinationally while `data_in` now takes two cycles. When `valid_out` asserts, it's pointing at data from two cycles ago-but the CRC reflects only one cycle of delay.

```
         ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐
clk      │   │   │   │   │   │   │   │   │   │
      ───┘   └───┘   └───┘   └───┘   └───┘   └───

valid_in ─────────┐ A ┌───┐ B ┌───┐ C ┌─────────
                      │       │       │
valid_out ────────────│───────│───────│───────── (still combinational!)
                      │       │       │
data_out  ────────────┤partial│partial│─────────
                      │   A   │   B   │
crc_out   ────────────┴───────┴───────┴───────── (2-cycle latency)
                          ↑
                          └── valid_out points here, but CRC is for PREVIOUS beat
```

**The fix:** Pipeline `valid` with the same latency as the data path:

```systemverilog
// Valid pipeline matches data pipeline depth
logic valid_d1, valid_d2;

always_ff @(posedge clk) begin
    if (rst) begin
        valid_d1 <= 1'b0;
        valid_d2 <= 1'b0;
    end else begin
        valid_d1 <= valid_in;
        valid_d2 <= valid_d1;
    end
end

assign valid_out = valid_d2;  // Now aligned with crc_out
```

Every signal must have the same pipeline depth. Valid, data, CRC, and any sidebands. No exceptions.

---

## The Backward Path: Why Registering Ready Breaks

You can't just register `ready` without storage:

```systemverilog
// BROKEN: ready is pipelined without storage
always_ff @(posedge clk) begin
    ready_out <= ready_in;  // One cycle late
end
```

When downstream deasserts `ready`, upstream doesn't see it until one cycle later. During that cycle, upstream sends data that has nowhere to go:

```
         ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐
clk      │   │   │   │   │   │   │   │   │   │
      ───┘   └───┘   └───┘   └───┘   └───┘   └───
          _______________________
valid_in /                       \___________
              _______________
ready_in ____/               \___________________ <- Deasserts here
                      _______
ready_out ___________/       \___________________ <- Upstream sees it late
                          ^
                          └── Data sent here is lost (no storage)
```

Registering ready is fine *if* you add storage for the in-flight beat. That's what a skid buffer provides.

---

## Which Structure Do I Need?

Before diving into implementations, here's how to choose:

```
Does downstream ever stall (ready goes low)?
│
├─ No  → Simple registered stage (no storage needed)
│        Use "The Happy Path" code above
│
└─ Yes → Do you need to break FORWARD timing (valid/data path)?
         │
         ├─ No  → Bypass skid buffer
         │        Handles backpressure only
         │        Forward path is still combinational
         │
         └─ Yes → Do you need to break BACKWARD timing (ready path)?
                  │
                  ├─ No  → Single-entry register slice
                  │        The "accept = ready || !valid" pattern
                  │        Ready is still combinational
                  │
                  └─ Yes → 2-entry FIFO or vendor register slice
                           Fully registered both directions
                           Use this or the vendor IP
```

Most production designs end up at the bottom: 2-entry FIFO or vendor IP. But knowing the progression helps you understand why.

---

## Bypass Skid Buffer: Backpressure Without Timing Fix

A bypass skid buffer catches the beat in flight when backpressure arrives late. It does NOT break the forward timing path-data passes through combinationally when the buffer is empty.

```systemverilog
module bypass_skid #(
    parameter WIDTH = 32
) (
    input  logic             clk,
    input  logic             rst,
    input  logic             valid_in,
    output logic             ready_out,
    input  logic [WIDTH-1:0] data_in,
    output logic             valid_out,
    input  logic             ready_in,
    output logic [WIDTH-1:0] data_out
);

    logic             buf_valid;
    logic [WIDTH-1:0] buf_data;

    // COMBINATIONAL forward path when buffer empty
    assign valid_out = buf_valid || valid_in;
    assign data_out  = buf_valid ? buf_data : data_in;

    // Ready when buffer is empty
    assign ready_out = !buf_valid;

    always_ff @(posedge clk) begin
        if (rst) begin
            buf_valid <= 1'b0;
        end else if (buf_valid) begin
            // Buffer full: drain when downstream ready
            if (ready_in) buf_valid <= 1'b0;
        end else begin
            // Buffer empty: catch if downstream stalls
            if (valid_in && !ready_in) begin
                buf_valid <= 1'b1;
                buf_data  <= data_in;
            end
        end
    end

endmodule
```

**What this does**: Catches one beat when backpressure arrives, then stalls upstream until the buffer drains. This version is intentionally conservative: once it captures one beat, it deasserts `ready_out` until that beat is fully drained. If the upstream violates "hold stable while stalled," this skid will faithfully buffer garbage.

**What this does NOT do**: Break the forward timing path. If `data_in` has negative slack, `data_out` still has negative slack.

**Throughput**: If `ready_in` pulses every other cycle (1-0-1-0), throughput drops to 50%. If `ready_in` stays low, throughput is 0% until it returns. Upstream sees a bubble after draining: `ready_out` is low while the buffer is full, so you cannot accept a new beat in the same cycle you forward the buffered one.

Here's the behavior under alternating `ready_in`:

```
         ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐
clk      │   │   │   │   │   │   │   │   │   │   │   │   │   │
      ───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───
          _________________________________________________
valid_in /                                                 \_
          _______         _______         _______
ready_in /       \_______/       \_______/       \___________
          _______                 _______                 ___
ready_out/       \_______       _/       \_______       _/
                  ^               ^               ^
                  |               |               └── Bubble
                  |               └── Buffer drains
                  └── Buffer catches beat

data     < A  >< B  >< B  >< C  >< C  >< D  >< D  >< E  >
                      held        held        held
```

Beat B gets caught in the buffer, then delivered. During the drain cycle, `ready_out` is low (buffer full), so we can't accept C yet. This repeats, giving 50% effective throughput.

**Reset note**: With synchronous reset, hold `rst` high for at least one clock so internal state is known. After that, `ready_out` is high because the buffer is empty. Reset flushes any buffered beat-if you need lossless reset, add reset fencing or replay above this block.

---

## Two-Entry FIFO: Forward Timing and Backpressure

To break the forward timing path and absorb stalls, use a 2-entry FIFO. This is boring. It is correct. That is the point.

When I say "break the forward timing path," I mean removing the same-cycle combinational path from input payload signals (`data_in`, `valid_in`, sidebands) to output payload signals (`data_out`, `valid_out`, sidebands). The ready path is a separate concern.

This 2-entry FIFO is the core logic inside what vendors call a "fully registered slice."

**Warning**: `ready_out` is still combinational-it depends on `ready_in` via `pop`. If you chain many of these, ready can still become your critical path. Vendor register slices solve this with internal staging. Never generate `ready_in` combinationally from `ready_out`-that creates a ready loop that can deadlock or oscillate. Same rule for valid: don't build combinational loops involving valid and ready across blocks.

This implementation uses explicit flops (not array inference) for deterministic behavior:

```systemverilog
module stream_fifo2 #(
    parameter WIDTH = 32
) (
    input  logic             clk,
    input  logic             rst,
    input  logic             valid_in,
    output logic             ready_out,
    input  logic [WIDTH-1:0] data_in,
    output logic             valid_out,
    input  logic             ready_in,
    output logic [WIDTH-1:0] data_out
);

    // Explicit flops, not array (deterministic inference)
    logic [WIDTH-1:0] q0, q1;
    logic [1:0]       count;

    assign valid_out = (count != 2'd0);
    assign data_out  = q0;  // Combinational read from storage flop

    // Pop-enables-push: can accept when not full OR when popping
    wire pop  = valid_out && ready_in;
    assign ready_out = (count != 2'd2) || pop;

    wire push = valid_in && ready_out;

    always_ff @(posedge clk) begin
        if (rst) begin
            count <= 2'd0;
        end else begin
            unique case ({push, pop})
                2'b10: begin  // Push only
                    if (count == 2'd0) q0 <= data_in;
                    else               q1 <= data_in;
                    count <= count + 1;
                end
                2'b01: begin  // Pop only
                    // Shift (q1 don't-care when count==1 because valid_out deasserts)
                    q0 <= q1;
                    count <= count - 1;
                end
                2'b11: begin  // Push and pop simultaneously
                    if (count == 2'd1) begin
                        q0 <= data_in;  // Replace head
                    end else begin  // count == 2
                        q0 <= q1;       // Shift
                        q1 <= data_in;  // Refill
                    end
                    // count unchanged
                end
                default: ;  // Neither
            endcase
        end
    end

endmodule
```

**What this does**:
- Storage in explicit flops (`q0`, `q1`)-no RAM inference ambiguity
- `data_out = q0` comes from a storage flop, not a bypass mux
- `ready_out` includes pop-enables-push logic: can accept a new beat in the same cycle we're draining one
- No drain bubbles when popping and pushing simultaneously

**Latency**: Minimum 1 cycle. A beat accepted on the input in cycle N can be accepted by the sink no earlier than cycle N+1. Both data and valid are effectively registered (`data_out` reads from `q0`, `valid_out` derives from the registered `count`).

**Reset note**: Same as bypass skid-with synchronous reset, hold `rst` high for at least one clock so `count` is known. After that, `ready_out` is high because the FIFO is empty. Reset flushes any buffered beats.

**Cycle-by-cycle under alternating ready** (valid_in always high, presenting A, B, C, D, E, F):

This FIFO is not fall-through: an input transfer loads `q0` on the clock edge, and `valid_out` asserts in the following cycle.

```
         ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐
clk      │   │   │   │   │   │   │   │   │   │   │   │   │   │
      ───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───
              _________________________________________________
valid_in     /                                                 \

          _______         _______         _______         _______
ready_in /       \_______/       \_______/       \_______/
          _____________________________________________________
valid_out     /                                                 \
                  (invalid)
                      ^           ^           ^           ^
                      │           │           │           │
                      A xfer      B xfer      C xfer      D xfer

data_out ────< ? ><  A  ><  A  ><  B  ><  B  ><  C  ><  C  ><  D  >
                          held        held        held

count    ──< 0 ><  1  ><  2  ><  2  ><  2  ><  2  ><  2  ><  2  >
                              ↑           ↑           ↑
                              │           │           └── push+pop: count stays 2
                              │           └── push+pop: count stays 2
                              └── FIFO full, but pop enables push
```

Key insight: When `count == 2` and `ready_in` goes high, `pop` is true, so `ready_out = (count != 2) || pop = 0 || 1 = 1`. We push and pop simultaneously, avoiding drain bubbles.

With `ready_in` alternating 1/0, sink throughput is 50% by definition-the sink only accepts on half the cycles. The FIFO's advantage is that it keeps accepting from upstream on pop cycles even when full, avoiding extra bubbles beyond what the sink forces.

The advantages over bypass skid are:
1. Output comes from storage flops, not a combinational bypass mux
2. Two beats absorbed before stalling (vs one)
3. Cleaner timing characteristics (though not fully isolated without an output register)

**Resource cost**: Two data flops, count logic. Expect low hundreds of LUTs depending on width. Measure in your build.

Conceptually, fully-registered AXI register slices behave like a small FIFO. Use the vendor IP for production; use this code to understand what it does.

---

## Verifying Your Pipeline: SVA Assertions

Drop these into your testbench to catch protocol violations:

```systemverilog
// Data must stay stable when valid && !ready
property data_stable_under_backpressure;
    @(posedge clk) disable iff (rst)
    (valid_out && !ready_in) |=> ($stable(data_out));
endproperty
assert property (data_stable_under_backpressure);

// Valid cannot drop without a transfer
property valid_until_accepted;
    @(posedge clk) disable iff (rst)
    (valid_out && !ready_in) |=> valid_out;
endproperty
assert property (valid_until_accepted);
```

For signals with sidebands (AXI-Stream's `tlast`, `tkeep`, `tuser`), either assert each separately or pack them into a struct and assert stability on the struct. Replace `valid_out` with `m_axis_tvalid`, `ready_in` with `m_axis_tready`.

---

## The Timing Connection

Article 2 showed why a pipeline register can make timing worse. Here's how that connects:

**Logic-dominated path**: A register slice's output register breaks the combinational depth. This is what you want.

**Route-dominated path**: Adding a register slice doesn't help if the problem is wire length. Use pblocks (Vivado) or Logic Lock regions (Quartus) to pull logic together.

**Bypass skid tradeoff**: Solves backpressure but adds a mux on the data path. If your path is already logic-dominated, this can hurt timing. Use a 2-entry FIFO instead-output reads from a storage flop rather than a bypass mux, giving cleaner timing characteristics.

**Register slice tradeoff**: Breaks timing paths but can worsen placement if it pulls logic apart across the die. Check placement before and after.

---

## Common Pipelining Mistakes

| Mistake | What Happens | Fix |
|---------|--------------|-----|
| Pipeline `data` but not `valid` | Downstream captures stale data | Always register together |
| Pipeline `valid` but not `data` | Downstream captures garbage | Always register together |
| Register `ready` without storage | Data lost during backpressure | Use skid buffer or FIFO |
| Bypass skid on timing-critical path | Forward path still combinational | Use 2-entry FIFO |
| Update output unconditionally | Overwrites data during stall | Gate on `ready` ‖ `!valid` |
| Pipeline depth mismatch | Control and data desynchronize | Audit pipeline depths |
| Forget to pipeline sideband | `last`, `keep`, `user` out of sync | Include ALL signals |

---

## The Sideband Trap

AXI-Stream has `tvalid`, `tready`, `tdata`-and also `tlast`, `tkeep`, `tuser`, `tid`, `tdest`. Every signal must pipeline together:

```systemverilog
// Single-entry slice with sidebands
wire accept = m_axis_tready || !m_axis_tvalid;

always_ff @(posedge clk) begin
    if (rst) begin
        m_axis_tvalid <= 1'b0;
    end else if (accept) begin
        m_axis_tvalid <= s_axis_tvalid;
        m_axis_tdata  <= s_axis_tdata;
        m_axis_tlast  <= s_axis_tlast;
        m_axis_tkeep  <= s_axis_tkeep;
        m_axis_tuser  <= s_axis_tuser;
    end
end

assign s_axis_tready = accept;
```

This single-entry slice breaks forward timing. The ready path remains combinational. It's protocol-correct under sustained backpressure, but provides no extra buffering. If ready is delayed anywhere in your pipeline, you need a 2-entry FIFO or the vendor IP.

---

## Retiming: Let the Tool Move Registers

Before adding manual pipeline stages, try retiming.

**Vivado** (synthesis option):
```tcl
# Enable retiming for the synthesis run
set_property -name {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} \
    -value {-retiming} -objects [get_runs synth_1]
```

**Quartus**:
```tcl
set_global_assignment -name ALLOW_REGISTER_RETIMING ON
```

Retiming moves existing registers across combinational logic to balance path delays. It can split a 4-level logic path into two 2-level paths by moving a downstream register backward.

**Limitations**:
- Won't move registers across module hierarchy
- Won't move registers with asynchronous resets
- Won't fix route-dominated paths
- Confused by feedback loops: retiming algorithms struggle with ready signals because they feed backward. The tool often refuses to move registers across logic involving valid/ready loops.
- Makes RTL-to-netlist debug harder (register names change)

Check the synthesis log to confirm retiming occurred. If it didn't, you're back to manual pipelining.

---

## Latency vs. Throughput: Know What You're Trading

Pipelining doesn't make logic faster. It lets you clock faster by reducing combinational depth per stage. The tradeoff is latency in cycles.

*Conceptual example (ideal scaling):*

| Metric | Before | +1 stage | +3 stages |
|--------|--------|----------|-----------|
| Combinational delay | 8 ns | 4 ns | 2 ns |
| Max clock period | 8 ns | 4 ns | 2 ns |
| Latency (cycles) | 1 | 2 | 4 |
| Throughput @ max clock | 1x | 2x | 4x |

In practice, register overhead and routing don't scale this cleanly. Profile your design.

If your system has a latency constraint (feedback loop, control path, real-time deadline), you can't just add stages. Know which problem you have before adding registers.

---

## When NOT to Pipeline

**Feedback loops**: If you pipeline `threshold_reached` in a credit counter, the loop reacts one cycle late. This can cause overflow. Don't pipeline feedback paths-pipeline the fanout instead.

**Fixed-latency protocols**: PCIe completion timeout, DDR read latency, video blanking. Adding stages without adjusting the protocol breaks things at the system level.

---

## AXI Register Slice IP

For production designs, use the vendor IP.

**Vivado IP Catalog**: Search for "axis_register_slice"

**REG_CONFIG settings** (check current Product Guide-values change between versions):
- 0 = Bypass (no registers)
- 1 = Fully registered (2-entry storage, 1-2 cycle latency)
- Other values for SLR crossing, lightweight modes

**Warning**: Lightweight modes may insert bubble cycles. If throughput matters, use fully registered mode and verify behavior.

**Instantiation**: Use the generated wrapper name from your IP catalog. Hardcoded version strings become stale.

---

## Debug Checklist

When pipelining breaks something:

- [ ] Did you pipeline all signals together? Valid, data, and all sidebands must have matching latency
- [ ] Did you gate updates on `ready || !valid`? Unconditional updates break the protocol
- [ ] Did you handle backpressure? If ready is registered anywhere, you need storage
- [ ] Did you add latency to a feedback path? Check credit counters, flow control, state machines
- [ ] Did placement change? New registers can pull logic apart-compare placement reports

---

## Quick Reference

**The fundamental rule**: A transfer happens when `valid && ready`. Both must see the same data on that edge.

**Protocol invariant**: When `valid && !ready`, the source must hold `valid` and `data` stable.

**Decision tree**:
- No stalls → Simple registered stage
- Stalls, no forward timing issue → Bypass skid buffer
- Stalls, forward timing issue, ready can be combinational → Single-entry slice
- Stalls, forward timing issue, need full isolation → 2-entry FIFO or vendor IP

**Forward path (valid + data)**: Gate updates on `ready || !valid`. This breaks timing.

**Backward path (ready)**: Cannot register without storage. Use a skid buffer or FIFO.

**Bypass skid buffer**: Handles backpressure. Does NOT break forward timing (combinational pass-through). 50% throughput under alternating ready.

**2-entry FIFO**: Breaks forward timing path, absorbs stalls. Ready is still combinational. Absorbs two beats before stalling. Use this or the vendor IP.

---

## The Protocol Isn't Optional

Article 2 taught you to read timing reports-to trace the math from requirement to arrival. You can close timing now.

But timing closure means nothing if the design doesn't work.

A bypass skid buffer handles backpressure but doesn't break the forward timing path. A naive register breaks timing but loses data. A 2-entry FIFO breaks forward timing and absorbs stalls-but ready is still combinational. Know which problem you're solving.

The timing tool doesn't know your protocol. It sees flip-flops and combinational logic. It doesn't know that `valid` and `data` must move together, or that registering `ready` needs storage, or that your unconditional update just violated the handshake.

You know. That's why you're the engineer.

---

## Timing Series

0. [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/) - Why timing satisfies or breaks
1. [Constraints: The Contract You Forgot to Sign](/articles/constraints-the-contract-you-forgot-to-sign/) - How to write constraints
2. [Understanding Timing Analysis](/articles/understanding-timing-analysis/) - How to read timing reports
3. **Pipelining Without Breaking Your Protocol** - How to fix violations *(you are here)*
4. [Silicon Real Estate: Your Resource Budget](/articles/silicon-real-estate-your-resource-budget/) - How to manage resources
5. [CDC: Two Flip-Flops Are Not Magic](/articles/cdc-two-flip-flops-are-not-magic/) - How to cross clock domains
