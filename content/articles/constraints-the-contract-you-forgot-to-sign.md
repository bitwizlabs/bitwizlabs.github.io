---
title: "Constraints: The Contract You Forgot to Sign"
date: 2025-12-23
draft: false
description: "Understanding FPGA timing constraints - clocks, I/O delays, CDC, and why 'Timing Met' means nothing without proper constraints"
tags: ["FPGA", "timing", "constraints", "CDC", "hardware"]
categories: ["articles"]
---

*Timing Series: Part 1 of 4*
*Previous: [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/)*

---

## Signoff Gates: Build Must Fail If...

Before reading further, know this: your build should fail if any of these checks fail.

**Gate 1: Unconstrained endpoints must be zero**
```tcl
check_timing -verbose
report_exceptions -verbose
```
Fail if: Any constraint-related issue about clocks, unconstrained endpoints, or missing I/O delays. Also fail if any exception matches zero objects (silent no-op) or hits an unexpectedly large set.

Action: Fix constraints until remaining items are explicitly intentional and documented.

**Gate 2: All expected clocks must exist with correct periods**
```tcl
report_clocks
```
Fail if: Any expected clock is missing, or any period is wrong.

Action: First verify source `create_clock` binds correctly. Only add `create_generated_clock` if the tool truly cannot derive it.

**Gate 3: Clock relationships must match reality**
```tcl
report_clock_interaction
```
Fail if:
- A clock pair is "Timed" but is actually asynchronous
- A clock pair is "Async" but is actually related (same source)
- Any "unclocked" or "no clock" endpoints exist

Action: If you cannot prove clocks are related (same source with known relationship), treat as async and implement CDC. Do not use constraints to guess — decide architecture first, constraints second.

If you ship with any of these gates failing, "Timing Met" is fiction.

---

## The Lie You Told Yourself

Your design passed timing. Zero violations. Green across the board. You shipped it.

Three weeks later, it fails in the field. Intermittent. Unreproducible in the lab.

The postmortem takes two weeks. The answer is one line in your XDC file that isn't there.

You constrained the 100 MHz input clock. But the PLL output — the 156.25 MHz clock that actually feeds your datapath — has no constraint. The tools timed a fraction of your design.

*(You can get the same failure from: missing I/O delays, clock defined on the wrong object, or over-broad exceptions.)*

---

## Constraints Are the Contract

**Constraints define the environment.** Clocks, I/O timing, domain relationships.

**Timing analysis verifies your design against that environment.**

**Missing or wrong constraints?** The tool's answer is meaningless. Prove the contract is enforced: `check_timing`, `report_clocks`, `report_clock_interaction`.

---

## `create_clock`: Making the Invisible Visible

A clock without a constraint is unconstrained. Paths clocked by that signal have no setup/hold checks, and optimization isn't driven by a real deadline.

```tcl
create_clock -period 6.4 -name clk_156 [get_ports clk_in]
```

**What happens when it's missing:** `check_timing` warns about unconstrained endpoints — but only if you treat those warnings as errors.

**What happens when it's wrong:** You say 10 ns, but the real clock is 6.4 ns. Hardware fails at the real frequency.

---

## Generated Clocks: Where Designs Actually Break

### MMCM/PLL Outputs

In Vivado, if you use the Clocking Wizard IP, `create_generated_clock` constraints are automatically written. **Auto-derivation depends on the tool being able to trace from a properly constrained source clock through the clocking resource.** Still verify with `report_clocks`; don't assume.

If `report_clocks` does not show what you expect, treat it as a hard error.

**If `report_clocks` already shows the generated clock, do not re-declare it.** Engineers sometimes redeclare with the wrong source pin or divide ratio, and now STA is lying while still "green."

### Fabric Clock Dividers — Don't Do This

**The rule is not "no divided clocks" — it's "no LUT-generated clocks for real logic."** Divided clocks from dedicated clocking resources (BUFGCE_DIV, MMCM) are fine. Divided clocks from random LUT logic are the problem: high skew, not on a clock network.

For performance-critical logic, use clock enables (CE) instead.

---

## Clock Relationships: Setting Up CDC

### `set_clock_groups -asynchronous`

```tcl
set_clock_groups -asynchronous -group {clk_156} -group {clk_125}
```

This deletes paths from timing analysis **in both directions**. It can also hide accidental combinational paths between domains.

