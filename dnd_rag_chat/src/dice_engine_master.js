/**
 * D&D 2024 Realistic 3D Polyhedral Dice Physics & Audio Arena
 * Based on the industry-standard Teal Dice engine & Cannon-es rigid-body physics.
 * 
 * Features:
 * - Genuine chamfered polyhedral geometries for d4, d6, d8, d10, d12, d20, d100
 * - Crisp, high-DPI engraved numerals UV-mapped directly to face geometry
 * - Deep gemstone & marbled resin aesthetics with gold & silver inlay
 * - Cannon-es SAT convex polyhedron collisions (no clipping, no sliding)
 * - Mahogany felt tray with boundary bounce physics
 * - Web Audio API procedural felt thuds, resin clacks, and crit fanfares
 * - Snappy settling (<1.5s) and automatic anti-overlapping 3D score badges
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ============================================================================
// 1. PROCEDURAL WEB AUDIO SYNTHESIZER
// ============================================================================
class DiceAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playImpact(intensity = 0.5) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const vol = Math.min(1.0, Math.max(0.08, intensity));

    // Felt thud (filtered noise burst)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.035);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100 + Math.random() * 400, t);
    filter.Q.setValueAtTime(3.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.032);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.035);

    // Resonant tray thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(130 + Math.random() * 35, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.045);

    oscGain.gain.setValueAtTime(vol * 0.35, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.045);
  }

  playClack(intensity = 0.5) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const vol = Math.min(1.0, Math.max(0.1, intensity));

    // Sharp resin click
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400 + Math.random() * 600, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.02);

    oscGain.gain.setValueAtTime(vol * 0.45, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.02);
  }

  playNat20() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Radiant triumphal major chord (D5 - F#5 - A5 - D6)
    [587.33, 739.99, 880.00, 1174.66].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + idx * 0.05);
      osc.stop(t + 1.25);
    });
  }

  playNat1() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Ominous low tritone chord
    [185.0, 130.81].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, t);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.9);
    });
  }
}

// ============================================================================
// 2. POLYHEDRAL GEOMETRY & CHAMFERING ENGINE (TEAL DICE ADAPTATION)
// ============================================================================

class DiceObject {
  constructor(options = {}) {
    this.size = options.size || 1.6;
    this.fontColor = options.fontColor || '#ffd700';
    this.backColor = options.backColor || '#181528';
    this.accentColor = options.accentColor || '#4c1d95';
    this.resinType = options.resinType || 'obsidian';
    this.values = 6;
    this.scaleFactor = 1;
    this.chamfer = 0.95;
    this.tab = 0;
    this.af = 0;
    this.mass = 300;
    this.invertUpside = false;
    this.faceTexts = [];
    this.faceValues = [];
    this.object = null;
    this.body = null;
    this.settled = false;
  }

  getChamferGeometry(vectors, faces, chamfer) {
    const chamfer_vectors = [];
    const chamfer_faces = [];
    const corner_faces = new Array(vectors.length);
    for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];

    for (let i = 0; i < faces.length; ++i) {
      const ii = faces[i];
      const fl = ii.length - 1;
      const center_point = new THREE.Vector3();
      const face = new Array(fl);

      for (let j = 0; j < fl; ++j) {
        const vv = vectors[ii[j]].clone();
        center_point.add(vv);
        corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
      }
      center_point.divideScalar(fl);

      for (let j = 0; j < fl; ++j) {
        const vv = chamfer_vectors[face[j]];
        vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
      }
      face.push(ii[fl]);
      chamfer_faces.push(face);
    }

    for (let i = 0; i < faces.length - 1; ++i) {
      for (let j = i + 1; j < faces.length; ++j) {
        const pairs = [];
        let lastm = -1;
        for (let m = 0; m < faces[i].length - 1; ++m) {
          const n = faces[j].indexOf(faces[i][m]);
          if (n >= 0 && n < faces[j].length - 1) {
            if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
            else pairs.push([i, m], [j, n]);
            lastm = m;
          }
        }
        if (pairs.length !== 4) continue;
        chamfer_faces.push([
          chamfer_faces[pairs[0][0]][pairs[0][1]],
          chamfer_faces[pairs[1][0]][pairs[1][1]],
          chamfer_faces[pairs[3][0]][pairs[3][1]],
          chamfer_faces[pairs[2][0]][pairs[2][1]],
          -1
        ]);
      }
    }

    for (let i = 0; i < corner_faces.length; ++i) {
      const cf = corner_faces[i];
      const face = [cf[0]];
      let count = cf.length - 1;
      while (count) {
        for (let m = faces.length; m < chamfer_faces.length; ++m) {
          let index = chamfer_faces[m].indexOf(face[face.length - 1]);
          if (index >= 0 && index < 4) {
            if (--index === -1) index = 3;
            const next_vertex = chamfer_faces[m][index];
            if (cf.indexOf(next_vertex) >= 0) {
              face.push(next_vertex);
              break;
            }
          }
        }
        --count;
      }
      face.push(-1);
      chamfer_faces.push(face);
    }

    return { vectors: chamfer_vectors, faces: chamfer_faces };
  }

  makeGeometry(vertices, faces, radius, tab, af) {
    const geom = new THREE.BufferGeometry();
    for (let i = 0; i < vertices.length; ++i) {
      vertices[i] = vertices[i].multiplyScalar(radius);
    }

    const positions = [];
    const normals = [];
    const uvs = [];
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();
    let faceFirstVertexIndex = 0;

    for (let i = 0; i < faces.length; ++i) {
      const ii = faces[i];
      const fl = ii.length - 1;
      const aa = Math.PI * 2 / fl;
      const materialIndex = ii[fl] + 1; // 0 for chamfer bevels, >=1 for numbered faces

      for (let j = 0; j < fl - 2; ++j) {
        positions.push(...vertices[ii[0]].toArray());
        positions.push(...vertices[ii[j + 1]].toArray());
        positions.push(...vertices[ii[j + 2]].toArray());

        cb.subVectors(vertices[ii[j + 2]], vertices[ii[j + 1]]);
        ab.subVectors(vertices[ii[0]], vertices[ii[j + 1]]);
        cb.cross(ab).normalize();

        normals.push(...cb.toArray(), ...cb.toArray(), ...cb.toArray());

        uvs.push((Math.cos(af) + 1 + tab) / 2 / (1 + tab), (Math.sin(af) + 1 + tab) / 2 / (1 + tab));
        uvs.push((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab));
        uvs.push((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab));
      }

      const numOfVertices = (fl - 2) * 3;
      for (let k = 0; k < numOfVertices / 3; k++) {
        geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
        faceFirstVertexIndex += 3;
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    return geom;
  }

  createCannonShape(vertices, faces, radius) {
    const cv = new Array(vertices.length);
    for (let i = 0; i < vertices.length; ++i) {
      const v = vertices[i];
      cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
    }
    const cf = new Array(faces.length);
    for (let i = 0; i < faces.length; ++i) {
      cf[i] = faces[i].slice(0, faces[i].length - 1);
    }
    return new CANNON.ConvexPolyhedron({
      vertices: cv,
      faces: cf
    });
  }

  /**
   * Ultra-HD Engraved Numerals with Gemstone Resin Texture
   */
  createTextTexture(text, fontColor, backColor, isEdge = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 1. Deep Gemstone Pearlescent Gradient
    const cx = 256, cy = 256;
    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 270);
    grad.addColorStop(0, this.accentColor || '#38164f');
    grad.addColorStop(0.7, backColor);
    grad.addColorStop(1, '#09050d');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle pearlescent marble swirl
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx - 30, cy + 20, 160, 0.2, Math.PI * 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 40, cy - 20, 130, Math.PI * 0.8, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();

    // Subtle edge border vignette
    const rimGrad = ctx.createRadialGradient(cx, cy, 220, cx, cy, 256);
    rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
    rimGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, 512, 512);

    if (isEdge || !text || text === ' ') {
      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = true;
      return texture;
    }

    // 2. Engraved Numerals
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const isD100 = text.length > 2;
    const fontSize = isD100 ? 110 : (text.length > 1 ? 140 : 180);
    ctx.font = `bold ${fontSize}px "Cinzel", "Cinzel Decorative", "Times New Roman", Georgia, serif`;

    // Deep incised shadow (carved look)
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillText(text, cx, cy + 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(text, cx, cy - 3);
    ctx.restore();

    // Real Gold / Silver Leaf Numerals
    ctx.fillStyle = fontColor;
    ctx.shadowColor = fontColor;
    ctx.shadowBlur = 8;
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 0;

    // Distinct dot / underline for 6 and 9
    if (text === '6' || text === '9') {
      ctx.fillStyle = fontColor;
      ctx.beginPath();
      ctx.arc(cx, cy + (fontSize * 0.46), 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Special D20 Highlight for 20 (Radiant Crown / Star)
    if (this.values === 20 && text === '20') {
      ctx.save();
      ctx.fillStyle = '#ffedd5';
      ctx.font = '36px sans-serif';
      ctx.fillText('★', cx, cy - 85);
      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    return texture;
  }

  getMaterials() {
    const materials = [];
    const matOptions = {
      roughness: 0.16,
      metalness: 0.12,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1
    };

    // Material 0: Chamfer Bevels / Body edge
    const edgeTexture = this.createTextTexture(' ', this.fontColor, this.backColor, true);
    materials.push(new THREE.MeshStandardMaterial(Object.assign({}, matOptions, { map: edgeTexture })));

    // Materials 1..N: Numbered faces
    for (let i = 1; i < this.faceTexts.length; ++i) {
      const text = this.faceTexts[i];
      let texture;
      if (this.customTextTextureFunction) {
        texture = this.customTextTextureFunction(text, this.fontColor, this.backColor);
      } else {
        texture = this.createTextTexture(text, this.fontColor, this.backColor);
      }
      materials.push(new THREE.MeshStandardMaterial(Object.assign({}, matOptions, { map: texture })));
    }
    return materials;
  }

  getGeometry() {
    const radius = this.size * this.scaleFactor;
    const vectors = new Array(this.vertices.length);
    for (let i = 0; i < this.vertices.length; ++i) {
      vectors[i] = (new THREE.Vector3()).fromArray(this.vertices[i]).normalize();
    }

    const chamferGeometry = this.getChamferGeometry(vectors, this.faces, this.chamfer);
    const geometry = this.makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, this.tab, this.af);
    geometry.cannon_shape = this.createCannonShape(vectors, this.faces, radius);
    return geometry;
  }

  create(world, diceMaterial) {
    const geom = this.getGeometry();
    const mats = this.getMaterials();
    this.object = new THREE.Mesh(geom, mats);
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.diceObject = this;

    this.body = new CANNON.Body({
      mass: this.mass,
      shape: geom.cannon_shape,
      material: diceMaterial,
      linearDamping: 0.18,
      angularDamping: 0.22
    });

    world.addBody(this.body);
    return this.object;
  }

  updateMeshFromBody() {
    if (this.object && this.body) {
      this.object.position.copy(this.body.position);
      this.object.quaternion.copy(this.body.quaternion);
    }
  }

  getUpsideValue() {
    const upVector = new THREE.Vector3(0, this.invertUpside ? -1 : 1, 0);
    let closestFace = null;
    let closestAngle = Math.PI * 2;

    const normals = this.object.geometry.getAttribute('normal').array;
    for (let i = 0; i < this.object.geometry.groups.length; ++i) {
      const face = this.object.geometry.groups[i];
      if (face.materialIndex === 0) continue; // Skip edge bevels

      const startVertex = i * 9;
      const normal = new THREE.Vector3(normals[startVertex], normals[startVertex + 1], normals[startVertex + 2]);
      const worldNormal = normal.clone().applyQuaternion(this.object.quaternion);
      const angle = worldNormal.angleTo(upVector);

      if (angle < closestAngle) {
        closestAngle = angle;
        closestFace = face;
      }
    }

    if (!closestFace) return 1;
    const val = this.faceValues[closestFace.materialIndex];
    return val !== undefined ? val : (closestFace.materialIndex - 1);
  }

  shiftUpperValue(toValue) {
    const fromValue = this.getUpsideValue();
    if (fromValue === toValue) return;

    // Find difference and shift materials
    const geom = this.object.geometry.clone();
    const diff = toValue - fromValue;

    for (let i = 0; i < geom.groups.length; ++i) {
      let matIdx = geom.groups[i].materialIndex;
      if (matIdx === 0) continue;

      let val = this.faceValues[matIdx];
      if (typeof val === 'number') {
        let newVal = val + diff;
        while (newVal > this.values) newVal -= this.values;
        while (newVal < 1) newVal += this.values;

        // find which material has newVal
        const targetMatIdx = this.faceValues.indexOf(newVal);
        if (targetMatIdx > 0) geom.groups[i].materialIndex = targetMatIdx;
      }
    }
    this.object.geometry = geom;
  }

  isStopped(threshold = 0.08) {
    if (!this.body) return true;
    const v = this.body.velocity;
    const w = this.body.angularVelocity;
    return (
      v.x * v.x + v.y * v.y + v.z * v.z < threshold * threshold &&
      w.x * w.x + w.y * w.y + w.z * w.z < threshold * threshold
    );
  }
}

// ----------------------------------------------------------------------------
// Specific Polyhedral Dice Implementations
// ----------------------------------------------------------------------------

export class DiceD4 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#78350f'; // Radiant Amber
    options.accentColor = options.accentColor || '#b45309';
    options.fontColor = options.fontColor || '#fef08a';
    super(options);

    this.tab = -0.1;
    this.af = Math.PI * 7 / 6;
    this.chamfer = 0.96;
    this.vertices = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    this.faces = [[1, 0, 2, 1], [0, 1, 3, 2], [0, 3, 2, 3], [1, 2, 3, 4]];
    this.scaleFactor = 1.35;
    this.values = 4;
    this.mass = 280;
    this.invertUpside = true;

    this.faceTexts = [' ', '1', '2', '3', '4'];
    this.faceValues = [null, 1, 2, 3, 4];

    // D4 custom multi-number texture per face
    this.customTextTextureFunction = (text, fontColor, backColor) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 260);
      grad.addColorStop(0, this.accentColor);
      grad.addColorStop(0.7, backColor);
      grad.addColorStop(1, '#0c0702');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      ctx.fillStyle = fontColor;
      ctx.font = 'bold 95px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Triple rotated numbers around the triangle
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(256, 256);
        ctx.rotate((i * Math.PI * 2) / 3);
        ctx.translate(0, -135);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.generateMipmaps = true;
      return tex;
    };
  }
}

