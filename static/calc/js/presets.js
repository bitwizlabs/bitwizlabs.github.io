// Device presets for Xilinx and Intel FPGAs

const DevicePresets = {
  // CDC MTBF parameters (typical speed grade estimates)
  cdc: {
    'xilinx-7series': {
      name: 'Xilinx 7-Series (-1)',
      twindow: 40,    // ps
      tau: 18,        // ps
      tsetup: 0.06    // ns
    },
    'xilinx-ultrascale': {
      name: 'Xilinx UltraScale (-1)',
      twindow: 35,
      tau: 12,
      tsetup: 0.04
    },
    'xilinx-ultrascale+': {
      name: 'Xilinx UltraScale+ (-1)',
      twindow: 30,
      tau: 10,
      tsetup: 0.035
    },
    'intel-cyclone-v': {
      name: 'Intel Cyclone V (C7)',
      twindow: 55,
      tau: 22,
      tsetup: 0.08
    },
    'intel-cyclone-10': {
      name: 'Intel Cyclone 10 (C8)',
      twindow: 50,
      tau: 20,
      tsetup: 0.07
    },
    'intel-arria-10': {
      name: 'Intel Arria 10 (-1)',
      twindow: 40,
      tau: 15,
      tsetup: 0.05
    },
    'intel-stratix-10': {
      name: 'Intel Stratix 10 (-1)',
      twindow: 35,
      tau: 12,
      tsetup: 0.04
    }
  },

  // Timing budget parameters (typical speed grade, includes routing estimates)
  timing: {
    'xilinx-7series': {
      name: 'Xilinx 7-Series (-1)',
      tsetup: 0.06,   // ns
      tuncert: 0.1,   // ns (typical PLL jitter)
      tclkq: 0.2,     // ns
      tlut: 0.18      // ns (LUT + routing estimate)
    },
    'xilinx-ultrascale': {
      name: 'Xilinx UltraScale (-1)',
      tsetup: 0.04,
      tuncert: 0.08,
      tclkq: 0.15,
      tlut: 0.14
    },
    'xilinx-ultrascale+': {
      name: 'Xilinx UltraScale+ (-1)',
      tsetup: 0.035,
      tuncert: 0.07,
      tclkq: 0.12,
      tlut: 0.11
    },
    'intel-cyclone-v': {
      name: 'Intel Cyclone V (C7)',
      tsetup: 0.08,
      tuncert: 0.12,
      tclkq: 0.25,
      tlut: 0.2
    },
    'intel-cyclone-10': {
      name: 'Intel Cyclone 10 (C8)',
      tsetup: 0.07,
      tuncert: 0.1,
      tclkq: 0.22,
      tlut: 0.18
    },
    'intel-arria-10': {
      name: 'Intel Arria 10 (-1)',
      tsetup: 0.05,
      tuncert: 0.08,
      tclkq: 0.15,
      tlut: 0.12
    },
    'intel-stratix-10': {
      name: 'Intel Stratix 10 (-1)',
      tsetup: 0.04,
      tuncert: 0.07,
      tclkq: 0.12,
      tlut: 0.09
    }
  },

  // PLL/MMCM parameters
  pll: {
    'xilinx-7series-mmcm': {
      name: 'Xilinx 7-Series MMCM',
      vcoMin: 600,
      vcoMax: 1200,   // -1 speed grade
      mMax: 64,
      dMax: 106,
      oMax: 128
    },
    'xilinx-7series-pll': {
      name: 'Xilinx 7-Series PLL',
      vcoMin: 800,
      vcoMax: 1600,
      mMax: 64,
      dMax: 56,
      oMax: 128
    },
    'xilinx-ultrascale-mmcm': {
      name: 'Xilinx UltraScale MMCM',
      vcoMin: 800,
      vcoMax: 1600,
      mMax: 128,
      dMax: 106,
      oMax: 128
    },
    'xilinx-ultrascale+-mmcm': {
      name: 'Xilinx UltraScale+ MMCM',
      vcoMin: 800,
      vcoMax: 1600,
      mMax: 128,
      dMax: 106,
      oMax: 128
    },
    'intel-cyclone-v': {
      name: 'Intel Cyclone V PLL',
      vcoMin: 600,
      vcoMax: 1300,
      mMax: 512,
      dMax: 512,
      oMax: 512
    },
    'intel-cyclone-10': {
      name: 'Intel Cyclone 10 PLL',
      vcoMin: 600,
      vcoMax: 1300,
      mMax: 512,
      dMax: 512,
      oMax: 512
    },
    'intel-arria-10': {
      name: 'Intel Arria 10 PLL',
      vcoMin: 500,
      vcoMax: 1500,
      mMax: 160,
      dMax: 80,
      oMax: 128
    },
    'intel-stratix-10': {
      name: 'Intel Stratix 10 PLL',
      vcoMin: 500,
      vcoMax: 1500,
      mMax: 160,
      dMax: 80,
      oMax: 128
    }
  },

  // Get preset options HTML for a calculator type
  getOptionsHtml(calcType) {
    const presets = this[calcType];
    if (!presets) return '';

    let html = '<option value="">-- Select Device --</option>';

    // Group by vendor
    const xilinx = [];
    const intel = [];

    Object.entries(presets).forEach(([key, preset]) => {
      const option = `<option value="${key}">${preset.name}</option>`;
      if (key.startsWith('xilinx')) {
        xilinx.push(option);
      } else {
        intel.push(option);
      }
    });

    if (xilinx.length) {
      html += '<optgroup label="Xilinx/AMD">' + xilinx.join('') + '</optgroup>';
    }
    if (intel.length) {
      html += '<optgroup label="Intel/Altera">' + intel.join('') + '</optgroup>';
    }

    return html;
  },

  // Apply a preset to a calculator
  apply(calcType, presetKey, calculator) {
    const preset = this[calcType]?.[presetKey];
    if (!preset || !calculator) return;

    // Map preset values to calculator setState format
    const stateMap = {
      cdc: {
        twindow: 'twindow',
        tau: 'tau',
        tsetup: 'tsetup'
      },
      timing: {
        tsetup: 'tsetup',
        tuncert: 'tuncert',
        tclkq: 'tclkq',
        tlut: 'tlut'
      },
      pll: {
        vcoMin: 'vcomin',
        vcoMax: 'vcomax',
        mMax: 'mmax',
        dMax: 'dmax',
        oMax: 'omax'
      }
    };

    const mapping = stateMap[calcType];
    const state = {};

    Object.entries(mapping).forEach(([presetKey, stateKey]) => {
      if (preset[presetKey] !== undefined) {
        state[stateKey] = preset[presetKey];
      }
    });

    calculator.setState(state);
  }
};