**Do CDC first, then constrain it.** Don't use constraints to make timing problems disappear.

**Preferred pattern:** Keep clocks separate for timing, but only false-path into the first synchronizer stage. Use `set_clock_groups` only when you truly want the tools to ignore *all* crossings.

**The CDC Minimum Bar:**

| Crossing Type | Required Structure |
|---------------|-------------------|
| Single-bit level | 2-flop synchronizer with `ASYNC_REG` |
| Pulses | Toggle or req/ack handshake |
| Multi-bit buses | Async FIFO or gray-coded pointers |
| Resets | Synchronize deassertion per domain |

**Why ASYNC_REG matters:** This RTL attribute tells the tool these flops are a synchronizer, so it avoids retiming/merging and tries to keep stages physically close. **ASYNC_REG requires two flops in series.** Verify placement stayed intact.

---

## I/O Delays: Timing at the Chip Boundary

I/O constraints model the physical PCB. Without them, timing reports are internal-only.

### Define Your Reference Point or You're Lying to STA

Before writing I/O constraints, decide what your `-clock` object represents:

**Option A (common for outputs):** `-clock` is the capture clock edge at the external device. Use a virtual clock if that clock doesn't enter the FPGA. Dclk and Ddata must be defined relative to that device.

**Option B:** `-clock` is the clock edge at the FPGA pin. Then you must explicitly include clock flight time from FPGA to device in your calculations.

**Pick one. Don't mix them within a single interface calculation. Put "from → to" in your notes.**

### Input Delay Math

Reference: Clock and data arriving at the **FPGA pins**.

```
                Clock source
                     │
              ┌──────┴──────┐
              │             │
    Dclk (source→FPGA)    External Device
              │             │
              ▼             │ Tco
         FPGA clk pin       ▼
                         Data ─── Ddata (device→FPGA) ───→ FPGA data pin

input_delay = Tco + Ddata - Dclk
```

| Variable | Definition |
|----------|------------|
| Tco | External device clock-to-output (datasheet) |
| Ddata | Data flight time: external device → FPGA data pin |
| Dclk | Clock flight time: clock source → FPGA clock pin |

```
input_delay_max = Tco_max + Ddata_max - Dclk_min   (setup: late data, early clock)
input_delay_min = Tco_min + Ddata_min - Dclk_max   (hold: early data, late clock)
```

### Concrete Example: Capturing ADC Data

| Parameter | Min | Max | From → To |
|-----------|-----|-----|-----------|
| ADC Tco | 0.8 ns | 2.2 ns | ADC clk → ADC data out |
| Ddata | 0.3 ns | 0.6 ns | ADC data out → FPGA data pin |
| Dclk | 0.2 ns | 0.5 ns | Clock source → FPGA clock pin |

```
input_delay_max = 2.2 + 0.6 - 0.2 = 2.6 ns
input_delay_min = 0.8 + 0.3 - 0.5 = 0.6 ns
```

```tcl
create_clock -name adc_clk -period 10.0 [get_ports adc_clk]
set_input_delay -clock adc_clk -max 2.6 [get_ports adc_data[*]]
set_input_delay -clock adc_clk -min 0.6 [get_ports adc_data[*]]
```

### If Hold Fails After Adding Constraints

That's the tool finally modeling your board. Hold violations are worst at the fast-cold corner (fast silicon, low temperature).

**Fixes:** Add IDELAY to shift data later, adjust PCB skew, or change capture scheme.

**Caution about IOB registers:** Moving the capture FF into the IOB often helps *setup* but can *hurt hold* because data reaches the FF earlier.

### Output Delay Math

Reference: Capture clock edge at the **external device**.

| Variable | Definition |
|----------|------------|
| Tsu | External device setup requirement (datasheet) |
| Th | External device hold requirement (datasheet) |
| Ddata | Data flight time: FPGA data pin → external device |
| Dclk | Clock flight time: clock source → external device |

```
output_delay_max = Tsu + Ddata_max - Dclk_min   (setup: late data, early clock)
output_delay_min = -(Th + Dclk_max - Ddata_min) (hold: early data, late clock)
```

### Concrete Example: Driving a DAC

Reference clock: Capture edge at the DAC.