export class DiceD6 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#881337'; // Fiery Crimson Ruby
    options.accentColor = options.accentColor || '#be123c';
    options.fontColor = options.fontColor || '#fde68a';
    super(options);

    this.tab = 0.1;
    this.af = Math.PI / 4;
    this.chamfer = 0.955;
    this.vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];
    this.faces = [
      [0, 3, 2, 1, 1], [1, 2, 6, 5, 2], [0, 1, 5, 4, 3],
      [3, 7, 6, 2, 4], [0, 4, 7, 3, 5], [4, 5, 6, 7, 6]
    ];
    this.scaleFactor = 1.05;
    this.values = 6;
    this.mass = 300;

    // Indices: 0: bevel edge, 1: unused, 2..7: values 1..6
    this.faceTexts = [' ', ' ', '1', '2', '3', '4', '5', '6'];
    this.faceValues = [null, 0, 1, 2, 3, 4, 5, 6];
  }
}

export class DiceD8 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#1e3a8a'; // Arcane Cobalt Sapphire
    options.accentColor = options.accentColor || '#2563eb';
    options.fontColor = options.fontColor || '#e0e7ff';
    super(options);

    this.tab = 0;
    this.af = -Math.PI / 8;
    this.chamfer = 0.962;
    this.vertices = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    this.faces = [
      [0, 2, 4, 1], [0, 4, 3, 2], [0, 3, 5, 3], [0, 5, 2, 4],
      [1, 3, 4, 5], [1, 4, 2, 6], [1, 2, 5, 7], [1, 5, 3, 8]
    ];
    this.scaleFactor = 1.15;
    this.values = 8;
    this.mass = 340;

    this.faceTexts = [' ', ' ', '1', '2', '3', '4', '5', '6', '7', '8'];
    this.faceValues = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  }
}

