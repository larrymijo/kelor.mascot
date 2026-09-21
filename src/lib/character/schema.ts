/**
 * Zod schema for `character.json`, the mascot contract.
 *
 * The schema is used in tests and Node tooling only. The runtime imports the
 * JSON through `./index.ts` with a type-only import, so Zod never reaches the
 * client bundle. CI guarantees the JSON matches this schema.
 */
import { z } from 'zod'

/** Every object may carry a `_doc` string, since JSON has no comments. */
const docShape = { _doc: z.string().optional() }

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a #RRGGBB colour')
const snakeName = z.string().regex(/^[a-z][a-z0-9_]*$/, 'Expected snake_case')
const boneName = z
  .string()
  .regex(/^[a-z]+(?:_(?:\d{2}|[LR]))?$/, 'Expected bone names like hips, spine_01 or hand_L')
const posInt = z.int().positive()
const nonNegInt = z.int().nonnegative()
const vec3 = z.tuple([z.number(), z.number(), z.number()])
const range = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([min, max]) => min <= max, 'Range must be [min, max] with min <= max')
const degrees = (max: number) => z.number().positive().max(max)
const lambda = z.number().positive().max(60)

const tierName = z.enum(['full', 'lite'])

const budgetSchema = z.strictObject({
  ...docShape,
  maxFileKB: posInt,
  maxTriangles: posInt,
  maxBones: posInt,
  maxInfluencesPerVertex: z.int().min(1).max(8),
  maxDrawCalls: posInt,
  maxMaterials: posInt,
  maxTextures: nonNegInt,
  maxTextureSize: posInt,
  maxMorphTargets: nonNegInt,
  maxAnimationSeconds: z.number().positive(),
})

const boneSchema = z.strictObject({
  name: boneName,
  parent: boneName.nullable(),
  role: z.enum(['root', 'spine', 'neck', 'head', 'eye', 'eyelid', 'tail', 'leg', 'arm']),
  restHead: vec3,
})

const clipSchema = z.strictObject({
  ...docShape,
  name: snakeName,
  loop: z.boolean(),
  durationS: z.number().positive(),
})

const qualityTierSchema = z.strictObject({
  model: tierName,
  dprMax: z.number().min(0.5).max(3),
  shadows: z.boolean(),
  ao: z.enum(['off', 'half', 'full']),
  bloom: z.boolean(),
  depthOfField: z.boolean(),
  particles: nonNegInt,
  filmGrain: z.boolean(),
})

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0

