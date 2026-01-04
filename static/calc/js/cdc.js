// CDC MTBF Calculator
// Formula: MTBF = exp(t_resolve / τ) / (f_data × f_sample × T_window)
// Where t_resolve = (clock_period - setup_time - routing_delay) × stages

const CdcCalc = {
  elements: {},

  init() {
    this.elements = {
      fdata: document.getElementById('cdc-fdata'),
      fsample: document.getElementById('cdc-fsample'),
      twindow: document.getElementById('cdc-twindow'),
      tau: document.getElementById('cdc-tau'),
      stages: document.getElementById('cdc-stages'),
      tsetup: document.getElementById('cdc-tsetup'),
      trouting: document.getElementById('cdc-trouting'),
      tresolve: document.getElementById('cdc-tresolve'),
      mtbf: document.getElementById('cdc-mtbf'),
      recommendation: document.getElementById('cdc-recommendation')
    };

    // Bind input events
    const inputs = [this.elements.fdata, this.elements.fsample,
                    this.elements.twindow, this.elements.tau,
                    this.elements.stages, this.elements.tsetup,
                    this.elements.trouting];
    inputs.forEach(input => {
      input.addEventListener('input', () => this.calculate());
    });

    // Initial calculation
    this.calculate();
  },

  calculate() {
    const fData = parseFloat(this.elements.fdata.value) || 0;      // MHz
    const fSample = parseFloat(this.elements.fsample.value) || 0;  // MHz
    const tWindow = parseFloat(this.elements.twindow.value) || 0;  // ps
    const tau = parseFloat(this.elements.tau.value) || 0;          // ps
    const stages = parseInt(this.elements.stages.value) || 2;
    const tSetup = parseFloat(this.elements.tsetup.value) || 0;    // ns
    const tRouting = parseFloat(this.elements.trouting.value) || 0; // ns

    if (fData <= 0 || fSample <= 0 || tWindow <= 0 || tau <= 0) {
      this.elements.tresolve.textContent = '--';
      this.elements.mtbf.textContent = '--';
      this.elements.recommendation.textContent = '--';
      return;
    }

    // Convert units
    const fDataHz = fData * 1e6;           // Hz
    const fSampleHz = fSample * 1e6;       // Hz
    const tWindowSec = tWindow * 1e-12;    // seconds
    const tauSec = tau * 1e-12;            // seconds
    const tSetupSec = tSetup * 1e-9;       // seconds

    // Clock period of sampling clock
    const tPeriod = 1 / fSampleHz;

    // Available resolution time per synchronizer stage
    // Each stage gets roughly one clock period minus setup time minus routing
    const tRoutingSec = tRouting * 1e-9;  // Convert ns to seconds
    const tResolvePerStage = tPeriod - tSetupSec - tRoutingSec;
    const tResolve = tResolvePerStage * stages;

    // MTBF calculation
    // MTBF = exp(t_resolve / tau) / (f_data * f_sample * T_window)
    const exponent = tResolve / tauSec;
    const mtbfSeconds = Math.exp(exponent) / (fDataHz * fSampleHz * tWindowSec);

    // Display resolution time
    this.elements.tresolve.textContent = (tResolve * 1e9).toFixed(2) + ' ns';

    // Format MTBF for display
    this.elements.mtbf.textContent = this.formatMtbf(mtbfSeconds);
    this.elements.mtbf.className = 'result-value';

    // Recommendation
    const yearsThreshold = 1000; // 1000 years is typically acceptable
    const mtbfYears = mtbfSeconds / (365.25 * 24 * 3600);

    if (mtbfYears >= yearsThreshold) {
      this.elements.recommendation.textContent = stages + ' stages OK';
      this.elements.recommendation.className = 'result-value';
    } else if (mtbfYears >= 1) {
      this.elements.recommendation.textContent = 'Consider ' + (stages + 1) + ' stages';
      this.elements.recommendation.className = 'result-value warning';
    } else {
      this.elements.recommendation.textContent = 'Add more stages!';
      this.elements.recommendation.className = 'result-value error';
    }
  },

  formatMtbf(seconds) {
    const minute = 60;
    const hour = 3600;
    const day = 86400;
    const year = 365.25 * day;

    if (seconds < minute) {
      return seconds.toFixed(2) + ' seconds';
    } else if (seconds < hour) {
      return (seconds / minute).toFixed(2) + ' minutes';
    } else if (seconds < day) {
      return (seconds / hour).toFixed(2) + ' hours';
    } else if (seconds < year) {
      return (seconds / day).toFixed(2) + ' days';
    } else if (seconds < 1000 * year) {
      return (seconds / year).toFixed(2) + ' years';
    } else if (seconds < 1e6 * year) {
      return (seconds / (1000 * year)).toFixed(2) + 'k years';
    } else if (seconds < 1e9 * year) {
      return (seconds / (1e6 * year)).toFixed(2) + 'M years';
    } else if (seconds < 1e12 * year) {
      return (seconds / (1e9 * year)).toFixed(2) + 'B years';
    } else {
      // Use scientific notation for very large values
      const yearsVal = seconds / year;
      return yearsVal.toExponential(2) + ' years';
    }
  },

  getState() {
    return {
      fdata: this.elements.fdata.value,
      fsample: this.elements.fsample.value,
      twindow: this.elements.twindow.value,
      tau: this.elements.tau.value,
      stages: this.elements.stages.value,
      tsetup: this.elements.tsetup.value,
      trouting: this.elements.trouting.value
    };
  },

  setState(state) {
    if (state.fdata !== undefined) this.elements.fdata.value = state.fdata;
    if (state.fsample !== undefined) this.elements.fsample.value = state.fsample;
    if (state.twindow !== undefined) this.elements.twindow.value = state.twindow;
    if (state.tau !== undefined) this.elements.tau.value = state.tau;
    if (state.stages !== undefined) this.elements.stages.value = state.stages;
    if (state.tsetup !== undefined) this.elements.tsetup.value = state.tsetup;
    if (state.trouting !== undefined) this.elements.trouting.value = state.trouting;
    this.calculate();
  }
};
