// Tiny deterministic RNG (mulberry32). If no seed provided, falls back to Math.random.
export type Rng = () => number;

export function makeRng(seed?: number): Rng {
  if (seed === undefined) return Math.random;
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}