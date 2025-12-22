---
title: "bitwizlabs"
description: "Digital logic design & FPGA-accelerated systems"
---

# Welcome

I'm **bitwiz** - an FPGA engineer focused on high-performance digital systems, streaming architectures, and verification automation.

> *Digital logic design & FPGA-accelerated systems*

New here? **[Start Here](/start-here/)** for an introduction and reading guide.

---

## What you'll find here

**[Projects](/projects/)** - Deep dives into FPGA subsystems, from DDR4 memory controllers to high-speed SerDes integration.

**[Lab Notes](/lab-notes/)** - Shorter experiments and explorations from the lab.

**[Articles](/articles/)** - Technical notes on verification, timing closure, and the craft of RTL design.

**[About](/about/)** - More about my background and focus areas.

**[Now](/now/)** - What I'm currently working on.

---

## Featured Projects

- [DDR4 Subsystem Architecture](/projects/ddr4-subsystem/) - Memory controller design patterns
- [SerDes Integration (64b/66b)](/projects/serdes-integration/) - High-speed serial link implementation
- [Verification Framework](/projects/verification-framework/) - Cocotb and SVA methodologies

---

```systemverilog
// Let's build something
module bitwizlabs (
    input  logic clk,
    input  logic rst_n,
    output logic ready
);
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) ready <= 1'b0;
        else        ready <= 1'b1;
    end
endmodule
```

Get in touch: [hello@bitwiz.io](mailto:hello@bitwiz.io)