| Parameter | Min | Max | From → To |
|-----------|-----|-----|-----------|
| DAC Tsu | — | 1.5 ns | Data stable before DAC captures |
| DAC Th | 0.5 ns | — | Data stable after DAC captures |
| Ddata | 0.4 ns | 0.6 ns | FPGA data pin → DAC data pin |
| Dclk | 0.3 ns | 0.5 ns | Clock source → DAC clock pin |

```
output_delay_max = 1.5 + 0.6 - 0.3 = 1.8 ns
output_delay_min = -(0.5 + 0.5 - 0.4) = -0.6 ns
```

```tcl
# v_dac_clk represents the capture clock edge at the DAC (virtual clock)
create_clock -name v_dac_clk -period 10.0

set_output_delay -clock v_dac_clk -max 1.8 [get_ports dac_data[*]]
set_output_delay -clock v_dac_clk -min -0.6 [get_ports dac_data[*]]
```

**About negative `-min`:** A negative value can be valid — it means the allowed data transition window extends before the reference edge. **This does not mean "you're safe" unless you defined the clock at the correct capture point.** If your reference point is wrong, STA will give you precise numbers about the wrong problem.

**About virtual clocks:** Virtual clocks model external requirements. If your output clock is derived from an internal clock with a known relationship, you may instead constrain against that internal clock at the appropriate reference point. The key is reference consistency.

### Never Skip `-min`

If you omit `-min`, you're not modeling early data arrival (hold risk). Setting `-min 0` can be a debug placeholder, but not signoff-ready.

### Virtual Clocks

Virtual clocks are for modeling external timing requirements, not internal sampling.

**Do NOT use a virtual clock to "solve" CDC:**
```tcl
# WRONG: Creating virtual clock to hide CDC
create_clock -name v_ext_clk -period 8.0
set_clock_groups -asynchronous -group {my_clk} -group {v_ext_clk}
# This doesn't fix CDC. Data is still crossing domains unsynchronized.
```

### Board Delays Unknown?

Estimate ~150-180 ps/inch for FR4 (varies with stackup — use your board data, not this guess). Refine after layout.

---

## Exceptions: Guilty Until Proven Innocent

### False Paths

Target the first synchronizer stage. **Over-matching is worse than no-matching** — you can accidentally disable timing to paths that aren't synchronizers.

```tcl
# Target first sync stage using regex (brace-delimited for safety)
set_false_path -to [get_cells -hier -regexp -filter {NAME =~ {.*sync_reg\[0\].*} && IS_SEQUENTIAL}]
```

**Do not false-path into later sync stages or the entire destination domain; only the first stage is allowed to violate timing by design.**

**Mandatory verification:**
```tcl
report_exceptions -verbose
# Confirm ONLY intended endpoints are affected
```

Name-based matching is brittle. Prefer marking sync flops with `ASYNC_REG` and targeting by that property if your flow supports it.

Constraints that match nothing are silent no-ops. Constraints that match too much silently disable real timing checks.

### Multicycle Paths

```tcl
set_multicycle_path 2 -setup -from [get_cells slow_reg] -to [get_cells slow_dest]
set_multicycle_path 1 -hold  -from [get_cells slow_reg] -to [get_cells slow_dest]
```

**Critical: When you relax setup by N cycles, relax hold by N-1 cycles.**

**Multicycle must match the actual enable/valid behavior.** If the destination can sample on cycles you didn't account for, multicycle is invalid. Validate with waveform-level reasoning.

**Fanout trap:** If `slow_reg` fans out to both multicycle and single-cycle destinations, only the specified path gets the exception.

---

## The Audit

### Vivado Commands

```tcl
report_clocks
report_clock_interaction
check_timing -verbose
report_exceptions -verbose   # Verify exceptions hit intended targets
```

### Quartus/TimeQuest Equivalents

| Goal | Vivado | Quartus/TimeQuest |
|------|--------|-------------------|
| List all clocks | `report_clocks` | `report_clocks` |
| Find constraint issues | `check_timing` | `check_timing` |
| Analyze clock transfers | `report_clock_interaction` | `report_clock_transfers` |
| Auto-derive PLL clocks | Clocking Wizard (auto) | `derive_pll_clocks` |
| Auto-derive uncertainty | Auto | `derive_clock_uncertainty` |

*Quartus versions differ. Goal is the same: zero unconstrained endpoints, all expected clocks present.*

---

## The Checklist

