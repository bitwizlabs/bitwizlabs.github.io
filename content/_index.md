---
title: "bitwiz"
description: "Digital logic design & FPGA-accelerated systems"
---

```systemverilog
// bitwiz.sv
// Author: Alexis Martin Lopez
// Identity: FPGA Engineer | USA Born | MXN Heritage | Yerba Mate Powered
// Description: Homepage signature FSM

module bitwiz (
    input  logic clk_i,
    input  logic rst_ni,
    input  logic yerba_mate_rdy_i,
    output logic dp_active_o
);

    typedef enum logic [2:0] {
        BOOT  = 3'd0,  // Rise, stretch, exist
        FUEL  = 3'd1,  // Yerba mate or no work
        GRIND = 3'd2,  // Timing closure arc
        LIFT  = 3'd3,  // Iron therapy
        REST  = 3'd4   // Sleep is a feature, not a bug
    } state_e;

    state_e state_q, state_d;
    logic   yerba_mate_rdy_q;
    logic   mate_step_w;

    always_ff @(posedge clk_i or negedge rst_ni) begin
        if (!rst_ni) begin
            state_q          <= BOOT;
            yerba_mate_rdy_q <= 1'b0;
        end else begin
            state_q          <= state_d;
            yerba_mate_rdy_q <= yerba_mate_rdy_i;
        end
    end

    assign mate_step_w = yerba_mate_rdy_i && !yerba_mate_rdy_q;

    always_comb begin
        state_d = state_q;
        // Advance one state per mate-ready rising edge
        if (mate_step_w) begin
            case (state_q)
                BOOT:    state_d = FUEL;
                FUEL:    state_d = GRIND;
                GRIND:   state_d = LIFT;
                LIFT:    state_d = REST;
                REST:    state_d = BOOT;
                default: state_d = BOOT;
            endcase
        end
    end

    assign dp_active_o = (state_q == GRIND) || (state_q == LIFT);

endmodule
```

Get in touch: [hello@bitwiz.io](mailto:hello@bitwiz.io)
