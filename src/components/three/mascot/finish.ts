/**
 * Runtime surface finish for the medium and high tiers. The GLB carries plain
 * glTF materials so every tier and tool reads it; here the skin, the face
 * shell and the eyes become MeshPhysicalMaterial on capable devices:
 *
 * - skin and face: a soft clearcoat and sheen, the vinyl-toy finish the
 *   concept describes, with the same values on both so the face shell never
 *   reads as a separate patch;
 * - eyes: a glossy clearcoat cornea over the iris, so they look wet and alive
 *   in the close-ups;
 * - teeth and tusks: hard, glossy enamel that catches the studio's light.
 *
 * Maps, colours and factors are carried over, and the texture objects are
 * shared, so the expression atlas offset keeps working on the face.
 */
import {
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import { character } from '@/lib/character'

export interface Finish {
  /** Clearcoat strength on the skin, 0 to 1. */
  skinCoat: number
  /** Sheen strength on the skin, 0 to 1. */
  skinSheen: number
}

export const DEFAULT_FINISH: Finish = { skinCoat: 0.2, skinSheen: 0.25 }

const SKIN = new Set(['body', 'face'])
const UPGRADED = new Set([...SKIN, 'eyes', 'teeth'])
// A deep violet sheen: a pale one veils every grazing angle and washes the skin out.
const SHEEN_COLOR = new Color(character.colors.mascot['500'])

function upgrade(source: MeshStandardMaterial) {
  const material = new MeshPhysicalMaterial()
  // Copy only the standard fields: the physical copy would read clearcoat, sheen
  // and friends from a material that has none. The standard copy also resets
  // the shader defines, so the physical one is put back.
  MeshStandardMaterial.prototype.copy.call(material, source)
  material.defines = { STANDARD: '', PHYSICAL: '' }
  material.name = source.name
  if (SKIN.has(source.name)) {
    // Start at the default finish so the first compile already has both features.
    material.clearcoat = DEFAULT_FINISH.skinCoat
    material.sheen = DEFAULT_FINISH.skinSheen
    material.clearcoatRoughness = 0.45
    material.sheenColor.copy(SHEEN_COLOR)
    material.sheenRoughness = 0.7
  } else if (source.name === 'teeth') {
    // Enamel: a hard, glossy coat, so every tooth and tusk catches a highlight.
    material.clearcoat = 1
    material.clearcoatRoughness = 0.08
    material.roughness = Math.min(material.roughness, 0.35)
  } else {
    // The cornea: a hard, glassy coat over the painted iris.
    material.clearcoat = 1
    material.clearcoatRoughness = 0.04
    material.roughness = Math.min(material.roughness, 0.3)
    // Tone mapping and the shaded underside turn a white sclera grey. Glowing by
    // the eye's own texture lifts the white while the dark iris stays dark.
    material.emissive.set(0xffffff)
    material.emissiveMap = material.map
    material.emissiveIntensity = 0.28
    // The glossy cornea mirrored the studio's big overhead softbox as a white
    // shape cut by the lid; the painted catchlights are the highlight we want.
    material.envMapIntensity = 0.3
  }
  return material
}

/**
 * Swap the skin, face, eye and teeth materials of a rig's scene for physical ones.
 * Returns the new materials, for tuning and disposal.
 */
export function applyFinish(root: Object3D): MeshPhysicalMaterial[] {
  const replaced = new Map<Material, MeshPhysicalMaterial>()
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const material = mesh.material as MeshStandardMaterial
    if (!UPGRADED.has(material.name)) return
    let next = replaced.get(material)
    if (!next) {
      next = upgrade(material)
      replaced.set(material, next)
    }
    mesh.material = next
  })
  return [...replaced.values()]
}

/** Live-tune the skin finish (debug panel), without recompiling shaders. */
export function tuneFinish(materials: readonly MeshPhysicalMaterial[], finish: Finish) {
  for (const material of materials) {
    if (!SKIN.has(material.name)) continue
    material.clearcoat = finish.skinCoat
    material.sheen = finish.skinSheen
  }
}