export class DiceD10 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#064e3b'; // Emerald Dragon Jade
    options.accentColor = options.accentColor || '#059669';
    options.fontColor = options.fontColor || '#6ee7b7';
    super(options);

    this.tab = 0;
    this.af = Math.PI * 6 / 5;
    this.chamfer = 0.945;
    this.vertices = [];
    for (let i = 0, b = 0; i < 10; ++i, b += Math.PI * 2 / 10) {
      this.vertices.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
    }
    this.vertices.push([0, 0, -1]);
    this.vertices.push([0, 0, 1]);

    this.faces = [
      [5, 7, 11, 0], [4, 2, 10, 1], [1, 3, 11, 2], [0, 8, 10, 3], [7, 9, 11, 4],
      [8, 6, 10, 5], [9, 1, 11, 6], [2, 0, 10, 7], [3, 5, 11, 8], [6, 4, 10, 9],
      [1, 0, 2, -1], [1, 2, 3, -1], [3, 2, 4, -1], [3, 4, 5, -1], [5, 4, 6, -1],
      [5, 6, 7, -1], [7, 6, 8, -1], [7, 8, 9, -1], [9, 8, 0, -1], [9, 0, 1, -1]
    ];
    this.scaleFactor = 1.08;
    this.values = 10;
    this.mass = 350;

    // D&D 10-sided dice typically displays 1 through 10 (or 0 for 10)
    this.faceTexts = [' ', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    this.faceValues = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  }
}

