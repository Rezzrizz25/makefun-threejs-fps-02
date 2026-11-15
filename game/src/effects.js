// Effects: tracers, impact sparks, explosions and smoke. Everything is pooled
// up front — a tracer is a stretched box from a pool of 24, a spark is one of
// 60 small tetrahedra — so a firefight allocates nothing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 1 });
  const sparks = [];
  for (let i = 0; i < 60; i += 1) {
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05), sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let sparkIndex = 0;

  const boomLight = new THREE.PointLight(new THREE.Color('#ff7a2e'), 0, 30);
  scene.add(boomLight);
  const boomSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9d2e'), transparent: true, opacity: 0, depthWrite: false }),
  );
  boomSphere.visible = false;
  scene.add(boomSphere);
  let boomLife = 0;

  const smokeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a8a86'), transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  const smokeMeshes = [];
  for (let i = 0; i < 6; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), smokeMat);
    mesh.visible = false;
    scene.add(mesh);
    smokeMeshes.push(mesh);
  }

  return {
    tracer(from, to) {
      const t = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % tracers.length;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dy, dz) || 0.001;
      t.mesh.position.set(from.x + dx / 2, from.y + dy / 2, from.z + dz / 2);
      t.mesh.lookAt(to.x, to.y, to.z);
      t.mesh.scale.set(1, 1, len);
      t.mesh.visible = true;
      t.life = 0.07;
    },
    impact(point, count = 6) {
      for (let i = 0; i < count; i += 1) {
        const s = sparks[sparkIndex];
        sparkIndex = (sparkIndex + 1) % sparks.length;
        s.mesh.position.copy(point);
        s.mesh.visible = true;
        s.life = 0.35 + Math.random() * 0.2;
        s.vx = (Math.random() - 0.5) * 5;
        s.vy = Math.random() * 3 + 1;
        s.vz = (Math.random() - 0.5) * 5;
      }
    },
    explosion(point) {
      boomLight.position.copy(point);
      boomLight.intensity = 60;
      boomSphere.position.copy(point);
      boomSphere.visible = true;
      boomSphere.scale.setScalar(0.5);
      boomLife = 0.5;
      this.impact(point, 30);
    },
    syncSmoke(smokes) {
      for (let i = 0; i < smokeMeshes.length; i += 1) {
        const mesh = smokeMeshes[i];
        if (i < smokes.length) {
          mesh.visible = true;
          mesh.position.set(smokes[i].x, 1.4, smokes[i].z);
          const pulse = 1 + Math.sin(performance.now() * 0.001 + i) * 0.05;
          mesh.scale.setScalar(pulse);
        } else {
          mesh.visible = false;
        }
      }
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.vy -= 9 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        if (s.life <= 0 || s.mesh.position.y < 0.02) s.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = Math.max(0, boomLife / 0.5);
        boomLight.intensity = 60 * k;
        boomSphere.scale.setScalar(0.5 + (1 - k) * 7);
        boomSphere.material.opacity = 0.55 * k;
        if (boomLife <= 0) {
          boomSphere.visible = false;
          boomLight.intensity = 0;
        }
      }
    },
  };
}
