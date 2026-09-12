export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const inverseLerp = (a: number, b: number, v: number): number => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = inverseLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential damping. `lambda` ~ speed; higher = snappier. */
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;
/** Shortest signed angular difference b - a, in radians (-PI..PI]. */
export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export const dampAngle = (a: number, b: number, lambda: number, dt: number): number => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
export const fract = (v: number): number => v - Math.floor(v);
export const hash2 = (x: number, y: number): number => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
