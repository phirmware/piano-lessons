// Monophonic pitch detection using the YIN algorithm
// (de Cheveigné & Kawahara, 2002). Pure function so it can run in Node tests.

export function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/**
 * @param {Float32Array} buf mono samples
 * @param {number} sampleRate
 * @returns {{ freq: number, clarity: number } | null}
 */
export function detectPitch(buf, sampleRate, { minFreq = 55, maxFreq = 2400, threshold = 0.12, maxWindow = 2048 } = {}) {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(buf.length / 2));
  const W = Math.min(maxWindow, buf.length - tauMax);
  const start = buf.length - (W + tauMax); // use the most recent samples
  if (W <= 0 || tauMax <= tauMin) return null;

  // Difference function and cumulative mean normalized difference.
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[start + j] - buf[start + j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // First dip below threshold, followed down to its local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  // Otherwise fall back to the global minimum if it's reasonably periodic.
  if (tau === -1) {
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.35) return null;
    tau = best;
  }
  if (tau >= tauMax) return null;

  // Parabolic interpolation for sub-sample accuracy.
  const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const betterTau = tau + Math.max(-1, Math.min(1, shift));

  return { freq: sampleRate / betterTau, clarity: 1 - b };
}
