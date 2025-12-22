---
title: "TCL Automation Toolkit"
date: 2024-12-15
draft: false
description: "Vivado/Quartus automation scripts for FPGA workflows"
tags: ["TCL", "automation", "Vivado", "Quartus", "scripting"]
categories: ["projects"]
---

## Overview

A collection of TCL scripts for automating FPGA design workflows in Xilinx Vivado and Intel Quartus, focusing on reproducible builds, timing closure, and design analysis.

## Key Features

- **Non-project mode**: Fully scripted builds without GUI dependency
- **Timing analysis**: Automated timing reports with slack trending
- **Constraint generation**: Auto-generate XDC/SDC from design analysis
- **Build system integration**: Make/CMake compatible wrapper scripts
- **Version control friendly**: Human-readable project files

## Components

```
tcl-toolkit/
├── build/
│   ├── vivado_build.tcl       # Main build script
│   ├── quartus_build.tcl      # Quartus equivalent
│   └── common_utils.tcl       # Shared utilities
├── timing/
│   ├── analyze_timing.tcl     # Timing analysis
│   ├── generate_constraints.tcl
│   └── clock_report.tcl
├── debug/
│   ├── insert_ila.tcl         # ILA insertion
│   └── mark_debug.tcl
└── reports/
    ├── utilization.tcl
    └── power_estimate.tcl
```

## Example: Non-Project Build

```tcl
# vivado_build.tcl - Reproducible non-project build

proc build_design {top_module sources constraints output_dir} {
    # Create in-memory project
    create_project -in_memory -part xczu9eg-ffvb1156-2-e

    # Set properties
    set_property target_language Verilog [current_project]
    set_property default_lib work [current_project]

    # Read sources
    foreach src $sources {
        if {[string match "*.sv" $src]} {
            read_verilog -sv $src
        } elseif {[string match "*.v" $src]} {
            read_verilog $src
        } elseif {[string match "*.vhd" $src]} {
            read_vhdl $src
        }
    }

    # Read constraints
    foreach xdc $constraints {
        read_xdc $xdc
    }

    # Synthesis
    puts "INFO: Starting synthesis..."
    synth_design -top $top_module -flatten_hierarchy rebuilt

    # Write checkpoint
    write_checkpoint -force ${output_dir}/post_synth.dcp
    report_timing_summary -file ${output_dir}/timing_synth.rpt

    # Optimize
    opt_design

    # Place
    puts "INFO: Starting placement..."
    place_design

    # Physical optimization
    phys_opt_design

    # Route
    puts "INFO: Starting routing..."
    route_design

    # Final reports
    report_timing_summary -file ${output_dir}/timing_final.rpt
    report_utilization -file ${output_dir}/utilization.rpt

    # Write outputs
    write_checkpoint -force ${output_dir}/post_route.dcp
    write_bitstream -force ${output_dir}/${top_module}.bit

    puts "INFO: Build complete"
}
```

## Example: Timing Analysis

```tcl
# analyze_timing.tcl - Extract timing metrics

proc analyze_timing_paths {report_file {num_paths 100}} {
    # Get worst setup paths
    set setup_paths [get_timing_paths -max_paths $num_paths -setup]

    set fh [open $report_file w]
    puts $fh "Path Analysis Report"
    puts $fh [string repeat "=" 60]
    puts $fh ""

    set path_num 1
    foreach path $setup_paths {
        set slack [get_property SLACK $path]
        set src [get_property STARTPOINT_PIN $path]
        set dst [get_property ENDPOINT_PIN $path]
        set levels [get_property LOGIC_LEVELS $path]

        puts $fh "Path $path_num:"
        puts $fh "  Slack: [format %.3f $slack] ns"
        puts $fh "  From:  $src"
        puts $fh "  To:    $dst"
        puts $fh "  Logic Levels: $levels"
        puts $fh ""

        incr path_num
    }

    close $fh

    # Summary
    set wns [get_property SLACK [lindex $setup_paths 0]]
    set tns 0
    foreach path $setup_paths {
        set slack [get_property SLACK $path]
        if {$slack < 0} {
            set tns [expr {$tns + $slack}]
        }
    }

    puts "Timing Summary:"
    puts "  WNS: [format %.3f $wns] ns"
    puts "  TNS: [format %.3f $tns] ns"

    return [expr {$wns >= 0}]
}
```

## Example: Constraint Generation

```tcl
# generate_constraints.tcl - Auto-generate XDC from design

proc generate_clock_constraints {output_file} {
    set fh [open $output_file w]

    puts $fh "# Auto-generated clock constraints"
    puts $fh "# Generated: [clock format [clock seconds]]"
    puts $fh ""

    # Find all clock nets
    set clocks [get_clocks]

    foreach clk $clocks {
        set period [get_property PERIOD $clk]
        set src [get_property SOURCE $clk]
        set name [get_property NAME $clk]

        puts $fh "# Clock: $name"
        puts $fh "create_clock -period $period -name $name \[get_ports $src\]"
        puts $fh ""
    }

    # Find derived clocks (MMCMs, PLLs)
    set mmcms [get_cells -hier -filter {REF_NAME =~ MMCME*}]
    foreach mmcm $mmcms {
        puts $fh "# MMCM: $mmcm"
        puts $fh "# Outputs auto-derived by tool"
        puts $fh ""
    }

    close $fh
    puts "Generated constraints: $output_file"
}
```

## Makefile Integration

```makefile
# Makefile for FPGA build

TOP_MODULE := my_design
PART := xczu9eg-ffvb1156-2-e
SOURCES := $(wildcard src/*.sv) $(wildcard src/*.v)
CONSTRAINTS := constraints/timing.xdc constraints/pins.xdc

.PHONY: all synth impl bit clean

all: bit

synth: build/post_synth.dcp

impl: build/post_route.dcp

bit: build/$(TOP_MODULE).bit

build/$(TOP_MODULE).bit: $(SOURCES) $(CONSTRAINTS)
	@mkdir -p build
	vivado -mode batch -source scripts/vivado_build.tcl \
		-tclargs $(TOP_MODULE) "$(SOURCES)" "$(CONSTRAINTS)" build

clean:
	rm -rf build .Xil vivado*.log vivado*.jou
```

## Status

**Current**: In use for all production builds
**Next**: Adding Yosys/nextpnr support for open-source flows

---

*Questions? [hello@bitwiz.io](mailto:hello@bitwiz.io)*
