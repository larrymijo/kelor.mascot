/**
 * Zod schema for assets/model/fit.json: the model-specific knobs that turn
 * one image-to-3D source into the contract model. Used in tests; the Blender
 * scripts read the JSON directly and build-model.mjs trusts it after CI.
 */
import { z } from 'zod'

const docShape = { _doc: z.string().optional() }
const axis = z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z'])
const tiers = <T extends z.ZodType>(value: T) => z.strictObject({ full: value, lite: value })
const boneName = z.string().regex(/^[a-z]+(?:_(?:\d{2}|[LR]))?$/)
const vec3 = z.tuple([z.number(), z.number(), z.number()])

/** One tusk pair: where along the half width, its size, its gap to the skin and its curl. */
const tuskSchema = z.strictObject({
  at: z.number().min(0).max(1),
  length: z.number().positive().max(0.12),
  radius: z.number().positive().max(0.03),
  clearanceM: z.number().min(0).max(0.02),
  curl: z.number().min(0).max(1),
})

export const fitSchema = z
  .strictObject({
    ...docShape,
    source: z.string().regex(/^assets\/source\/[\w.-]+\.glb$/, 'Sources live in assets/source/'),
    orientation: z.strictObject({ ...docShape, forward: axis, up: axis }),
    symmetrize: z.boolean(),
    retopo: z.strictObject({
      ...docShape,
      voxelSizeM: z.number().min(0.002).max(0.05),
      targetQuads: tiers(z.int().min(500).max(12000)),
      smoothIterations: z.int().min(0).max(10),
    }),
    bake: z.strictObject({
      ...docShape,
      size: tiers(z.int().refine((n) => n > 0 && (n & (n - 1)) === 0, 'Power of two')),
      baseColorSize: tiers(z.int().refine((n) => n > 0 && (n & (n - 1)) === 0, 'Power of two')),
      normalSize: z.int().refine((n) => n > 0 && (n & (n - 1)) === 0, 'Power of two'),
      samples: z.int().min(1).max(256),
      cageExtrusionM: z.number().positive().max(0.2),
      maxRayDistanceM: z.number().positive().max(0.5),
      roughness: z.number().min(0).max(1),
      jpegQuality: z.int().min(50).max(100),
    }),
    compress: z.strictObject({
      ...docShape,
      meshoptLevel: z.enum(['medium', 'high']),
      textures: tiers(z.enum(['jpeg', 'webp', 'ktx2'])),
    }),
    rig: z.strictObject({
      ...docShape,
      overrides: z.record(boneName, vec3),
      influenceLimitsM: z.record(
        z.enum(['spine', 'neck', 'head', 'tail', 'leg', 'arm']),
        z.number().positive().max(1),
      ),
      armpitMarginM: z.number().min(0).max(0.2),
      weightSmoothing: z.strictObject({
        iterations: z.int().min(0).max(20),
        factor: z.number().min(0).max(1),
      }),
      armSeparation: z.strictObject({
        stepM: z.number().positive().max(0.05),
        falloffM: z.number().positive().max(0.1),
        maxBodyMoveM: z.number().positive().max(0.1),
      }),
    }),
    eyes: z.strictObject({
      ...docShape,
      x: z.number().positive().max(0.3),
      y: z.number().positive().max(1.5).nullable(),
      protrude: z.number().min(0.2).max(1),
    }),
    face: z.strictObject({
      ...docShape,
      mouthY: z.number().positive().max(1.5).nullable(),
      halfWidth: z.number().positive().max(0.4),
      up: z.number().positive().max(0.3),
      down: z.number().positive().max(0.3),
      offsetM: z.number().positive().max(0.01),
    }),
    mouth: z.strictObject({
      ...docShape,
      halfWidth: z.number().positive().max(0.3),
      smile: z.number().min(-0.05).max(0.05),
      hingeBackM: z.number().positive().max(0.5),
      cutDepthM: z.number().positive().max(0.2),
      cavityHeightM: z.number().positive().max(0.15),
      teeth: z.strictObject({
        upperPerSide: z.number().int().min(0).max(12),
        lowerPerSide: z.number().int().min(0).max(12),
        rootM: z.number().min(0).max(0.02),
        row: z.strictObject({
          length: z.number().positive().max(0.08),
          radius: z.number().positive().max(0.03),
          thickness: z.number().positive().max(1),
          insetM: z.number().min(0).max(0.03),
          rakeDeg: z.number().min(0).max(80),
        }),
        tusks: z.strictObject({
          upper: tuskSchema,
          lower: tuskSchema,
          rings: z.number().int().min(0).max(12),
        }),
        gums: z.strictObject({
          radiusM: z.number().positive().max(0.03),
          depth: z.number().positive().max(3),
          insetM: z.number().min(0).max(0.03),
        }),
      }),
    }),
    plates: z.strictObject({
      ...docShape,
      embed: z.number().min(0).max(0.9),
      items: z
        .array(
          z.strictObject({
            bone: boneName,
            t: z.number().min(0).max(1),
            size: z.number().positive().max(0.2),
            dir: z.tuple([z.number(), z.number()]),
          }),
        )
        .min(1),
    }),
    review: z.strictObject({
      ...docShape,
      resolution: z.int().min(128).max(2048),
      samples: z.int().min(1).max(256),
    }),
  })
  .superRefine((fit, ctx) => {
    const forwardAxis = fit.orientation.forward.slice(1)
    const upAxis = fit.orientation.up.slice(1)
    if (forwardAxis === upAxis) {
      ctx.addIssue({ code: 'custom', path: ['orientation'], message: 'forward and up must differ' })
    }
    if (fit.retopo.targetQuads.lite > fit.retopo.targetQuads.full) {
      ctx.addIssue({ code: 'custom', path: ['retopo', 'targetQuads'], message: 'lite above full' })
    }
  })

export type Fit = z.infer<typeof fitSchema>