- [ ] Every external clock has `create_clock`
- [ ] Every generated clock verified in `report_clocks`
- [ ] No LUT-generated clocks for critical logic
- [ ] Clock relationships verified in `report_clock_interaction`
- [ ] CDC uses targeted false-paths to first sync stage (preferred) or `set_clock_groups`
- [ ] CDC structures have `ASYNC_REG` on 2-flop synchronizers (verify placement)
- [ ] I/O delays have consistent reference points (document "from → to")
- [ ] Every I/O has `-min` and `-max` delays
- [ ] **Every `set_multicycle_path -setup N` has matching `-hold N-1`**
- [ ] All exceptions verified with `report_exceptions`
- [ ] Zero unresolved `check_timing` issues

---

## Quick Reference

**The One-Liner:**
Constraints don't make timing pass. They make timing real.

**Common Mistakes:**

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missing generated clock | Timing met, hardware fails | Verify source `create_clock`, check `report_clocks` |
| Zero I/O delay | Hold violations at corners | Calculate real values |
| Multicycle without hold | Hold violations | Add `-hold N-1` |
| False path over-matches | Real timing disabled | Verify with `report_exceptions` |
| False path matches nothing | Silent no-op | Verify with `report_exceptions` |
| IOB reg to "fix" hold | Hold gets worse | Use IDELAY instead |
| Mixed I/O reference points | Wrong constraint values | Document "from → to" consistently |

---

## Appendix: Example Constraints

```tcl
# ==============================================================================
# EXAMPLE - Calculate your own values from datasheets and layout.
# ==============================================================================

# ------------------------------------------------------------------------------
# Primary clock at FPGA input pin
# ------------------------------------------------------------------------------
create_clock -period 6.4 -name clk_156 [get_ports clk_in]

# Clock uncertainty: Tools model default values. For signoff, you need a
# justified uncertainty budget (jitter, SI, PLL). Don't adjust without data.

# ------------------------------------------------------------------------------
# Input delays - reference: clock at FPGA pin, data at FPGA pin
# ------------------------------------------------------------------------------
set_input_delay -clock clk_156 -max 5.5 [get_ports data_in[*]]
set_input_delay -clock clk_156 -min 1.5 [get_ports data_in[*]]

# ------------------------------------------------------------------------------
# Output delays - reference: capture clock at external device (virtual clock)
# ------------------------------------------------------------------------------
create_clock -name v_ext_clk -period 6.4
# No source - this is a virtual clock representing the device capture edge

set_output_delay -clock v_ext_clk -max 2.0 [get_ports data_out[*]]
set_output_delay -clock v_ext_clk -min -0.5 [get_ports data_out[*]]

# Note: This example uses FPGA-pin reference for inputs and device-capture
# reference for outputs — a common pattern. The key is consistency within
# each calculation, documented with "from → to".

# ------------------------------------------------------------------------------
# CDC - target first sync stage only, verify with report_exceptions
# ------------------------------------------------------------------------------
set_false_path -to [get_cells -hier -regexp -filter {NAME =~ {.*sync_reg\[0\].*} && IS_SEQUENTIAL}]

# ------------------------------------------------------------------------------
# Multicycle - always include hold adjustment
# ------------------------------------------------------------------------------
set_multicycle_path 2 -setup -from [get_cells slow_reg[*]] -to [get_cells slow_dest[*]]
set_multicycle_path 1 -hold  -from [get_cells slow_reg[*]] -to [get_cells slow_dest[*]]
```

These constraints compile but aren't correct for your board. Use the formulas and checklists above to calculate values for your actual hardware.

---

## Timing Series

0. [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/) — Why timing satisfies or breaks
1. **Constraints: The Contract You Forgot to Sign** — How to write constraints *(you are here)*
2. [Understanding Timing Analysis](/articles/understanding-timing-analysis/) — How to read timing reports
3. [Pipelining Without Breaking Your Protocol](/articles/pipelining-without-breaking-your-protocol/) — How to fix violations
4. [Silicon Real Estate: Your Resource Budget](/articles/silicon-real-estate-your-resource-budget/) — How to manage resources

---

*← Previous: [Your FPGA Lives a Lifetime While You Blink](/articles/your-fpga-lives-a-lifetime-while-you-blink/)* | *Next: [Understanding Timing Analysis](/articles/understanding-timing-analysis/) →*
