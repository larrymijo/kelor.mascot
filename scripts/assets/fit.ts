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
      samples: z.int().min(1).max(256),
      cageExtrusionM: z.number().positive().max(0.2),
      maxRayDistanceM: z.number().positive().max(0.5),
      roughness: z.number().min(0).max(1),
      jpegQuality: z.int().min(50).max(100),
    }),
    rig: z.strictObject({ ...docShape, overrides: z.record(boneName, vec3) }),
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
