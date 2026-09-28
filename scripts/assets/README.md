# Asset scripts

Node scripts that build, inspect and process 3D assets. All of them read `character.json`.

## Validator

`validate.mjs` checks a GLB against the contract: file size, extensions, triangles, draw calls, morph targets, skin influences, bone count, exact bone names and hierarchy, required meshes and materials, texture count and sizes (PNG, JPEG, WebP, KTX2), clips, durations, keyed procedural bones, root motion and scale. Zero dependencies, so CI runs it on plain Node.

```bash
corepack pnpm validate:model                                            # both tiers, strict
node scripts/assets/validate.mjs --file model.glb --tier lite           # one file
node scripts/assets/validate.mjs --json                                 # machine-readable
```

## Real model pipeline (phase 3)

`corepack pnpm build:model` turns the image-to-3D source named in `assets/model/fit.json` into the contract GLBs. The Node steps live in `model/` (normalisation, landmarks and skeleton fit, orchestration in `model/run.mjs`) and `build-model.mjs` (assembly); the Blender steps live in `scripts/blender/`. CI runs it (`.github/workflows/model.yml`) and commits the results back. Locally, the Node steps run without Blender:

```bash
node scripts/assets/model/run.mjs --until rig    # normalised source and fitted skeleton in build/model
```

- `assembly/`: what the placeholder and the real model share (skinning, the gltf-transform document, eyes, lids, catchlights, plates, face projection, eye and atlas textures).
- `build-standin.mjs`: a stand-in image-to-3D output (`assets/source/standin-raw.glb`) to develop the pipeline before the owner's model exists.
- `fit.ts`: Zod schema of `assets/model/fit.json`.

## Placeholder generator

`build-placeholder.mjs` builds the phase 2 placeholder mascots from the shared assembly and the `placeholder/` shapes and textures, with the six clips from `placeholder-clips.mjs` (the clip spec the real model reuses). Output is deterministic. Since phase 3 the real model owns `public/models`, so the placeholder writes to `build/placeholder/` unless asked otherwise.

```bash
corepack pnpm build:placeholder             # build/placeholder/mascot.{lite,full}.glb
corepack pnpm build:placeholder --public    # overwrite public/models (fallback only)
```

Phase 4 adds the gltf-transform, KTX-Software and sharp compression steps here.
