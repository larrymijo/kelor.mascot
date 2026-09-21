import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  buildModel,
  contract,
  encodeGlb,
  jpegHeader,
  ktx2Header,
  pngHeader,
  webpVp8Header,
  webpVp8lHeader,
  webpVp8xHeader,
  type ModelOptions,
  type Tier,
} from './fixtures'
import { getImageBytes, parseGlb, readImageSize } from './glb.mjs'
import { main, parseArgs, validateGlb } from './validate.mjs'

type Report = ReturnType<typeof validateGlb>

const validate = (options: ModelOptions = {}): Report =>
  validateGlb({ bytes: buildModel(options), contract, tier: options.tier ?? 'full' })

const rule = (report: Report, id: string) => {
  const result = report.results.find((r) => r.id === id)
  if (!result) throw new Error(`Rule ${id} did not run. Ran: ${report.results.map((r) => r.id)}`)
  return result
}

const failures = (report: Report) => report.results.filter((r) => r.status === 'fail').map((r) => r.id)

describe('glb.mjs', () => {
  it('round-trips the JSON and BIN chunks', () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5])
    const { json, bin: out, version } = parseGlb(encodeGlb({ asset: { version: '2.0' } }, bin))
    expect(version).toBe(2)
    expect(json.asset.version).toBe('2.0')
    expect([...out!.subarray(0, 5)]).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects files that are not GLB', () => {
    expect(() => parseGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}'))).toThrow(/magic/)
    expect(() => parseGlb(new Uint8Array(4))).toThrow(/too small/)
  })

  it('rejects truncated files', () => {
    const glb = encodeGlb({ asset: { version: '2.0' } })
    expect(() => parseGlb(glb.subarray(0, glb.length - 4))).toThrow(/Truncated/)
  })

  it.each([
    ['png', pngHeader(1024, 512)],
    ['ktx2', ktx2Header(1024, 512)],
    ['jpeg', jpegHeader(1024, 512)],
    ['webp', webpVp8xHeader(1024, 512)],
    ['webp', webpVp8Header(1024, 512)],
    ['webp', webpVp8lHeader(1024, 512)],
  ])('reads %s dimensions', (format, bytes) => {
    expect(readImageSize(bytes)).toEqual({ format, width: 1024, height: 512 })
  })

  it('returns null for unknown image data', () => {
    expect(readImageSize(new Uint8Array(32).fill(7))).toBeNull()
  })

  it('reads image bytes from a data URI', () => {
    const uri = `data:image/png;base64,${Buffer.from(pngHeader(256, 256)).toString('base64')}`
    const { bytes } = getImageBytes({}, null, { uri }, () => null)
    expect(readImageSize(bytes!)).toMatchObject({ width: 256, height: 256 })
  })
})

describe('validateGlb on a model that follows the contract', () => {
  it.each<Tier>(['lite', 'full'])('passes every rule for the %s tier', (tier) => {
    const report = validate({ tier })
    expect(failures(report)).toEqual([])
    expect(report.results.filter((r) => r.status === 'warn')).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('runs every rule', () => {
    const ids = validate().results.map((r) => r.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'glb.container',
        'file.size',
        'extensions',
        'geometry.triangles',
        'geometry.drawCalls',
        'geometry.morphTargets',
        'skin.influences',
        'skeleton.skin',
        'skeleton.boneCount',
        'skeleton.names',
        'skeleton.hierarchy',
        'meshes.required',
        'materials.count',
        'materials.required',
        'textures.count',
        'textures.size',
        'animations.required',
        'animations.duration',
        'animations.total',
        'animations.procedural',
        'animations.rootMotion',
        'scale.height',
      ]),
    )
  })
})

