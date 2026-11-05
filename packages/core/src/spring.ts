export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

/** Closed-form damped spring, 0 → 1, zero initial velocity. t in seconds. */
function position(t: number, k: number, c: number, m: number): number {
  const w0 = Math.sqrt(k / m);
  const z = c / (2 * Math.sqrt(k * m));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const s = w0 * Math.sqrt(z * z - 1);
  const r1 = -z * w0 + s;
  const r2 = -z * w0 - s;
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/**
 * Bake a spring into a CSS `linear()` easing so the browser animates it
 * (transitions/keyframes) with no per-frame JS.
 */
export function springEasing(config: SpringConfig = {}): { easing: string; duration: number } {
  const { stiffness = 170, damping = 18, mass = 1 } = config;
  const f = (t: number) => position(t, stiffness, damping, mass);
  const dt = 1 / 120;
  const maxT = 5;
  // settle time = last instant the spring is still more than 0.1% away from rest
  let settle = 0;
  for (let t = 0; t <= maxT; t += dt) if (Math.abs(1 - f(t)) > 0.001) settle = t;
  settle = Math.max(settle + dt, 0.05);
  const steps = Math.max(2, Math.ceil(settle * 60));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) pts.push(String(+f((i / steps) * settle).toFixed(4)));
  pts[steps] = '1';
  return { easing: `linear(${pts.join(',')})`, duration: Math.round(settle * 1000) };
}
