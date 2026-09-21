# Blender pipeline (phase 3)

Headless Blender (CPU) scripts, run in GitHub Actions or a cloud session, never on the owner's machine.

Route A, every step parameterised from `character.json`:

1. Import the image-to-3D mesh and clean it (merge, fill holes, recalc normals).
2. Remesh to quads at the target density per tier.
3. Reproject the source texture onto the new UVs.
4. Add eyes, eyelids and highlights as separate geometry.
5. Build the armature from `skeleton.bones` (names, hierarchy, `restHead`).
6. Automatic weights, then fix eyes and lids to 100 % on their bones.
7. Bake AO into `body_orm`, export glTF, then compress with gltf-transform (Meshopt + KTX2).
8. Validate with `corepack pnpm validate:model`.

Convention: `NN_step_name.py` (for example `01_cleanup.py`), each runnable as `blender -b -P <script> -- --config character.json`.
