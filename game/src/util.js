// Shared math: no allocations in the hot paths. Every helper that runs per frame
// writes into a caller-owned scratch object instead of returning a fresh one.
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Slab test: does the segment p0->p1 touch the axis-aligned box? Writes the
// entry fraction (0..1) into out.t, or -1 when there is no hit. Used for bullets,
// line of sight and grenade bounces, all against the same world boxes.
export function segmentBox(px, py, pz, dx, dy, dz, box, out) {
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [px, dx, box.min.x, box.max.x],
    [py, dy, box.min.y, box.max.y],
    [pz, dz, box.min.z, box.max.z],
  ];
  for (let i = 0; i < 3; i += 1) {
    const o = axes[i][0];
    const d = axes[i][1];
    const lo = axes[i][2];
    const hi = axes[i][3];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) {
        out.t = -1;
        return false;
      }
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) {
        out.t = -1;
        return false;
      }
    }
  }
  out.t = tmin;
  return true;
}

// Ray against a sphere (head hitbox). Writes entry distance into out.t.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, out) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) {
    out.t = -1;
    return false;
  }
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) {
    out.t = -1;
    return false;
  }
  out.t = tca - Math.sqrt(r2 - d2);
  return out.t >= 0;
}

// 2D (XZ) segment vs box, for line of sight: a wall blocks sight only if it is
// tall enough to cover both eye heights, so the caller passes the lower eye.
export function segmentBlocksSight(x0, z0, x1, z1, box, eyeY) {
  if (box.max.y < eyeY - 0.4) return false;
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [x0, dx, box.min.x, box.max.x],
    [z0, dz, box.min.z, box.max.z],
  ];
  for (let i = 0; i < 2; i += 1) {
    const o = axes[i][0];
    const d = axes[i][1];
    const lo = axes[i][2];
    const hi = axes[i][3];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}
