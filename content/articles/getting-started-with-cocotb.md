---
title: "Getting Started with Cocotb for FPGA Verification"
slug: "getting-started-with-cocotb"
date: 2025-01-20
draft: false
summary: "A practical introduction to Python-based RTL verification using Cocotb"
tags: ["verification", "Cocotb", "Python", "testbench"]
difficulty: "Beginner"
---

## Why Cocotb?

Traditional verification approaches using SystemVerilog UVM can be heavyweight for many FPGA projects. Cocotb offers a lighter alternative that leverages Python's expressiveness while still providing robust verification capabilities.

## Installation

```bash
pip install cocotb
pip install cocotb-bus  # For common interface drivers
```

## Your First Cocotb Test

```python
import cocotb
from cocotb.triggers import Timer, RisingEdge
from cocotb.clock import Clock

@cocotb.test()
async def test_basic(dut):
    """Basic smoke test"""

    # Start a 10ns clock
    cocotb.start_soon(Clock(dut.clk, 10, units="ns").start())

    # Reset
    dut.rst_n.value = 0
    await Timer(50, units="ns")
    dut.rst_n.value = 1

    # Wait for a few cycles
    for _ in range(10):
        await RisingEdge(dut.clk)

    # Check output
    assert dut.ready.value == 1, "Expected ready signal to be high"
```

## Running Tests

```bash
# With Icarus Verilog
make SIM=icarus

# With Verilator
make SIM=verilator

# With commercial simulators
make SIM=questa
```

More detailed examples coming soon...

---

*Questions? [hello@bitwiz.io](mailto:hello@bitwiz.io)*
