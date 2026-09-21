# Asset scripts

Node scripts that build, inspect and process 3D assets. All of them read `character.json`.

## Validator

`validate.mjs` checks a GLB against the contract: file size, extensions, triangles, draw calls, morph targets, skin influences, bone count, exact bone names and hierarchy, required meshes and materials, texture count and sizes (PNG, JPEG, WebP, KTX2), clips, durations, keyed procedural bones, root motion and scale. Zero dependencies, so CI runs it on plain Node.

```bash
corepack pnpm validate:model                                            # both tiers, strict
node scripts/assets/validate.mjs --file model.glb --tier lite           # one file
node scripts/assets/validate.mjs --json                                 # machine-readable
```

## Placeholder generator

`build-placeholder.mjs` builds the lite and full placeholder mascots with three.js geometry and gltf-transform: the 28 contract bones, six skinned meshes, five materials, procedural textures and expression atlas (`png.mjs`, `placeholder/textures.mjs`), and the six clips from the data spec in `placeholder-clips.mjs`. Output is deterministic.

```bash
corepack pnpm build:placeholder            # write public/models/mascot.{lite,full}.glb
corepack pnpm build:placeholder --check    # fail if the committed files are stale (CI)
```

Phase 3 replaces the placeholder with the real model at the same paths; `placeholder-clips.mjs` is shaped so the Blender pipeline can reuse it. Phase 4 adds the gltf-transform, KTX-Software and sharp compression steps here.
