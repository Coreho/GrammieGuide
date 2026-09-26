#!/usr/bin/env sh
# Rebuild Buddy's model from the Meshy downloads: fix the rig, bake every clip
# onto it, and write the GLB the launcher ships.
#
#   sh scripts/blender/buildBuddy.sh
#
# Inputs (CatModel/meshy/, gitignored - generated, ~150 MB):
#   rigged/basic_animations_*_glb.glb  walk + run from the rigging task (also the mesh)
#   anims/<clip>/animation_glb.glb     library clips bought with `meshy animate create`
#                                      (rig task 01a0dcaf-4f10-746b-86fa-75e22623504f)
# Clip names here are the names the app plays them by (buddy/clips.ts).
set -e
cd "$(dirname "$0")/../.."

BLENDER="${BLENDER:-C:/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
OUT=src/renderer/launcher/src/buddy/assets/buddy.glb
R=CatModel/meshy/rigged
A=CatModel/meshy/anims

# Meshy's plain "Idle" (anims/idle) turns his whole body around; not used.
CLIPS="idle_calm idle_soft look_around sway stretch wave big_wave bow listen talk
  talk_point agree think shrug heart cheer fist_pump motivate dance happy_jump beckon walk_casual"

set -- "walk=$R/basic_animations_walking_glb.glb" "run=$R/basic_animations_running_glb.glb"
for c in $CLIPS; do
  set -- "$@" "$c=$A/$c/animation_glb.glb"
done

BUDDY_BLEND=CatModel/meshy/fixed/buddy.blend "$BLENDER" -b --factory-startup --python scripts/blender/fixCatRig.py -- "$OUT" "$@"