describe('validateGlb failures', () => {
  it('fails an invalid container with a hint', () => {
    const report = validateGlb({ bytes: new Uint8Array(64), contract, tier: 'full' })
    expect(rule(report, 'glb.container')).toMatchObject({ status: 'fail', hint: expect.any(String) })
    expect(report.ok).toBe(false)
  })

  it('fails when the file exceeds the tier size budget', () => {
    const report = validate({ tier: 'lite', padBytes: (contract.budgets.lite.maxFileKB + 20) * 1024 })
    expect(rule(report, 'file.size').status).toBe('fail')
  })

  it('fails on disallowed extensions and suggests Meshopt over Draco', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        gltf.extensionsUsed = ['KHR_draco_mesh_compression']
      },
    })
    expect(rule(report, 'extensions')).toMatchObject({ status: 'fail', hint: expect.stringMatching(/Meshopt/) })
  })

  it('fails when the triangle budget is exceeded', () => {
    const report = validate({
      tier: 'lite',
      mutate: ({ gltf }) => {
        const indices = gltf.meshes[0].primitives[0].indices
        gltf.accessors[indices].count = (contract.budgets.lite.maxTriangles + 1) * 3
      },
    })
    expect(rule(report, 'geometry.triangles').status).toBe('fail')
  })

  it('counts triangle strips as indices - 2', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        const body = gltf.meshes[0].primitives[0]
        body.mode = 5
        gltf.accessors[body.indices].count = 1002
      },
    })
    const others = (contract.meshes.required.length - 1) * 200
    expect(rule(report, 'geometry.triangles').message).toContain(`${1000 + others} triangles`)
  })

  it('flags point or line primitives and counts them as draw calls', () => {
    const report = validate({
      mutate: ({ gltf, addAccessor }) => {
        const position = addAccessor({ componentType: 5126, type: 'VEC3', count: 10 })
        gltf.meshes[1].primitives.push({ attributes: { POSITION: position }, mode: 1 })
      },
    })
    expect(rule(report, 'geometry.primitives').status).toBe('warn')
    expect(rule(report, 'geometry.drawCalls').status).toBe('fail')
  })

  it('fails on morph targets', () => {
    const report = validate({
      mutate: ({ gltf, addAccessor }) => {
        const target = addAccessor({ componentType: 5126, type: 'VEC3', count: 10 })
        gltf.meshes[1].primitives[0].targets = [{ POSITION: target }]
      },
    })
    expect(rule(report, 'geometry.morphTargets').status).toBe('fail')
  })

  it('fails on more than 4 influences per vertex', () => {
    const report = validate({
      mutate: ({ gltf, addAccessor }) => {
        const attributes = gltf.meshes[0].primitives[0].attributes
        attributes.JOINTS_1 = addAccessor({ componentType: 5121, type: 'VEC4', count: 10 })
        attributes.WEIGHTS_1 = addAccessor({ componentType: 5126, type: 'VEC4', count: 10 })
      },
    })
    expect(rule(report, 'skin.influences').status).toBe('fail')
  })

  it('lists missing and unexpected bone names', () => {
    const report = validate({
      mutate: ({ gltf, bone }) => {
        gltf.nodes[bone('tail_04')].name = 'Bone.001'
      },
    })
    const names = rule(report, 'skeleton.names')
    expect(names.status).toBe('fail')
    expect(names.message).toContain('missing: tail_04')
    expect(names.message).toContain('unexpected: Bone.001')
  })

  it('fails when a bone has the wrong parent', () => {
    const report = validate({
      mutate: ({ gltf, bone }) => {
        const tail3 = bone('tail_03')
        gltf.nodes[tail3].children = gltf.nodes[tail3].children.filter((c: number) => c !== bone('tail_04'))
        gltf.nodes[bone('hips')].children.push(bone('tail_04'))
      },
    })
    const hierarchy = rule(report, 'skeleton.hierarchy')
    expect(hierarchy.status).toBe('fail')
    expect(hierarchy.message).toContain('tail_04 → hips (expected tail_03)')
  })

  it('fails on too many bones', () => {
    const report = validate({
      mutate: ({ gltf, bone }) => {
        const extras = Array.from({ length: 10 }, (_, i) => gltf.nodes.push({ name: `extra_${i}` }) - 1)
        gltf.nodes[bone('root')].children.push(...extras)
        gltf.skins[0].joints.push(...extras)
      },
    })
    expect(rule(report, 'skeleton.boneCount').status).toBe('fail')
  })

  it('keeps checking the rest of the model when there is no skin', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        gltf.skins = []
      },
    })
    expect(rule(report, 'skeleton.skin').status).toBe('fail')
    expect(rule(report, 'animations.required').status).toBe('pass')
  })

  it('fails on missing meshes and materials, and warns about wrong bindings', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        const plates = gltf.nodes.find((n: { name: string }) => n.name === 'plates')
        plates.name = 'spikes'
        gltf.meshes[plates.mesh].name = 'spikes'
        gltf.materials.find((m: { name: string }) => m.name === 'highlight').name = 'Material.002'
      },
    })
    expect(rule(report, 'meshes.required').message).toContain('missing: plates')
    expect(rule(report, 'materials.required').message).toContain('missing: highlight')
    expect(rule(report, 'meshes.binding').status).toBe('warn')
  })

  it('fails on oversized or non power-of-two textures, including KTX2', () => {
    const report = validate({
      tier: 'lite',
      mutate: ({ gltf, addBufferView }) => {
        gltf.images[0].bufferView = addBufferView(ktx2Header(2048, 2048))
        gltf.images[1].bufferView = addBufferView(pngHeader(1000, 1000))
      },
    })
    const size = rule(report, 'textures.size')
    expect(size.status).toBe('fail')
    expect(size.message).toContain('exceeds 1024px')
    expect(size.message).toContain('not a power of two')
  })

  it('fails on too many textures and warns about unnamed ones', () => {
    const report = validate({
      tier: 'lite',
      mutate: ({ gltf, addBufferView }) => {
        gltf.images[0].name = 'Image_0'
        gltf.images.push({ mimeType: 'image/png', bufferView: addBufferView(pngHeader(64, 64)) })
      },
    })
    expect(rule(report, 'textures.count').status).toBe('fail')
    expect(rule(report, 'textures.names').message).toContain('body_basecolor')
  })

  it('fails on missing clips and wrong durations, and warns about stray clips', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        gltf.animations = gltf.animations.filter((a: { name: string }) => a.name !== 'wave')
        gltf.animations.find((a: { name: string }) => a.name === 'idle').name = 'T-Pose'
        const roar = gltf.animations.find((a: { name: string }) => a.name === 'roar')
        gltf.accessors[roar.samplers[0].input].max = [3]
      },
    })
    expect(rule(report, 'animations.required').message).toContain('missing: idle, wave')
    expect(rule(report, 'animations.unknown').message).toContain('T-Pose')
    expect(rule(report, 'animations.duration').message).toContain('roar 3 s (expected 2 s)')
  })

  it('fails when the total animation length exceeds the budget', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        const look = gltf.animations.find((a: { name: string }) => a.name === 'look_around')
        gltf.accessors[look.samplers[0].input].max = [40]
      },
    })
    expect(rule(report, 'animations.total').status).toBe('fail')
  })

  it('fails when clips key procedural bones or the root', () => {
    const report = validate({
      mutate: ({ gltf, bone }) => {
        const idle = gltf.animations.find((a: { name: string }) => a.name === 'idle')
        idle.channels.push({ sampler: 0, target: { node: bone('eye_L'), path: 'rotation' } })
        idle.channels.push({ sampler: 0, target: { node: bone('root'), path: 'translation' } })
      },
    })
    expect(rule(report, 'animations.procedural').message).toContain('idle:eye_L')
    expect(rule(report, 'animations.rootMotion').message).toContain('idle')
  })

  it('warns when the body height is off scale', () => {
    const report = validate({
      mutate: ({ gltf }) => {
        const position = gltf.meshes[0].primitives[0].attributes.POSITION
        gltf.accessors[position].max[1] = 120
      },
    })
    expect(rule(report, 'scale.height').status).toBe('warn')
    expect(report.ok).toBe(true)
  })
})

