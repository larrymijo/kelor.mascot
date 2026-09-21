# Asset scripts

Node scripts that inspect and process 3D assets.

- `validate.mjs`: checks a GLB against `character.json` (file size, triangles, draw calls, bones and names, hierarchy, skin influences, meshes, materials, texture count and sizes, morph targets, clips and extensions). Zero dependencies, so CI can run it on plain Node.

```bash
corepack pnpm validate:model                                # every tier in character.json.files
corepack pnpm validate:model --file model.glb --tier lite   # one file
corepack pnpm validate:model --strict                       # fail when a tier file is missing
corepack pnpm validate:model --json                         # machine-readable output
```

Phase 4 adds the gltf-transform, KTX-Software and sharp processing steps here.
