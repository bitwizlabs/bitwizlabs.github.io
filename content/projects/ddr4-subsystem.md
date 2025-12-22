---
title: "DDR4 Subsystem Architecture"
slug: "ddr4-subsystem"
date: 2025-01-15
draft: false
summary: "Complete DDR4 memory subsystem for Xilinx UltraScale+ with custom AXI4 wrapper and burst optimization"
tags: ["DDR4", "memory", "AXI", "FPGA"]
status: "Shipped"
repo_url: ""
metrics:
  fmax_mhz: 300
  throughput: "25.6 GB/s"
  resources_summary: "8K LUT, 12K FF, 48 BRAM"
---

## Overview

A complete DDR4 memory subsystem targeting Xilinx UltraScale+ devices, featuring a custom AXI4 interface wrapper with optimized burst handling.

## Key Features

- **AXI4 Interface**: Full AXI4 compliant with configurable data widths (128/256/512-bit)
- **Burst Optimization**: Automatic burst coalescing for improved bandwidth utilization
- **ECC Support**: Optional inline ECC with single-bit correction, double-bit detection
- **Calibration**: Automated read/write leveling with runtime adjustment

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   User Logic                     │
└─────────────────────┬───────────────────────────┘
                      │ AXI4
┌─────────────────────▼───────────────────────────┐
│              AXI Interconnect                    │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│           DDR4 Controller Wrapper                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │   Burst    │  │   ECC      │  │  Timing    │ │
│  │  Coalesce  │  │  Engine    │  │  Arbiter   │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ Native
┌─────────────────────▼───────────────────────────┐
│              MIG IP Core                         │
└─────────────────────┬───────────────────────────┘
                      │ DDR4 PHY
                      ▼
               [ DDR4 SODIMM ]
```

## Implementation Notes

### Burst Coalescing

```systemverilog
// Combine sequential writes into single burst
always_ff @(posedge clk) begin
    if (aw_valid && aw_ready) begin
        if (can_coalesce(pending_addr, aw_addr)) begin
            pending_len <= pending_len + aw_len + 1;
        end else begin
            flush_pending();
            pending_addr <= aw_addr;
            pending_len  <= aw_len;
        end
    end
end
```

### Timing Considerations

- Read latency: 18-22 cycles (depending on CAS latency configuration)
- Write posting enabled for improved throughput
- Bank interleaving for concurrent access patterns

## Status

**Current**: In production on medical imaging platform
**Next**: Exploring DDR5 migration path

---

*Questions? [hello@bitwiz.io](mailto:hello@bitwiz.io)*
