// Timing Budget Calculator
// Formula: t_logic = t_period - t_setup - t_uncertainty - t_clk_to_q

const TimingCalc = {
  elements: {},

  init() {
    this.elements = {
      freq: document.getElementById('timing-freq'),
      tsetup: document.getElementById('timing-tsetup'),
      tuncert: document.getElementById('timing-tuncert'),
      tclkq: document.getElementById('timing-tclkq'),
      tlut: document.getElementById('timing-tlut'),
      period: document.getElementById('timing-period'),
      available: document.getElementById('timing-available'),
      levels: document.getElementById('timing-levels')
    };

    // Bind input events
    const inputs = [this.elements.freq, this.elements.tsetup,
                    this.elements.tuncert, this.elements.tclkq,
                    this.elements.tlut];
    inputs.forEach(input => {
      input.addEventListener('input', () => this.calculate());
    });

    // Initial calculation
    this.calculate();
  },

  calculate() {
    const freq = parseFloat(this.elements.freq.value) || 0;        // MHz
    const tSetup = parseFloat(this.elements.tsetup.value) || 0;    // ns
    const tUncert = parseFloat(this.elements.tuncert.value) || 0;  // ns
    const tClkQ = parseFloat(this.elements.tclkq.value) || 0;      // ns
    const tLut = parseFloat(this.elements.tlut.value) || 0;        // ns

    if (freq <= 0) {
      this.elements.period.textContent = '--';
      this.elements.available.textContent = '--';
      this.elements.levels.textContent = '--';
      return;
    }

    // Calculate period from frequency
    const period = 1000 / freq;  // ns (1000 MHz = 1ns)

    // Available time for logic
    const available = period - tSetup - tUncert - tClkQ;

    // Display period
    this.elements.period.textContent = period.toFixed(3) + ' ns';

    // Display available time
    if (available <= 0) {
      this.elements.available.textContent = 'Negative slack!';
      this.elements.available.className = 'result-value error';
      this.elements.levels.textContent = '0';
      this.elements.levels.className = 'result-value error';
    } else {
      this.elements.available.textContent = available.toFixed(3) + ' ns';
      this.elements.available.className = 'result-value';

      // Estimate logic levels
      if (tLut > 0) {
        const levels = Math.floor(available / tLut);
        this.elements.levels.textContent = levels + ' LUTs';
        this.elements.levels.className = 'result-value';
      } else {
        this.elements.levels.textContent = '--';
        this.elements.levels.className = 'result-value';
      }
    }
  },

  getState() {
    return {
      freq: this.elements.freq.value,
      tsetup: this.elements.tsetup.value,
      tuncert: this.elements.tuncert.value,
      tclkq: this.elements.tclkq.value,
      tlut: this.elements.tlut.value
    };
  },

  setState(state) {
    if (state.freq !== undefined) this.elements.freq.value = state.freq;
    if (state.tsetup !== undefined) this.elements.tsetup.value = state.tsetup;
    if (state.tuncert !== undefined) this.elements.tuncert.value = state.tuncert;
    if (state.tclkq !== undefined) this.elements.tclkq.value = state.tclkq;
    if (state.tlut !== undefined) this.elements.tlut.value = state.tlut;
    this.calculate();
  }
};
