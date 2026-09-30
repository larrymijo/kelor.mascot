/**
 * The eggshell: a physical material with its detail computed on the GPU, so
 * it is crisp at any resolution and costs no texture download, under a thin
 * clearcoat that gives the shell the soft sheen of a real egg.
 *
 * - A pebbled surface: fine tubercles like the nodular shell of real
 *   dinosaur eggs, over faint polygonal plates (3D Voronoi cells, mostly
 *   six-sided, a quiet nod to the brand's hexagons).
 * - Speckles, and a darker tone on the inside of the shell, which shows
 *   once the pieces break apart.
 * - The cracks, drawn as glowing lines along the same curves the pieces
 *   break along (geometry.ts), widening and pulsing as the model loads.
 *
 * The pattern lives in object space, so it travels with each piece.
 */
import { Color, DoubleSide, MeshPhysicalMaterial, type IUniform } from 'three'
import { CAP_AT, CRACK } from './geometry'

/** Plates, tubercles and speckle cells per metre. */
const SCALE = { plates: 34, tubercles: 120, speckles: 55 }
/** How strongly the relief bends the light. */
const BUMP = 0.028
/** Crack line width in metres, closed and fully open. */
const CRACK_WIDTH = { closed: 0.0012, open: 0.0045 }

const f = (n: number) => n.toFixed(5)

/** GLSL summing the cap crack's zig-zags and their slopes (per metre of arc). */
const capTerms = (heightM: number) =>
  CRACK.cap
    .map((t) => {
      const at = `turn * ${f(t.teeth)} + ${f(t.phase)}`
      return [
        `capLine += ${f(heightM * t.depth)} * eggZigzag(${at});`,
        `capSlope += ${f(heightM * t.depth * t.teeth)} * eggZigzagSlope(${at}) / (6.2831853 * radius);`,
      ].join(' ')
    })
    .join(' ')

/** GLSL summing the seam's zig-zags and their slopes. */
const seamTerms = () =>
  CRACK.seam
    .map((t) => {
      const at = `p.y / ${f(t.periodM)} + ${f(t.phase)} + back`
      return [
        `seam += ${f(t.depth)} * eggZigzag(${at});`,
        `seamSlope += ${f(t.depth / t.periodM)} * eggZigzagSlope(${at});`,
      ].join(' ')
    })
    .join(' ')

const declarations = (heightM: number) => /* glsl */ `
  varying vec3 vEggPosition;
  uniform vec3 uSpeckleColor;
  uniform vec3 uGlowColor;
  uniform float uCrack;
  uniform float uGlow;

  vec3 eggHash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.xxy + p.yzz) * p.zyx);
  }

  // Distances to the nearest and second-nearest cell centre.
  vec2 eggCells(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 d = g + eggHash(i + g) - f;
      float dist = dot(d, d);
      if (dist < f1) { f2 = f1; f1 = dist; } else if (dist < f2) { f2 = dist; }
    }
    return sqrt(vec2(f1, f2));
  }

  float eggZigzag(float t) { return 4.0 * abs(t - floor(t + 0.5)) - 1.0; }
  float eggZigzagSlope(float t) { return 4.0 * sign(t - floor(t + 0.5)); }

  // Distance, across the surface, to the nearest crack line: the distance
  // along y (or x) divided by the line's local steepness.
  float eggCrack(vec3 p) {
    float radius = max(length(p.xz), 0.02);
    float turn = atan(p.z, p.x) / 6.2831853;
    float capLine = ${f(heightM * CAP_AT)};
    float capSlope = 0.0;
    ${capTerms(heightM)}
    float dCap = abs(p.y - capLine) / sqrt(1.0 + capSlope * capSlope);
    float back = p.z > 0.0 ? 0.0 : 0.5;
    float seam = 0.0;
    float seamSlope = 0.0;
    ${seamTerms()}
    float dSeam = p.y < capLine ? abs(p.x - seam) / sqrt(1.0 + seamSlope * seamSlope) : 1.0;
    return min(dCap, dSeam);
  }

  vec3 eggPerturb(vec3 position, vec3 normal, vec2 dHdxy, float faceDirection) {
    vec3 sigmaX = normalize(dFdx(position));
    vec3 sigmaY = normalize(dFdy(position));
    vec3 r1 = cross(sigmaY, normal);
    vec3 r2 = cross(normal, sigmaX);
    float det = dot(sigmaX, r1) * faceDirection;
    vec3 gradient = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
    return normalize(abs(det) * normal - gradient);
  }
`