export class DiceD100 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#1e293b'; // Slate Pearl
    options.accentColor = options.accentColor || '#475569';
    options.fontColor = options.fontColor || '#38bdf8';
    super(options);

    this.tab = 0;
    this.af = Math.PI * 6 / 5;
    this.chamfer = 0.945;
    this.vertices = [];
    for (let i = 0, b = 0; i < 10; ++i, b += Math.PI * 2 / 10) {
      this.vertices.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
    }
    this.vertices.push([0, 0, -1]);
    this.vertices.push([0, 0, 1]);

    this.faces = [
      [5, 7, 11, 0], [4, 2, 10, 1], [1, 3, 11, 2], [0, 8, 10, 3], [7, 9, 11, 4],
      [8, 6, 10, 5], [9, 1, 11, 6], [2, 0, 10, 7], [3, 5, 11, 8], [6, 4, 10, 9],
      [1, 0, 2, -1], [1, 2, 3, -1], [3, 2, 4, -1], [3, 4, 5, -1], [5, 4, 6, -1],
      [5, 6, 7, -1], [7, 6, 8, -1], [7, 8, 9, -1], [9, 8, 0, -1], [9, 0, 1, -1]
    ];
    this.scaleFactor = 1.08;
    this.values = 100;
    this.mass = 350;

    // Percentile faces: 00, 10, 20... 90
    this.faceTexts = [' ', '00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
    this.faceValues = [null, 100, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  }
}

