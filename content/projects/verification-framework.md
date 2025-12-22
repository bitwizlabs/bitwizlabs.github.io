---
title: "Verification Framework (Cocotb/SVA)"
slug: "verification-framework"
date: 2024-12-20
draft: false
summary: "Hybrid verification framework combining Python Cocotb testbenches with SVA for comprehensive RTL verification"
tags: ["verification", "Cocotb", "SVA", "testbench", "Python"]
status: "Shipped"
repo_url: ""
metrics:
  fmax_mhz: 0
  throughput: ""
  resources_summary: ""
---

## Overview

A hybrid verification framework combining Python-based Cocotb testbenches with SystemVerilog Assertions (SVA) for comprehensive RTL verification.

## Key Features

- **Python testbenches**: Readable, maintainable test code with full Python ecosystem
- **SVA integration**: Formal property checking alongside simulation
- **Reusable components**: BFM library for common interfaces (AXI, APB, SPI, I2C)
- **Coverage collection**: Functional coverage with automatic HTML reports
- **CI/CD ready**: Designed for automated regression testing

## Framework Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Framework                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │   Test Cases     │  │   Coverage       │                 │
│  │   (Python)       │  │   (Python)       │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│  ┌────────▼─────────────────────▼─────────┐                 │
│  │              Cocotb Layer              │                 │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │                 │
│  │  │ AXI BFM │ │ APB BFM │ │  SPI BFM │  │                 │
│  │  └─────────┘ └─────────┘ └──────────┘  │                 │
│  └────────────────────┬───────────────────┘                 │
│                       │                                      │
├───────────────────────┼─────────────────────────────────────┤
│                       │ VPI/VHPI                            │
├───────────────────────┼─────────────────────────────────────┤
│  ┌────────────────────▼───────────────────┐                 │
│  │              DUT (RTL)                 │                 │
│  │  ┌─────────────────────────────────┐   │                 │
│  │  │   SVA Properties & Assertions   │   │                 │
│  │  └─────────────────────────────────┘   │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Example: AXI4 Lite BFM

```python
import cocotb
from cocotb.triggers import RisingEdge, Timer
from cocotb.clock import Clock

class AXI4LiteMaster:
    """AXI4-Lite Master Bus Functional Model"""

    def __init__(self, dut, prefix="s_axi_"):
        self.dut = dut
        self.prefix = prefix
        self.clk = getattr(dut, f"{prefix}aclk")

    async def write(self, addr: int, data: int, strb: int = 0xF):
        """Perform AXI4-Lite write transaction"""
        # Address phase
        self._set_signal("awaddr", addr)
        self._set_signal("awvalid", 1)
        self._set_signal("wdata", data)
        self._set_signal("wstrb", strb)
        self._set_signal("wvalid", 1)
        self._set_signal("bready", 1)

        # Wait for handshakes
        while True:
            await RisingEdge(self.clk)
            if self._get_signal("awready") and self._get_signal("wready"):
                break

        self._set_signal("awvalid", 0)
        self._set_signal("wvalid", 0)

        # Wait for response
        while not self._get_signal("bvalid"):
            await RisingEdge(self.clk)

        resp = self._get_signal("bresp")
        self._set_signal("bready", 0)

        return resp == 0  # OKAY response

    async def read(self, addr: int) -> int:
        """Perform AXI4-Lite read transaction"""
        self._set_signal("araddr", addr)
        self._set_signal("arvalid", 1)
        self._set_signal("rready", 1)

        while not self._get_signal("arready"):
            await RisingEdge(self.clk)

        self._set_signal("arvalid", 0)

        while not self._get_signal("rvalid"):
            await RisingEdge(self.clk)

        data = int(self._get_signal("rdata"))
        self._set_signal("rready", 0)

        return data
```

## Example: SVA Properties

```systemverilog
// AXI4-Lite protocol assertions
module axi4lite_sva_checker (
    input logic        aclk,
    input logic        aresetn,
    // Write address channel
    input logic        awvalid,
    input logic        awready,
    // Write data channel
    input logic        wvalid,
    input logic        wready,
    // Write response channel
    input logic        bvalid,
    input logic        bready
);

// Property: AWVALID must remain stable until AWREADY
property awvalid_stable;
    @(posedge aclk) disable iff (!aresetn)
    awvalid && !awready |=> awvalid;
endproperty

// Property: Write response must follow write data
property write_response_follows_data;
    @(posedge aclk) disable iff (!aresetn)
    (wvalid && wready) |-> ##[1:16] (bvalid && bready);
endproperty

// Assertions
assert property (awvalid_stable)
    else $error("AWVALID dropped before AWREADY");

assert property (write_response_follows_data)
    else $error("Write response timeout");

// Coverage
cover property (@(posedge aclk) awvalid && awready);
cover property (@(posedge aclk) wvalid && wready);

endmodule
```

## Test Example

```python
@cocotb.test()
async def test_register_access(dut):
    """Test basic register read/write"""

    # Start clock
    cocotb.start_soon(Clock(dut.clk, 10, units="ns").start())

    # Reset
    dut.rst_n.value = 0
    await Timer(100, units="ns")
    dut.rst_n.value = 1
    await Timer(100, units="ns")

    # Create BFM
    axi = AXI4LiteMaster(dut)

    # Write and readback
    test_addr = 0x100
    test_data = 0xDEADBEEF

    assert await axi.write(test_addr, test_data), "Write failed"
    readback = await axi.read(test_addr)

    assert readback == test_data, \
        f"Readback mismatch: got {readback:#x}, expected {test_data:#x}"
```

## Status

**Current**: Used across multiple active projects
**Next**: Adding formal verification integration (SymbiYosys)

---

*Questions? [hello@bitwiz.io](mailto:hello@bitwiz.io)*
