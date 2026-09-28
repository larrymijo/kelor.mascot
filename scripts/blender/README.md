# Blender pipeline

Headless Blender 5.2 LTS (CPU) steps of the model pipeline. They run in GitHub Actions (`.github/workflows/model.yml`), never on the owner's machine. The whole pipeline is driven by `corepack pnpm build:model` (`scripts/assets/model/run.mjs`) and configured by `assets/model/fit.json`.

| #   | Step                                                                                                                                | Runs in                                     | Output                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Normalise the source: bake transforms, face +Z, +Y up, 1.2 m, feet on the origin                                                    | Node (`scripts/assets/model/normalize.mjs`) | `build/model/normalized.glb`                                            |
| 2   | Measure landmarks and refit the contract skeleton                                                                                   | Node (`scripts/assets/model/landmarks.mjs`) | `build/model/rig.json`                                                  |
| 3   | Voxel volume, Quadriflow retopology per tier, UVs, bakes (base colour, AO into ORM, normal on full), armature and automatic weights | Blender (`body.py`)                         | `build/model/<tier>/body.glb`, `basecolor.jpg`, `orm.jpg`, `normal.jpg` |
| 4   | Remap joints, repair weights, eyes, lids, catchlights, plates, face shell, materials, clips                                         | Node (`scripts/assets/build-model.mjs`)     | `public/models/mascot.<tier>.glb`                                       |
| 5   | Strict validation against `character.json`                                                                                          | Node (`scripts/assets/validate.mjs`)        | pass or fail                                                            |
| 6   | Review renders: four rest views, face close-up, topology, bone heads, every clip at mid-pose                                        | Blender (`review.py`)                       | `assets/review/phase-3/*.png`                                           |

Steps 1, 2, 4 and 5 are unit tested in Node. Blender only does what Node cannot. CI commits the GLBs, the renders, `pipeline.log` and `summary.json` back to the branch, so results can be reviewed with a plain `git pull`.

Run one script by hand (with Blender installed):

```bash
blender -b --factory-startup --python-exit-code 1 -P scripts/blender/body.py -- --root . --out build/model
```