const colour = /* glsl */ `
  #include <color_fragment>
  vec2 eggPlateCells = eggCells(vEggPosition * ${SCALE.plates.toFixed(1)});
  float eggPlate = smoothstep(0.01, 0.07, eggPlateCells.y - eggPlateCells.x);
  float eggTubercle = smoothstep(0.62, 0.0, eggCells(vEggPosition * ${SCALE.tubercles.toFixed(1)}).x);
  // Faint seams between plates, and a little shade between tubercles.
  diffuseColor.rgb *= mix(0.9, 1.0, eggPlate) * mix(0.93, 1.0, eggTubercle);
  // Speckles: some cells, not all, carry a dark fleck.
  vec3 eggSpeckleCell = floor(vEggPosition * ${SCALE.speckles.toFixed(1)});
  float eggSpeckle = smoothstep(0.3, 0.12, eggCells(vEggPosition * ${SCALE.speckles.toFixed(1)}).x)
    * step(0.74, eggHash(eggSpeckleCell).x);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSpeckleColor, eggSpeckle * 0.75);
  // The cracks: a dark lip around a glowing line, antialiased at any size.
  float eggCrackDistance = eggCrack(vEggPosition);
  float eggCrackWidth = mix(${f(CRACK_WIDTH.closed)}, ${f(CRACK_WIDTH.open)}, uCrack);
  float eggCrackAa = fwidth(eggCrackDistance);
  float eggCrackLine = 1.0 - smoothstep(eggCrackWidth - eggCrackAa, eggCrackWidth + eggCrackAa, eggCrackDistance);
  float eggCrackLip = smoothstep(eggCrackWidth, eggCrackWidth * 3.0 + eggCrackAa, eggCrackDistance);
  diffuseColor.rgb *= mix(0.35, 1.0, eggCrackLip);
  // The inside of the shell, seen once it breaks, is darker and cooler.
  if (!gl_FrontFacing) diffuseColor.rgb *= vec3(0.62, 0.6, 0.68);
`

const roughness = /* glsl */ `
  #include <roughnessmap_fragment>
  roughnessFactor = mix(0.82, roughnessFactor, eggPlate);
`

const relief = /* glsl */ `
  #include <normal_fragment_maps>
  float eggH = eggPlate * 0.35 + eggTubercle * 0.65;
  // Fade the relief at grazing angles, where screen-space bumps go black.
  float eggFacing = abs(dot(normal, normalize(vViewPosition)));
  vec2 eggSlope = vec2(dFdx(eggH), dFdy(eggH)) * ${BUMP.toFixed(3)} * smoothstep(0.08, 0.4, eggFacing);
  normal = eggPerturb(-vViewPosition, normal, eggSlope, faceDirection);
`

const glow = /* glsl */ `
  #include <emissivemap_fragment>
  totalEmissiveRadiance += uGlowColor * eggCrackLine * uGlow;
`

/** The shell material and the two values the egg drives each frame. */
export class EggShell {
  readonly material: MeshPhysicalMaterial
  private readonly crack: IUniform<number> = { value: 0 }
  private readonly glow: IUniform<number> = { value: 0 }

  constructor(
    egg: { heightM: number; shellColor: string; speckleColor: string },
    glowColor: Color,
  ) {
    this.material = new MeshPhysicalMaterial({
      color: egg.shellColor,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.4,
      side: DoubleSide,
      // The studio's reflections carry its violet panel: kept low, the shell stays ivory.
      envMapIntensity: 0.3,
    })
    const speckle = new Color(egg.speckleColor)
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uSpeckleColor: { value: speckle },
        uGlowColor: { value: glowColor },
        uCrack: this.crack,
        uGlow: this.glow,
      })
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEggPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEggPosition = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${declarations(egg.heightM)}`)
        .replace('#include <color_fragment>', colour)
        .replace('#include <roughnessmap_fragment>', roughness)
        .replace('#include <normal_fragment_maps>', relief)
        .replace('#include <emissivemap_fragment>', glow)
    }
    // One program for every piece.
    this.material.customProgramCacheKey = () => 'kelo-eggshell'
  }

  /** How far open the cracks are (0 to 1) and how brightly they glow. */
  setCracks(open: number, glow: number) {
    this.crack.value = open
    this.glow.value = glow
  }

  dispose() {
    this.material.dispose()
  }
}