export const characterSchema = z
  .strictObject({
    ...docShape,
    contractVersion: z.literal(1),

    meta: z.strictObject({
      ...docShape,
      id: snakeName.or(z.string().regex(/^[a-z][a-z0-9-]*$/)),
      name: z.string().min(1).nullable(),
      version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Expected semver'),
      units: z.literal('meters'),
      upAxis: z.literal('+Y'),
      forwardAxis: z.literal('+Z'),
      origin: z.literal('feet-center'),
      heightM: z.number().positive().max(5),
      heightToleranceRatio: z.number().positive().max(0.5),
      headHeightRatio: z.number().positive().max(0.6),
    }),

    files: z.strictObject({
      ...docShape,
      full: z.string().endsWith('.glb'),
      lite: z.string().endsWith('.glb'),
      allowedExtensions: z.array(z.string().regex(/^[A-Z]+_[A-Za-z0-9_]+$/)).min(1),
    }),

    budgets: z.strictObject({ ...docShape, full: budgetSchema, lite: budgetSchema }),

    skeleton: z.strictObject({
      ...docShape,
      rootBone: boneName,
      bones: z.array(boneSchema).min(1),
      procedural: z.array(boneName),
    }),

    meshes: z.strictObject({
      ...docShape,
      required: z
        .array(z.strictObject({ ...docShape, name: snakeName, material: snakeName }))
        .min(1),
    }),

    materials: z.strictObject({
      ...docShape,
      required: z
        .array(
          z.strictObject({
            ...docShape,
            name: snakeName,
            model: z.enum(['pbr', 'unlit']),
            textures: z.array(snakeName),
            alphaMode: z.enum(['OPAQUE', 'MASK', 'BLEND']).optional(),
            emissive: z.string().optional(),
          }),
        )
        .min(1),
    }),

    textures: z.strictObject({
      ...docShape,
      items: z.array(
        z.strictObject({
          name: snakeName,
          colorSpace: z.enum(['srgb', 'linear']),
          size: z.strictObject({ full: posInt, lite: posInt.nullable() }),
        }),
      ),
    }),

    expressions: z.strictObject({
      ...docShape,
      mesh: snakeName,
      texture: snakeName,
      grid: z.tuple([posInt, posInt]),
      default: snakeName,
      cells: z.record(snakeName, z.tuple([nonNegInt, nonNegInt])),
    }),

    clips: z.strictObject({
      ...docShape,
      fps: posInt,
      rootMotion: z.boolean(),
      durationToleranceS: z.number().nonnegative(),
      required: z.array(clipSchema).min(1),
    }),

    gaze: z.strictObject({
      ...docShape,
      target: z.strictObject({ lambda, defaultDistanceM: z.number().positive() }),
      eyes: z.strictObject({
        bones: z.array(boneName).min(1),
        maxYawDeg: degrees(90),
        maxPitchDeg: degrees(90),
        lambda,
      }),
      headChain: z.strictObject({
        ...docShape,
        links: z
          .array(z.strictObject({ bone: boneName, share: z.number().positive().max(1) }))
          .min(1),
        maxYawDeg: degrees(90),
        maxPitchDeg: degrees(90),
        lambda,
      }),
      idle: z.strictObject({
        returnToCameraAfterS: z.number().positive(),
        lookAroundIntervalS: range,
      }),
      blink: z.strictObject({
        bones: z.array(boneName).min(1),
        intervalS: range,
        durationS: z.number().positive().max(1),
        doubleBlinkChance: z.number().min(0).max(1),
        closedAngleDeg: degrees(90),
      }),
    }),

    colors: z.strictObject({
      ...docShape,
      mascot: z.record(z.string(), hexColor),
      eyes: z.strictObject({ sclera: hexColor, iris: hexColor, highlight: hexColor }),
      brandMono: z.record(z.string(), hexColor),
    }),

    egg: z.strictObject({
      ...docShape,
      shape: z.literal('hexagonal-prism'),
      heightM: z.number().positive(),
      radiusM: z.number().positive(),
      bevelM: z.number().nonnegative(),
      faceColors: z.array(hexColor).min(1),
      crackGlow: z.string(),
      wobble: z.strictObject({
        maxAngleDeg: degrees(45),
        frequencyHz: z.number().positive().max(10),
      }),
      minDisplayS: z.number().nonnegative(),
      hatchDurationS: z.number().positive(),
    }),

    quality: z.strictObject({
      ...docShape,
      default: z.enum(['high', 'medium', 'low']),
      tiers: z.strictObject({
        high: qualityTierSchema,
        medium: qualityTierSchema,
        low: qualityTierSchema,
      }),
      performanceMonitor: z.strictObject({
        lowerFps: posInt,
        upperFps: posInt,
        flipflops: posInt,
      }),
    }),

    accessibility: z.strictObject({
      ...docShape,
      reducedMotion: z.strictObject({
        cameraOrbit: z.boolean(),
        particles: z.boolean(),
        filmGrain: z.boolean(),
        hatch: z.enum(['cut', 'fade', 'play']),
        gazeLambdaScale: z.number().positive().max(1),
        idleClip: snakeName,
      }),
    }),
  })
  .superRefine((c, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })

    // Skeleton: unique names, one root, parents declared before children.
    const seen = new Map<string, number>()
    c.skeleton.bones.forEach((bone, i) => {
      if (seen.has(bone.name))
        issue(['skeleton', 'bones', i, 'name'], `Duplicate bone "${bone.name}"`)
      if (bone.parent === null) {
        if (bone.name !== c.skeleton.rootBone) {
          issue(
            ['skeleton', 'bones', i, 'parent'],
            `Only "${c.skeleton.rootBone}" may have no parent`,
          )
        }
      } else if (!seen.has(bone.parent)) {
        issue(
          ['skeleton', 'bones', i, 'parent'],
          `Parent "${bone.parent}" of "${bone.name}" must be declared before it`,
        )
      }
      seen.set(bone.name, i)
    })
    const bones = new Set(seen.keys())
    if (!bones.has(c.skeleton.rootBone)) {
      issue(['skeleton', 'rootBone'], `Root bone "${c.skeleton.rootBone}" is not declared`)
    }
    if (bones.size > c.budgets.full.maxBones) {
      issue(['skeleton', 'bones'], `${bones.size} bones exceed budgets.full.maxBones`)
    }

    // Left/right symmetry: every _L bone has an _R twin mirrored on X.
    c.skeleton.bones.forEach((bone, i) => {
      if (!bone.name.endsWith('_L')) return
      const twinName = `${bone.name.slice(0, -2)}_R`
      const twin = c.skeleton.bones.find((b) => b.name === twinName)
      if (!twin) return issue(['skeleton', 'bones', i], `Missing mirrored bone "${twinName}"`)
      const [x, y, z] = bone.restHead
      const [tx, ty, tz] = twin.restHead
      if (Math.abs(x + tx) > 1e-6 || Math.abs(y - ty) > 1e-6 || Math.abs(z - tz) > 1e-6) {
        issue(
          ['skeleton', 'bones', i, 'restHead'],
          `"${bone.name}" and "${twinName}" are not mirrored on X`,
        )
      }
    })

    const requireBone = (path: (string | number)[], name: string) => {
      if (!bones.has(name)) issue(path, `Unknown bone "${name}"`)
    }
    c.skeleton.procedural.forEach((b, i) => requireBone(['skeleton', 'procedural', i], b))

    // Gaze and blink reference real bones; eyes and lids stay procedural.
    const procedural = new Set(c.skeleton.procedural)
    for (const [key, list] of [
      ['eyes', c.gaze.eyes.bones],
      ['blink', c.gaze.blink.bones],
    ] as const) {
      list.forEach((b, i) => {
        requireBone(['gaze', key, 'bones', i], b)
        if (!procedural.has(b))
          issue(['gaze', key, 'bones', i], `"${b}" must be listed in skeleton.procedural`)
      })
    }
    c.gaze.headChain.links.forEach((l, i) =>
      requireBone(['gaze', 'headChain', 'links', i, 'bone'], l.bone),
    )
    const shareSum = c.gaze.headChain.links.reduce((sum, l) => sum + l.share, 0)
    if (Math.abs(shareSum - 1) > 1e-6) {
      issue(['gaze', 'headChain', 'links'], `Shares must add up to 1 (got ${shareSum})`)
    }

    // Meshes -> materials -> textures.
    const materials = new Set(c.materials.required.map((m) => m.name))
    const textures = new Map(c.textures.items.map((t) => [t.name, t]))
    const meshes = new Set(c.meshes.required.map((m) => m.name))
    c.meshes.required.forEach((m, i) => {
      if (!materials.has(m.material))
        issue(['meshes', 'required', i, 'material'], `Unknown material "${m.material}"`)
    })
    c.materials.required.forEach((m, i) => {
      m.textures.forEach((t, j) => {
        if (!textures.has(t))
          issue(['materials', 'required', i, 'textures', j], `Unknown texture "${t}"`)
      })
      if (m.emissive !== undefined && !(m.emissive in c.colors.mascot)) {
        issue(['materials', 'required', i, 'emissive'], `Unknown colour token "${m.emissive}"`)
      }
    })

    // Texture sizes fit each tier budget and are powers of two.
    for (const tier of tierName.options) {
      const budget = c.budgets[tier]
      let count = 0
      c.textures.items.forEach((t, i) => {
        const size = t.size[tier]
        if (size === null) return
        count += 1
        if (!isPowerOfTwo(size))
          issue(['textures', 'items', i, 'size', tier], `${size} is not a power of two`)
        if (size > budget.maxTextureSize) {
          issue(
            ['textures', 'items', i, 'size', tier],
            `${size} exceeds budgets.${tier}.maxTextureSize`,
          )
        }
      })
      if (count > budget.maxTextures) {
        issue(['textures', 'items'], `${count} ${tier} textures exceed budgets.${tier}.maxTextures`)
      }
    }
    if (c.budgets.lite.maxFileKB > c.budgets.full.maxFileKB) {
      issue(['budgets', 'lite', 'maxFileKB'], 'lite must not be heavier than full')
    }
    if (c.budgets.lite.maxTriangles > c.budgets.full.maxTriangles) {
      issue(['budgets', 'lite', 'maxTriangles'], 'lite must not have more triangles than full')
    }
    if (c.files.full === c.files.lite)
      issue(['files', 'lite'], 'full and lite must be different files')

    // Expressions live inside the atlas grid, one cell each.
    const [cols, rows] = c.expressions.grid
    const usedCells = new Map<string, string>()
    for (const [name, [col, row]] of Object.entries(c.expressions.cells)) {
      if (col >= cols || row >= rows)
        issue(['expressions', 'cells', name], `Cell [${col}, ${row}] is outside the grid`)
      const key = `${col},${row}`
      const other = usedCells.get(key)
      if (other)
        issue(['expressions', 'cells', name], `Shares cell [${col}, ${row}] with "${other}"`)
      usedCells.set(key, name)
    }
    if (!(c.expressions.default in c.expressions.cells)) {
      issue(['expressions', 'default'], `Default expression "${c.expressions.default}" has no cell`)
    }
    if (!meshes.has(c.expressions.mesh))
      issue(['expressions', 'mesh'], `Unknown mesh "${c.expressions.mesh}"`)
    if (!textures.has(c.expressions.texture)) {
      issue(['expressions', 'texture'], `Unknown texture "${c.expressions.texture}"`)
    }

    // Clips: unique names and total length within budget.
    const clipNames = new Set<string>()
    c.clips.required.forEach((clip, i) => {
      if (clipNames.has(clip.name))
        issue(['clips', 'required', i, 'name'], `Duplicate clip "${clip.name}"`)
      clipNames.add(clip.name)
    })
    const total = c.clips.required.reduce((sum, clip) => sum + clip.durationS, 0)
    if (total > c.budgets.full.maxAnimationSeconds) {
      issue(
        ['clips', 'required'],
        `Clips add up to ${total} s, over budgets.full.maxAnimationSeconds`,
      )
    }
    if (!clipNames.has(c.accessibility.reducedMotion.idleClip)) {
      issue(['accessibility', 'reducedMotion', 'idleClip'], 'Must name a required clip')
    }

    // Misc cross-references.
    if (!(c.egg.crackGlow in c.colors.mascot))
      issue(['egg', 'crackGlow'], `Unknown colour token "${c.egg.crackGlow}"`)
    const pm = c.quality.performanceMonitor
    if (pm.lowerFps >= pm.upperFps)
      issue(['quality', 'performanceMonitor'], 'lowerFps must be below upperFps')
  })

export type Character = z.infer<typeof characterSchema>
export type CharacterTier = z.infer<typeof tierName>
export type QualityTierName = keyof Character['quality']['tiers']

/** Parse unknown data as a character contract, throwing a readable error. */
export function parseCharacter(data: unknown): Character {
  const result = characterSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Invalid character contract:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