describe('CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kelor-validate-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const run = (argv: string[]) => {
    const out: string[] = []
    const err: string[] = []
    const code = main(argv, { log: (s) => out.push(s), error: (s) => err.push(s), cwd: dir })
    return { code, out: out.join('\n'), err: err.join('\n') }
  }

  it('parses options and rejects unknown ones', () => {
    expect(parseArgs(['--file', 'a.glb', '--tier', 'lite', '--json'])).toMatchObject({
      file: 'a.glb',
      tier: 'lite',
      json: true,
    })
    expect(() => parseArgs(['--tier', 'medium'])).toThrow(/--tier/)
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown option/)
  })

  it('validates a file and infers the tier from its name', () => {
    writeFileSync(join(dir, 'mascot.lite.glb'), buildModel({ tier: 'lite' }))
    const { code, out } = run(['--file', 'mascot.lite.glb'])
    expect(code).toBe(0)
    expect(out).toContain('tier lite')
    expect(out).toContain('Result: PASS')
  })

  it('exits 1 with readable output when a rule fails', () => {
    writeFileSync(join(dir, 'broken.glb'), buildModel({ mutate: ({ gltf }) => (gltf.animations = []) }))
    const { code, out } = run(['--file', 'broken.glb'])
    expect(code).toBe(1)
    expect(out).toMatch(/FAIL\s+animations\.required/)
    expect(out).toContain('→ Name the Blender actions')
  })

  it('prints a JSON report', () => {
    writeFileSync(join(dir, 'model.glb'), buildModel())
    const { code, out } = run(['--file', 'model.glb', '--json'])
    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ ok: true, reports: [{ tier: 'full', ok: true }] })
  })

  it('exits 1 when an explicit file is missing and 2 on bad arguments', () => {
    expect(run(['--file', 'nope.glb']).code).toBe(1)
    expect(run(['--tier', 'huge']).code).toBe(2)
  })

  it('skips missing contract files unless --strict, when run as a script', () => {
    const script = resolve(__dirname, 'validate.mjs')
    const output = execFileSync(process.execPath, [script], { encoding: 'utf8' })
    expect(output).toContain('SKIP  lite')
    expect(() => execFileSync(process.execPath, [script, '--strict'], { stdio: 'pipe' })).toThrow()
  })
})