export class DiceD12 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#4c1d95'; // Royal Amethyst
    options.accentColor = options.accentColor || '#6d28d9';
    options.fontColor = options.fontColor || '#f5d0fe';
    super(options);

    const p = (1 + Math.sqrt(5)) / 2;
    const q = 1 / p;

    this.tab = 0.2;
    this.af = -Math.PI / 8;
    this.chamfer = 0.968;
    this.vertices = [
      [0, q, p], [0, q, -p], [0, -q, p], [0, -q, -p], [p, 0, q],
      [p, 0, -q], [-p, 0, q], [-p, 0, -q], [q, p, 0], [q, -p, 0], [-q, p, 0],
      [-q, -p, 0], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1],
      [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
    ];
    this.faces = [
      [2, 14, 4, 12, 0, 1], [15, 9, 11, 19, 3, 2], [16, 10, 17, 7, 6, 3], [6, 7, 19, 11, 18, 4],
      [6, 18, 2, 0, 16, 5], [18, 11, 9, 14, 2, 6], [1, 17, 10, 8, 13, 7], [1, 13, 5, 15, 3, 8],
      [13, 8, 12, 4, 5, 9], [5, 4, 14, 9, 15, 10], [0, 12, 8, 10, 16, 11], [3, 19, 7, 17, 1, 12]
    ];
    this.scaleFactor = 1.05;
    this.values = 12;
    this.mass = 360;

    this.faceTexts = [' ', ' ', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    this.faceValues = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
}

export class DiceD20 extends DiceObject {
  constructor(options = {}) {
    options.backColor = options.backColor || '#151322'; // Obsidian & Dragon Gold
    options.accentColor = options.accentColor || '#312e81';
    options.fontColor = options.fontColor || '#f59e0b';
    super(options);

    const t = (1 + Math.sqrt(5)) / 2;

    this.tab = -0.2;
    this.af = -Math.PI / 8;
    this.chamfer = 0.955;
    this.vertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ];
    this.faces = [
      [0, 11, 5, 1], [0, 5, 1, 2], [0, 1, 7, 3], [0, 7, 10, 4], [0, 10, 11, 5],
      [1, 5, 9, 6], [5, 11, 4, 7], [11, 10, 2, 8], [10, 7, 6, 9], [7, 1, 8, 10],
      [3, 9, 4, 11], [3, 4, 2, 12], [3, 2, 6, 13], [3, 6, 8, 14], [3, 8, 9, 15],
      [4, 9, 5, 16], [2, 4, 11, 17], [6, 2, 10, 18], [8, 6, 7, 19], [9, 8, 1, 20]
    ];
    this.scaleFactor = 1.18;
    this.values = 20;
    this.mass = 400;

    this.faceTexts = [
      ' ', ' ', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
    ];
    this.faceValues = [
      null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
    ];
  }
}

// ============================================================================
// 3. MASTER DICE PHYSICS ENGINE & 3D ARENA CONTROLLER
// ============================================================================

