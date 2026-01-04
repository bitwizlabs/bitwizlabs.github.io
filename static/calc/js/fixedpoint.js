// Fixed-Point Precision Calculator
// Formula:
//   integer_bits = ceil(log2(max(|min|, |max|))) + sign_bit
//   fractional_bits = ceil(-log2(precision))

const FixedPointCalc = {
  elements: {},

  init() {
    this.elements = {
      min: document.getElementById('fp-min'),
      max: document.getElementById('fp-max'),
      precision: document.getElementById('fp-precision'),
      signed: document.getElementById('fp-signed'),
      intBits: document.getElementById('fp-int-bits'),
      fracBits: document.getElementById('fp-frac-bits'),
      totalBits: document.getElementById('fp-total-bits'),
      qNotation: document.getElementById('fp-q-notation'),
      actualRange: document.getElementById('fp-actual-range'),
      actualPrecision: document.getElementById('fp-actual-precision')
    };

    // Bind input events
    const inputs = [this.elements.min, this.elements.max,
                    this.elements.precision, this.elements.signed];
    inputs.forEach(input => {
      input.addEventListener('input', () => this.calculate());
      input.addEventListener('change', () => this.calculate());
    });

    // Initial calculation
    this.calculate();
  },

  calculate() {
    const minVal = parseFloat(this.elements.min.value);
    const maxVal = parseFloat(this.elements.max.value);
    const precision = parseFloat(this.elements.precision.value) || 0;
    const isSigned = this.elements.signed.checked;

    if (isNaN(minVal) || isNaN(maxVal) || precision <= 0) {
      this.clearResults();
      return;
    }

    // Validate range
    if (minVal > maxVal) {
      this.clearResults();
      return;
    }

    // For unsigned, check for negative values
    if (!isSigned && minVal < 0) {
      this.elements.intBits.textContent = 'Error: negative min';
      this.elements.intBits.className = 'result-value error';
      this.elements.fracBits.textContent = '--';
      this.elements.totalBits.textContent = '--';
      this.elements.actualRange.textContent = '--';
      this.elements.actualPrecision.textContent = '--';
      return;
    }

    // Calculate integer bits needed
    // For signed: need to represent -2^(n-1) to 2^(n-1)-1
    // For unsigned: need to represent 0 to 2^n - 1
    const maxAbsVal = Math.max(Math.abs(minVal), Math.abs(maxVal));

    let intBits;
    if (maxAbsVal === 0) {
      intBits = 0;
    } else if (isSigned) {
      // For signed, we need ceil(log2(maxAbsVal + 1)) bits for magnitude
      // Plus 1 for sign, but that's included in two's complement representation
      // Actually for two's complement: if we need to represent value V
      // We need n bits where 2^(n-1) > V (for positive) or 2^(n-1) >= |V| (for negative)
      intBits = Math.ceil(Math.log2(maxAbsVal + 1)) + 1;
    } else {
      // For unsigned: need n bits where 2^n > maxVal
      intBits = Math.ceil(Math.log2(maxAbsVal + 1));
    }

    // Ensure at least 1 integer bit for unsigned, or handle zero case
    if (intBits < 1 && !isSigned) {
      intBits = 1;
    }
    if (intBits < 1 && isSigned) {
      intBits = 1; // At minimum need 1 bit for sign
    }

    // Calculate fractional bits needed
    // LSB weight = 2^(-fracBits) <= precision
    // -fracBits <= log2(precision)
    // fracBits >= -log2(precision)
    const fracBits = Math.ceil(-Math.log2(precision));

    // Total bits
    const totalBits = intBits + fracBits;

    // Calculate actual range achieved
    let actualMin, actualMax;
    if (isSigned) {
      actualMin = -(Math.pow(2, intBits - 1));
      actualMax = Math.pow(2, intBits - 1) - Math.pow(2, -fracBits);
    } else {
      actualMin = 0;
      actualMax = Math.pow(2, intBits) - Math.pow(2, -fracBits);
    }

    // Actual precision (LSB weight)
    const actualPrecision = Math.pow(2, -fracBits);

    // Display results
    this.elements.intBits.textContent = intBits;
    this.elements.intBits.className = 'result-value';
    this.elements.fracBits.textContent = fracBits;
    this.elements.totalBits.textContent = totalBits + ' bits';

    // Q notation: Qm.n (unsigned) or SQm.n / Qm.n with sign (signed)
    // m = integer bits (excluding sign for signed), n = fractional bits
    const qInt = isSigned ? intBits - 1 : intBits;
    const prefix = isSigned ? 'S' : 'U';
    this.elements.qNotation.textContent = prefix + 'Q' + qInt + '.' + fracBits;

    this.elements.actualRange.textContent =
      '[' + this.formatNumber(actualMin) + ', ' + this.formatNumber(actualMax) + ']';
    this.elements.actualPrecision.textContent = this.formatNumber(actualPrecision);
  },

  formatNumber(n) {
    if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.001 && n !== 0)) {
      return n.toExponential(3);
    }
    // Remove trailing zeros
    return parseFloat(n.toPrecision(6)).toString();
  },

  clearResults() {
    this.elements.intBits.textContent = '--';
    this.elements.intBits.className = 'result-value';
    this.elements.fracBits.textContent = '--';
    this.elements.totalBits.textContent = '--';
    this.elements.qNotation.textContent = '--';
    this.elements.actualRange.textContent = '--';
    this.elements.actualPrecision.textContent = '--';
  },

  getState() {
    return {
      min: this.elements.min.value,
      max: this.elements.max.value,
      precision: this.elements.precision.value,
      signed: this.elements.signed.checked ? '1' : '0'
    };
  },

  setState(state) {
    if (state.min !== undefined) this.elements.min.value = state.min;
    if (state.max !== undefined) this.elements.max.value = state.max;
    if (state.precision !== undefined) this.elements.precision.value = state.precision;
    if (state.signed !== undefined) this.elements.signed.checked = state.signed === '1';
    this.calculate();
  }
};
