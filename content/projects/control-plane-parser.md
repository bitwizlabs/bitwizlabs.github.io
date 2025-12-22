---
title: "Control-Plane Message Parser FSM"
slug: "control-plane-parser"
date: 2025-01-05
draft: false
summary: "Single-cycle hardware FSM for parsing control-plane messages with zero-copy field extraction"
tags: ["FSM", "parser", "control-plane", "protocol"]
status: "Shipped"
repo_url: ""
metrics:
  fmax_mhz: 400
  throughput: "200 Gbps"
  resources_summary: "2K LUT, 1K FF"
---

## Overview

A synthesizable finite state machine for parsing control-plane messages in hardware, designed for low-latency protocol processing in network acceleration applications.

## Key Features

- **Single-cycle parsing**: Most message types parsed in one clock cycle
- **Configurable protocols**: Template-based support for custom message formats
- **Error handling**: Malformed packet detection with detailed error codes
- **Zero-copy**: Direct field extraction without intermediate buffering

## Supported Message Types

- TLP headers (PCIe)
- AXI-Stream sideband signals
- Custom control packets (configurable)
- Management frames

## Architecture

```
                    ┌─────────────────────────────┐
    Input Stream    │                             │
    ──────────────► │      Header Extractor       │
    (AXI-Stream)    │                             │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │                             │
                    │      Type Classifier        │
                    │                             │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼─────────┐ ┌───────▼────────┐ ┌────────▼────────┐
    │   TLP Parser      │ │  AXIST Parser  │ │  Custom Parser  │
    └─────────┬─────────┘ └───────┬────────┘ └────────┬────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      Output Multiplexer      │
                    │      + Field Registers       │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                           Parsed Fields
```

## Implementation

### Parser State Machine

```systemverilog
module ctrl_plane_parser #(
    parameter int DATA_WIDTH = 512,
    parameter int MAX_HDR_BYTES = 64
)(
    input  logic                    clk,
    input  logic                    rst_n,

    // AXI-Stream input
    input  logic [DATA_WIDTH-1:0]   s_axis_tdata,
    input  logic                    s_axis_tvalid,
    input  logic                    s_axis_tlast,
    output logic                    s_axis_tready,

    // Parsed output
    output parsed_msg_t             parsed_msg,
    output logic                    parsed_valid,
    output logic [7:0]              parse_error
);

typedef enum logic [3:0] {
    IDLE,
    EXTRACT_HDR,
    CLASSIFY,
    PARSE_TLP,
    PARSE_AXIST,
    PARSE_CUSTOM,
    OUTPUT,
    ERROR
} state_t;

state_t state, next_state;

always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        state <= IDLE;
    end else begin
        state <= next_state;
    end
end

always_comb begin
    next_state = state;
    case (state)
        IDLE: if (s_axis_tvalid) next_state = EXTRACT_HDR;
        EXTRACT_HDR: next_state = CLASSIFY;
        CLASSIFY: begin
            case (msg_type)
                TYPE_TLP:    next_state = PARSE_TLP;
                TYPE_AXIST:  next_state = PARSE_AXIST;
                TYPE_CUSTOM: next_state = PARSE_CUSTOM;
                default:     next_state = ERROR;
            endcase
        end
        // ... parse states
        OUTPUT: next_state = IDLE;
        ERROR:  next_state = IDLE;
    endcase
end

endmodule
```

### Field Extraction (Single-cycle)

```systemverilog
// Parallel field extraction for TLP header
assign tlp_fields.fmt      = hdr_data[7:5];
assign tlp_fields.type_    = hdr_data[4:0];
assign tlp_fields.tc       = hdr_data[14:12];
assign tlp_fields.attr     = {hdr_data[18], hdr_data[13:12]};
assign tlp_fields.length   = hdr_data[9:0];
assign tlp_fields.req_id   = hdr_data[31:16];
assign tlp_fields.tag      = hdr_data[47:40];
assign tlp_fields.address  = hdr_data[95:34];
```

## Performance

| Metric | Value |
|--------|-------|
| Latency | 3-5 cycles |
| Throughput | 512 bits/cycle |
| Resource Usage | ~2K LUTs |

## Status

**Current**: Deployed in production NIC design
**Next**: Adding support for RoCEv2 headers

---

*Questions? [hello@bitwiz.io](mailto:hello@bitwiz.io)*
