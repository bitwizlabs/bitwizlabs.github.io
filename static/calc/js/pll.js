// PLL/MMCM Configuration Calculator
// Formula:
//   f_out = f_in × M / (D × O)
//   f_vco = f_in × M / D

const PllCalc = {
  elements: {},

  init() {
    this.elements = {
      fin: document.getElementById('pll-fin'),
      fout: document.getElementById('pll-fout'),
      vcoMin: document.getElementById('pll-vco-min'),
      vcoMax: document.getElementById('pll-vco-max'),
      mMax: document.getElementById('pll-m-max'),
      dMax: document.getElementById('pll-d-max'),
      oMax: document.getElementById('pll-o-max'),
      results: document.getElementById('pll-results')
    };

    // Bind input events
    const inputs = [this.elements.fin, this.elements.fout,
                    this.elements.vcoMin, this.elements.vcoMax,
                    this.elements.mMax, this.elements.dMax,
                    this.elements.oMax];
    inputs.forEach(input => {
      input.addEventListener('input', () => this.calculate());
    });

    // Initial calculation
    this.calculate();
  },

  calculate() {
    const fIn = parseFloat(this.elements.fin.value) || 0;
    const fOutTarget = parseFloat(this.elements.fout.value) || 0;
    const vcoMin = parseFloat(this.elements.vcoMin.value) || 0;
    const vcoMax = parseFloat(this.elements.vcoMax.value) || 0;
    const mMax = parseInt(this.elements.mMax.value) || 64;
    const dMax = parseInt(this.elements.dMax.value) || 10;
    const oMax = parseInt(this.elements.oMax.value) || 128;

    if (fIn <= 0 || fOutTarget <= 0 || vcoMin <= 0 || vcoMax <= 0) {
      this.elements.results.innerHTML = '<p class="placeholder">Enter values to calculate...</p>';
      return;
    }

    if (vcoMin > vcoMax) {
      this.elements.results.innerHTML = '<p class="no-results">VCO min > max</p>';
      return;
    }

    // Find all valid configurations
    const configs = [];
    const maxConfigs = 50; // Limit results

    // PFD frequency limits (typical for most PLLs)
    const pfdMin = 10;   // MHz - minimum PFD frequency
    const pfdMax = 450;  // MHz - maximum PFD frequency

    for (let d = 1; d <= dMax && configs.length < maxConfigs; d++) {
      // Check PFD frequency (f_in / D)
      const fPfd = fIn / d;
      const pfdValid = fPfd >= pfdMin && fPfd <= pfdMax;

      for (let m = 2; m <= mMax && configs.length < maxConfigs; m++) {
        const fVco = fIn * m / d;

        // Check VCO range
        if (fVco < vcoMin || fVco > vcoMax) continue;

        for (let o = 1; o <= oMax && configs.length < maxConfigs; o++) {
          const fOut = fVco / o;
          const errorPpm = Math.abs((fOut - fOutTarget) / fOutTarget) * 1e6;

          // Only include if within 1% of target
          if (errorPpm <= 10000) {
            configs.push({
              m: m,
              d: d,
              o: o,
              fVco: fVco,
              fPfd: fPfd,
              fOut: fOut,
              errorPpm: errorPpm,
              exact: errorPpm < 0.1,
              pfdValid: pfdValid
            });
          }
        }
      }
    }

    // Sort by error
    configs.sort((a, b) => a.errorPpm - b.errorPpm);

    // Take top results
    const topConfigs = configs.slice(0, 15);

    if (topConfigs.length === 0) {
      this.elements.results.innerHTML = '<p class="no-results">No valid configurations found</p>';
      return;
    }

    // Build results table
    let html = `
      <table>
        <thead>
          <tr>
            <th>M</th>
            <th>D</th>
            <th>O</th>
            <th>PFD</th>
            <th>VCO</th>
            <th>Output</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
    `;

    topConfigs.forEach(cfg => {
      let rowClass = cfg.exact ? 'exact' : '';
      if (!cfg.pfdValid) rowClass += ' pfd-warning';
      const classAttr = rowClass ? ` class="${rowClass.trim()}"` : '';
      const pfdWarning = cfg.pfdValid ? '' : ' *';
      html += `
        <tr${classAttr}>
          <td>${cfg.m}</td>
          <td>${cfg.d}</td>
          <td>${cfg.o}</td>
          <td>${cfg.fPfd.toFixed(1)}${pfdWarning}</td>
          <td>${cfg.fVco.toFixed(1)}</td>
          <td>${cfg.fOut.toFixed(4)}</td>
          <td>${cfg.errorPpm < 0.1 ? 'exact' : cfg.errorPpm.toFixed(1)}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    // Add PFD warning note if any configs have invalid PFD
    const hasInvalidPfd = topConfigs.some(c => !c.pfdValid);
    if (hasInvalidPfd) {
      html += `<p class="pfd-note">* PFD outside typical 10-450 MHz range</p>`;
    }

    if (configs.length > 15) {
      html += `<p style="margin-top: 0.5rem; opacity: 0.6;">Showing 15 of ${configs.length} valid configurations</p>`;
    }

    this.elements.results.innerHTML = html;
  },

  getState() {
    return {
      fin: this.elements.fin.value,
      fout: this.elements.fout.value,
      vcomin: this.elements.vcoMin.value,
      vcomax: this.elements.vcoMax.value,
      mmax: this.elements.mMax.value,
      dmax: this.elements.dMax.value,
      omax: this.elements.oMax.value
    };
  },

  setState(state) {
    if (state.fin !== undefined) this.elements.fin.value = state.fin;
    if (state.fout !== undefined) this.elements.fout.value = state.fout;
    if (state.vcomin !== undefined) this.elements.vcoMin.value = state.vcomin;
    if (state.vcomax !== undefined) this.elements.vcoMax.value = state.vcomax;
    if (state.mmax !== undefined) this.elements.mMax.value = state.mmax;
    if (state.dmax !== undefined) this.elements.dMax.value = state.dmax;
    if (state.omax !== undefined) this.elements.oMax.value = state.omax;
    this.calculate();
  }
};