export class DicePhysicsEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = new DiceAudioEngine();
    this.diceList = [];
    this.animId = null;
    this.isRolling = false;
    this.onCompleteCallback = null;
    this.rollStartTime = 0;
    this.indicatorsGroup = new THREE.Group();

    this.initThree();
    this.initCannon();
  }

  initThree() {
    const width = this.canvas.clientWidth || 740;
    const height = this.canvas.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0914);

    // Closer, more cinematic perspective framing
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 14.8, 10.5);
    this.camera.lookAt(0, -0.2, 0.2);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    // Atmospheric Warm Fantasy Lighting
    const ambient = new THREE.AmbientLight(0xffeedd, 1.05);
    this.scene.add(ambient);

    const keySpot = new THREE.SpotLight(0xfff7ed, 2.4);
    keySpot.position.set(5, 22, 9);
    keySpot.angle = Math.PI / 3.6;
    keySpot.penumbra = 0.55;
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.width = 1024;
    keySpot.shadow.mapSize.height = 1024;
    keySpot.shadow.bias = -0.0005;
    this.scene.add(keySpot);

    const candle = new THREE.PointLight(0xf59e0b, 1.9, 25);
    candle.position.set(-8, 7, -2);
    this.scene.add(candle);

    const rim = new THREE.DirectionalLight(0x818cf8, 0.6);
    rim.position.set(-6, 10, -10);
    this.scene.add(rim);

    this.scene.add(this.indicatorsGroup);
    this.buildTrayVisuals();

    window.addEventListener('resize', () => this.handleResize());
  }

  initCannon() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -52, 0); // Fast, punchy gravity
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 12;

    // Contact Materials
    this.diceMaterial = new CANNON.Material('dice');
    this.floorMaterial = new CANNON.Material('floor');
    this.wallMaterial = new CANNON.Material('wall');

    // Dice to Felt Floor
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.floorMaterial, this.diceMaterial, {
        friction: 0.45,
        restitution: 0.30
      }
    ));

    // Dice to Wood Wall
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.wallMaterial, this.diceMaterial, {
        friction: 0.15,
        restitution: 0.45
      }
    ));

    // Dice to Dice
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.diceMaterial, {
        friction: 0.22,
        restitution: 0.50
      }
    ));

    // Cannon Floor Plane
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: this.floorMaterial
    });
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(floorBody);

    // Ceiling Plane at y = 14 to keep all dice strictly inside tray
    const ceilingBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: this.wallMaterial
    });
    ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    ceilingBody.position.set(0, 14, 0);
    this.world.addBody(ceilingBody);

    // Tall Tray Boundary Walls (Box colliders - 12 units high)
    const trayHalfW = 8.6;
    const trayHalfD = 5.4;
    const wallH = 12.0;
    const wallThick = 1.0;

    const wallSpecs = [
      // Left Wall
      { pos: [-trayHalfW - wallThick / 2, wallH / 2, 0], size: [wallThick / 2, wallH / 2, trayHalfD + wallThick] },
      // Right Wall
      { pos: [trayHalfW + wallThick / 2, wallH / 2, 0], size: [wallThick / 2, wallH / 2, trayHalfD + wallThick] },
      // Top Wall (Far)
      { pos: [0, wallH / 2, -trayHalfD - wallThick / 2], size: [trayHalfW + wallThick, wallH / 2, wallThick / 2] },
      // Bottom Wall (Near)
      { pos: [0, wallH / 2, trayHalfD + wallThick / 2], size: [trayHalfW + wallThick, wallH / 2, wallThick / 2] }
    ];

    wallSpecs.forEach(spec => {
      const wallBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(...spec.size)),
        material: this.wallMaterial
      });
      wallBody.position.set(...spec.pos);
      this.world.addBody(wallBody);
    });
  }

  buildTrayVisuals() {
    const trayW = 17.6;
    const trayD = 11.2;

    // 1. Felt Floor with Velvet Texture & Arcane Gold Watermark
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Royal Burgundy Velvet
    const grad = ctx.createRadialGradient(512, 512, 50, 512, 512, 600);
    grad.addColorStop(0, '#2d1029');
    grad.addColorStop(0.65, '#19081e');
    grad.addColorStop(1, '#0c0310');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle felt grain
    const imgData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Golden Arcane Watermark
    ctx.save();
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(512, 512, 280, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(512, 512, 260, 0, Math.PI * 2);
    ctx.stroke();

    // D20 geometry outline in center watermark
    const numPoints = 6;
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const a = (i * Math.PI * 2) / numPoints - Math.PI / 2;
      const x = 512 + Math.cos(a) * 140;
      const y = 512 + Math.sin(a) * 140;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const feltTexture = new THREE.CanvasTexture(canvas);
    feltTexture.generateMipmaps = true;

    const floorGeo = new THREE.PlaneGeometry(trayW, trayD);
    const floorMat = new THREE.MeshStandardMaterial({
      map: feltTexture,
      roughness: 0.88,
      metalness: 0.05
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // 2. Beveled Dark Mahogany Wood Rim
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x22110c,
      roughness: 0.35,
      metalness: 0.2
    });

    const rimThick = 0.8;
    const rimH = 1.2;

    const borderGeoms = [
      // Top & Bottom
      { size: [trayW + rimThick * 2, rimH, rimThick], pos: [0, rimH / 2, -(trayD / 2 + rimThick / 2)] },
      { size: [trayW + rimThick * 2, rimH, rimThick], pos: [0, rimH / 2, (trayD / 2 + rimThick / 2)] },
      // Left & Right
      { size: [rimThick, rimH, trayD], pos: [-(trayW / 2 + rimThick / 2), rimH / 2, 0] },
      { size: [rimThick, rimH, trayD], pos: [(trayW / 2 + rimThick / 2), rimH / 2, 0] }
    ];

    borderGeoms.forEach(b => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), rimMat);
      m.position.set(...b.pos);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    });

    // 3. Ornate Brass Corner Brackets
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.25,
      metalness: 0.85
    });

    const corners = [
      [-trayW / 2, -(trayD / 2)],
      [trayW / 2, -(trayD / 2)],
      [-trayW / 2, trayD / 2],
      [trayW / 2, trayD / 2]
    ];
    corners.forEach(([cx, cz]) => {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.4, rimH + 0.08, 1.4), brassMat);
      bracket.position.set(cx, (rimH + 0.08) / 2, cz);
      bracket.castShadow = true;
      this.scene.add(bracket);
    });
  }

  handleResize() {
    if (!this.canvas) return;
    const width = this.canvas.clientWidth || 740;
    const height = this.canvas.clientHeight || 400;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  createDieInstance(sides) {
    let die;
    switch (sides) {
      case 4: die = new DiceD4({ size: 1.5 }); break;
      case 6: die = new DiceD6({ size: 1.5 }); break;
      case 8: die = new DiceD8({ size: 1.55 }); break;
      case 10: die = new DiceD10({ size: 1.55 }); break;
      case 12: die = new DiceD12({ size: 1.6 }); break;
      case 20: die = new DiceD20({ size: 1.65 }); break;
      case 100: die = new DiceD100({ size: 1.55 }); break;
      default: die = new DiceD20({ size: 1.65 }); break;
    }

    const mesh = die.create(this.world, this.diceMaterial);
    this.scene.add(mesh);
    return die;
  }

  clearDice() {
    this.diceList.forEach(d => {
      if (d.mesh) this.scene.remove(d.mesh);
      if (d.body) this.world.removeBody(d.body);
    });
    this.diceList = [];
    while (this.indicatorsGroup.children.length > 0) {
      this.indicatorsGroup.remove(this.indicatorsGroup.children[0]);
    }
  }

  createRuneRing(color = 0xf59e0b) {
    const geo = new THREE.RingGeometry(1.45, 1.7, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    return ring;
  }

  createFloatingBadge(text, subText = '', isCrit = false, isFumble = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Rounded rectangle pill
    const rx = 16, ry = 16, rw = 224, rh = 96, r = 24;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();

    ctx.fillStyle = isCrit ? 'rgba(22, 101, 52, 0.92)' : (isFumble ? 'rgba(153, 27, 27, 0.92)' : 'rgba(17, 10, 26, 0.92)');
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = isCrit ? '#4ade80' : (isFumble ? '#f87171' : '#f59e0b');
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Cinzel", serif';
    ctx.fillText(text, 128, 56);

    if (subText) {
      ctx.fillStyle = isCrit ? '#bbf7d0' : (isFumble ? '#fecaca' : '#fef08a');
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(subText, 128, 92);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.4, 1.2, 1);
    return sprite;
  }

  roll(dicePlan, onComplete) {
    if (this.isRolling) return;
    this.isRolling = true;
    this.onCompleteCallback = onComplete;
    this.rollStartTime = performance.now();

    this.clearDice();
    this.audio.playImpact(0.85);

    const count = dicePlan.length;
    const startY = 6.5;

    // Spawn and apply impulses directed toward tray center
    dicePlan.forEach((plan, idx) => {
      const sides = plan.sides || 20;
      const targetVal = plan.value;
      const die = this.createDieInstance(sides);

      // Distribute launch positions along top edge of tray
      const span = Math.min(10, Math.max(4, count * 1.8));
      const offsetX = ((idx - (count - 1) / 2) / Math.max(1, count - 1 || 1)) * (span * 0.7) + (Math.random() - 0.5) * 0.8;
      const offsetZ = -3.2 + (Math.random() - 0.5) * 0.8;
      const spawnY = startY + (idx % 3) * 0.45;

      die.body.position.set(offsetX, spawnY, offsetZ);

      // Initial orientation & randomized spin
      die.body.quaternion.set(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      );
      die.body.quaternion.normalize();

      // Aimed impulse toward central felt zone
      const targetX = (Math.random() - 0.5) * 3.5;
      const targetZ = 0.5 + (Math.random() - 0.5) * 2.2;

      const vx = (targetX - offsetX) * (2.6 + Math.random() * 0.7);
      const vy = -(14 + Math.random() * 5);
      const vz = (targetZ - offsetZ) * (2.6 + Math.random() * 0.7);
      die.body.velocity.set(vx, vy, vz);

      die.body.angularVelocity.set(
        (Math.random() - 0.5) * 38,
        (Math.random() - 0.5) * 38,
        (Math.random() - 0.5) * 38
      );

      // Collision audio listeners
      die.body.addEventListener('collide', (e) => {
        const relVel = e.contact.getImpactVelocityAlongNormal();
        if (relVel > 1.2) {
          if (e.body === this.world.bodies[0]) {
            this.audio.playImpact(Math.min(1.0, relVel / 14));
          } else {
            this.audio.playClack(Math.min(1.0, relVel / 12));
          }
        }
      });

      this.diceList.push({
        die: die,
        mesh: die.object,
        body: die.body,
        sides: sides,
        targetVal: targetVal,
        settled: false,
        ring: null,
        badge: null
      });
    });

    if (this.animId) cancelAnimationFrame(this.animId);
    this.animate();
  }

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());

    // 1. Step Physics (fixed 60Hz dt)
    this.world.step(1 / 60);

    const now = performance.now();
    const elapsed = (now - this.rollStartTime) / 1000;
    let allSettled = true;

    // 2. Sync meshes and check settling
    this.diceList.forEach(item => {
      item.die.updateMeshFromBody();

      if (!item.settled) {
        // Naturally stopped or timeout fallback at 1.8s
        const isPhysicallyStopped = item.die.isStopped(0.12);
        if ((isPhysicallyStopped && elapsed > 0.45) || elapsed > 1.85) {
          item.settled = true;
          item.body.velocity.set(0, 0, 0);
          item.body.angularVelocity.set(0, 0, 0);

          // Get face that landed on top
          let upside = item.die.getUpsideValue();

          // If a specific target was predetermined, shift materials to it
          if (item.targetVal && item.targetVal !== upside) {
            item.die.shiftUpperValue(item.targetVal);
            upside = item.targetVal;
          } else {
            item.targetVal = upside;
          }

          // Build Glowing Rune Ring
          const isCrit = item.sides === 20 && item.targetVal === 20;
          const isFumble = item.sides === 20 && item.targetVal === 1;
          const ringColor = isCrit ? 0x22c55e : (isFumble ? 0xef4444 : 0xf59e0b);

          item.ring = this.createRuneRing(ringColor);
          item.ring.position.set(item.mesh.position.x, 0.04, item.mesh.position.z);
          this.indicatorsGroup.add(item.ring);

          // Build Floating 3D Badge
          const subText = isCrit ? 'NAT 20!' : (isFumble ? 'FALHA!' : `d${item.sides}`);
          item.badge = this.createFloatingBadge(String(item.targetVal), subText, isCrit, isFumble);
          item.badge.position.set(item.mesh.position.x, item.mesh.position.y + 2.4, item.mesh.position.z);
          this.indicatorsGroup.add(item.badge);
        } else {
          allSettled = false;
        }
      }
    });

    // 3. Animate glowing rings & badges
    this.diceList.forEach(item => {
      if (item.ring && item.ring.material.opacity < 0.8) {
        item.ring.material.opacity += 0.04;
        item.ring.rotation.z += 0.015;
      }
    });

    // 4. Anti-Collision Separation for Floating Badges
    const minDist = 2.6;
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.diceList.length; i++) {
        for (let j = i + 1; j < this.diceList.length; j++) {
          const b1 = this.diceList[i].badge;
          const b2 = this.diceList[j].badge;
          if (!b1 || !b2) continue;

          const dx = b2.position.x - b1.position.x;
          const dz = b2.position.z - b1.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < minDist && dist > 0.001) {
            const overlap = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const nz = dz / dist;

            b1.position.x -= nx * overlap;
            b1.position.z -= nz * overlap;
            b2.position.x += nx * overlap;
            b2.position.z += nz * overlap;

            // Stagger height so they don't overlap in perspective
            b1.position.y = Math.max(itemY(this.diceList[i]) + 2.3, b1.position.y - 0.1);
            b2.position.y = Math.max(itemY(this.diceList[j]) + 2.3, b2.position.y + 0.2);
          }
        }
      }
    }

    function itemY(it) {
      return it && it.mesh ? it.mesh.position.y : 0;
    }

    this.renderer.render(this.scene, this.camera);

    // 5. Completion callback when all settled
    if (allSettled && this.isRolling) {
      this.isRolling = false;
      this.audio.playImpact(0.3);

      const d20s = this.diceList.filter(d => d.sides === 20);
      if (d20s.some(d => d.targetVal === 20)) {
        setTimeout(() => this.audio.playNat20(), 70);
      } else if (d20s.some(d => d.targetVal === 1)) {
        setTimeout(() => this.audio.playNat1(), 70);
      }

      if (this.onCompleteCallback) {
        this.onCompleteCallback(this.diceList);
      }
    }
  }
}

// Expose globally for browser window
if (typeof window !== 'undefined') {
  window.DicePhysicsEngine = DicePhysicsEngine;
}
