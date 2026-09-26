"""
Fix the Meshy auto-rig on the Buddy cat and bake every animation clip onto
it: lower the hip/knee joints to where the legs actually are, redo the
leg/belly skin weights, keep the arms out of his round belly, keep his feet
on the floor, and export one GLB with every clip.

All clips must come from the same Meshy rigging task (same skeleton). The
first clip's file also supplies the mesh.

Run headless from the repo root:
  blender -b --factory-startup --python scripts/blender/fixCatRig.py -- \
    <out.glb> <name>=<clip.glb> [<name>=<clip.glb> ...]

scripts/blender/buildBuddy.sh runs it with the full clip list.
Tunables are the constants below; re-run to change them.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Quaternion, kdtree

HIP_Z = 0.30    # world height (m) of the hip joints; legs split at ~0.27
KNEE_Z = 0.20   # world height of the knees; ankles are at ~0.095
MASK_LO, MASK_HI = 0.26, 0.36  # below LO: pure leg weights; above HI: pure body weights
# His jacket is wider than his shoulders, so an arm hanging closer than this
# to straight down (measured against his chest, seen from the front) sinks
# into it. Human clips hang the arms at ~10-30 degrees.
ARM_FLOOR_DEG = 45
ARM_SOFT_DEG = 20  # blend band around the floor, so the push eases in instead of snapping

LEGS = {s + n for s in ('Left', 'Right') for n in ('UpLeg', 'Leg', 'Foot', 'ToeBase')}
TRUNK = {'Hips', 'Spine02', 'Spine01', 'Spine'}
THIGH_KNEE = {s + n for s in ('Left', 'Right') for n in ('UpLeg', 'Leg')}
FEET = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']

argv = sys.argv[sys.argv.index('--') + 1:]
out_path = os.path.abspath(argv[0])
clips = [(a.split('=', 1)[0], os.path.abspath(a.split('=', 1)[1])) for a in argv[1:]]


def fcurves(action):
    try:
        return list(action.fcurves)
    except AttributeError:  # Blender 5 layered actions
        return [fc for l in action.layers for s in l.strips for cb in s.channelbags for fc in cb.fcurves]


def use_action(act):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]


def set_time(t):
    bpy.context.scene.frame_set(int(math.floor(t)), subframe=t - math.floor(t))


def key_times(act, data_path):
    return sorted({round(kp.co[0], 4) for fc in fcurves(act) if fc.data_path == data_path for kp in fc.keyframe_points})


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- import
bpy.ops.import_scene.gltf(filepath=clips[0][1])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm)
actions = [arm.animation_data.action]
for name, path in clips[1:]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new_objs = set(bpy.data.objects) - before
    other = next(o for o in new_objs if o.type == 'ARMATURE')
    actions.append(other.animation_data.action)
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
for act, (name, _) in zip(actions, clips):
    act.name = name
    act.use_fake_user = True
# Meshy's files also carry a stray "Icosphere" object; only the cat ships.
for o in list(bpy.data.objects):
    if o not in (arm, mesh):
        bpy.data.objects.remove(o, do_unlink=True)
# The importer also parks the first clip on an NLA track of its own; left
# there, it gets merged with ours and exported twice.
for tr in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(tr)
bpy.data.orphans_purge(do_recursive=True)

to_world = arm.matrix_world
to_arm = to_world.inverted()


def lowest_foot():
    return min((to_world @ arm.pose.bones[n].head).z for n in FEET)


# Every pose sample below only needs bone positions; skinning 15k vertices
# on each of the ~20k frame changes would just slow it down.
for m in mesh.modifiers:
    m.show_viewport = False

# Meshy retargets each clip to its own (too-long-legged) rig, so on that rig
# the feet touch the floor where they should and leave it only for jumps and
# steps. Record that height profile now; after the legs get shorter the Hips
# are moved key by key to reproduce it.
arm.data.pose_position = 'POSE'
foot_profile = {}
for act in actions:
    use_action(act)
    prof = {}
    for t in key_times(act, 'pose.bones["Hips"].location'):
        set_time(t)
        prof[t] = lowest_foot()
    foot_profile[act.name] = prof

# ---------------------------------------------------------------- weights (before)
names = {g.index: g.name for g in mesh.vertex_groups}
orig = [{names[g.group]: g.weight for g in v.groups if g.weight > 0} for v in mesh.data.vertices]

# ---------------------------------------------------------------- joints
# Each leg joint is slid along the bone directions Meshy chose, so every bone
# keeps its rest ORIENTATION. The clips store rotations relative to rest, so
# keeping orientation keeps the knee bends meaning the same thing; only the
# thigh/shin lengths change. The feet stay put.
arm.data.pose_position = 'REST'
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for b in eb:
    b.use_connect = False
for side in ('Left', 'Right'):
    up, leg, foot = eb[side + 'UpLeg'], eb[side + 'Leg'], eb[side + 'Foot']
    hip_w, knee_w, foot_w = (to_world @ b.head for b in (up, leg, foot))
    thigh, shin = knee_w - hip_w, foot_w - knee_w
    b_ = (foot_w.z - KNEE_Z) / shin.z           # fraction of the shin to keep
    new_knee = foot_w - shin * b_
    a_ = (new_knee.z - HIP_Z) / thigh.z         # fraction of the thigh to keep
    new_hip = new_knee - thigh * a_
    print(f'{side}: hip {tuple(round(c, 3) for c in hip_w)} -> {tuple(round(c, 3) for c in new_hip)}, '
          f'knee {tuple(round(c, 3) for c in knee_w)} -> {tuple(round(c, 3) for c in new_knee)}')
    up.translate(to_arm @ new_hip - up.head)
    leg.translate(to_arm @ new_knee - leg.head)
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- auto weights
# The glTF importer invents bone lengths (these come out ~10 m long, reaching
# far outside the cat), and bone heat weights by distance to each bone's
# head-tail segment. So weight against a throwaway copy of the skeleton whose
# bones run joint to joint. The real armature is left alone: changing its
# tails would change bone orientations and break the clips.
CHAIN_TAIL = {'Hips': 'Spine02', 'Spine02': 'Spine01', 'Spine01': 'Spine', 'Spine': 'neck'}
for s in ('Left', 'Right'):
    CHAIN_TAIL.update({s + 'UpLeg': s + 'Leg', s + 'Leg': s + 'Foot', s + 'Foot': s + 'ToeBase'})

weight_arm = arm.copy()
weight_arm.data = arm.data.copy()
weight_arm.animation_data_clear()
bpy.context.scene.collection.objects.link(weight_arm)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = weight_arm
bpy.ops.object.mode_set(mode='EDIT')
web = weight_arm.data.edit_bones
for b in web:
    b.use_connect = False
for b, child in CHAIN_TAIL.items():
    web[b].tail = web[child].head.copy()
for s in ('Left', 'Right'):
    toe = web[s + 'ToeBase']
    toe.tail = toe.head + to_arm.to_3x3() @ Vector((0, -0.06, 0))  # 6 cm forward
bpy.ops.object.mode_set(mode='OBJECT')


def auto_weights(deform):
    for b in weight_arm.data.bones:
        b.use_deform = b.name in deform
    # glTF splits vertices along UV seams (the mesh imports as ~700 pieces),
    # which bone-heat weighting can't diffuse across. Weight a welded copy,
    # then look each real vertex up in it.
    tmp = mesh.copy()
    tmp.data = mesh.data.copy()
    bpy.context.scene.collection.objects.link(tmp)
    tmp.vertex_groups.clear()
    tmp.modifiers.clear()
    bm = bmesh.new(); bm.from_mesh(tmp.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)  # 0.1 mm in world
    bm.to_mesh(tmp.data); bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    tmp.select_set(True); weight_arm.select_set(True)
    bpy.context.view_layer.objects.active = weight_arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    tn = {g.index: g.name for g in tmp.vertex_groups}
    kd = kdtree.KDTree(len(tmp.data.vertices))
    for v in tmp.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    out, empty = [], 0
    for v in mesh.data.vertices:
        _, i, _ = kd.find(v.co)
        w = {tn[g.group]: g.weight for g in tmp.data.vertices[i].groups if g.weight > 0}
        empty += not w
        out.append(w)
    print(f'auto weights over {sorted(deform)}: {empty} vertices got nothing')
    bpy.data.objects.remove(tmp, do_unlink=True)
    return out


leg_w = auto_weights(LEGS | {'Hips'})
trunk_w = auto_weights(TRUNK)
bpy.data.objects.remove(weight_arm, do_unlink=True)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


new = []
kept_tail = 0
for v, o, L, T in zip(mesh.data.vertices, orig, leg_w, trunk_w):
    z = (mesh.matrix_world @ v.co).z
    # The tail and seat are already on Hips in Meshy's rig and look right;
    # auto-weighting would glue the tail tip (which rests by the right foot)
    # to that foot.
    if o and max(o, key=o.get) == 'Hips':
        m = 0.0
        kept_tail += 1
    else:
        m = 1 - smooth((z - MASK_LO) / (MASK_HI - MASK_LO))
    # Body: Meshy's weights, but whatever it gave the thighs/knees (the whole
    # jacket front) goes to the trunk bones in the proportions heat gives them.
    body = {k: w for k, w in o.items() if k not in THIGH_KNEE}
    share = sum(w for k, w in o.items() if k in THIGH_KNEE)
    ts = sum(T.values()) or 1
    for k, w in (T.items() if T else [('Hips', 1.0)]):
        body[k] = body.get(k, 0) + share * w / ts
    ls = sum(L.values())
    legs = {k: w / ls for k, w in L.items()} if ls else body
    w = {}
    for k, x in legs.items():
        w[k] = w.get(k, 0) + m * x
    for k, x in body.items():
        w[k] = w.get(k, 0) + (1 - m) * x
    top = sorted(((x, k) for k, x in w.items() if x > 1e-4), reverse=True)[:4]  # glTF: 4 influences
    s = sum(x for x, _ in top) or 1
    new.append({k: x / s for x, k in top})
print('vertices kept on Meshy weights (tail/seat):', kept_tail)

idx = range(len(mesh.data.vertices))
for g in mesh.vertex_groups:
    g.remove(list(idx))
groups = {g.name: g for g in mesh.vertex_groups}
for i, w in enumerate(new):
    for k, x in w.items():
        (groups.get(k) or mesh.vertex_groups.new(name=k)).add([i], x, 'REPLACE')

arm.data.pose_position = 'POSE'

# ---------------------------------------------------------------- arms out of the belly
# Measured in the chest's frame (so a leaning torso doesn't count), seen from
# the front: how far each upper arm is from hanging straight down. Anything
# under ARM_FLOOR_DEG is rotated outward about the chest's forward axis. Arms
# reaching forward (clapping, pointing) are mostly out of that plane, so the
# correction fades with how much of the arm lies in it.
chest = arm.pose.bones['Spine']
chest_rest = chest.bone.matrix_local.to_3x3()
lo = math.radians(ARM_FLOOR_DEG - ARM_SOFT_DEG / 2)
hi = math.radians(ARM_FLOOR_DEG + ARM_SOFT_DEG / 2)


def arm_push(theta):
    """Outward rotation taking theta to a smooth max(theta, ARM_FLOOR_DEG)."""
    if theta >= hi:
        return 0.0
    if theta <= lo:
        return (lo + hi) / 2 - theta
    return (hi - theta) ** 2 / (2 * (hi - lo))

worst_arm = {}
for act in actions:
    use_action(act)
    worst = 0.0
    for side, sign in (('Left', 1), ('Right', -1)):
        pb = arm.pose.bones[side + 'Arm']
        path = f'pose.bones["{pb.name}"].rotation_quaternion'
        new_q = {}
        for t in key_times(act, path):
            set_time(t)
            # chest pose rotation relative to its rest, in armature space
            chest_rot = chest.matrix.to_3x3() @ chest_rest.inverted()
            to_chest = chest_rot.inverted()
            d = to_chest @ (arm.pose.bones[side + 'ForeArm'].head - pb.head)
            d.normalize()
            # the armature is Z-up with the cat facing -Y; up to scale, same as world
            plane = math.hypot(d.x, d.z)
            theta = math.atan2(sign * d.x, -d.z)
            # Only a hanging arm can sink into the belly. An arm raised past
            # the head toward the other side also reads as a small/negative
            # theta, and pushing that one out would fling it sideways.
            push = arm_push(theta) * plane * smooth(-d.z / 0.3)
            worst = max(worst, math.degrees(push))
            if push < 1e-4:
                new_q[t] = None
                continue
            # rotate outward about the chest's forward axis, through the shoulder
            # (about -Y the left arm swings toward +X, about +Y the right toward -X)
            axis = chest_rot @ Vector((0, -sign, 0))
            r = Quaternion(axis, push).to_matrix()
            m = pb.matrix.copy()
            head = m.translation.copy()
            rot = (r @ m.to_3x3()).to_4x4()
            rot.translation = head
            pb.matrix = rot
            bpy.context.view_layer.update()
            new_q[t] = pb.rotation_quaternion.copy()
        qfc = sorted((fc for fc in fcurves(act) if fc.data_path == path), key=lambda f: f.array_index)
        prev = None
        for t in sorted(new_q):
            q = new_q[t]
            if q is None:
                prev = None
                continue
            if prev is not None:
                q.make_compatible(prev)
            prev = q
            for fc in qfc:
                for kp in fc.keyframe_points:
                    if round(kp.co[0], 4) == t:
                        d_ = q[fc.array_index] - kp.co[1]
                        kp.co[1] += d_
                        kp.handle_left[1] += d_
                        kp.handle_right[1] += d_
        for fc in qfc:
            fc.update()
    worst_arm[act.name] = worst

# ---------------------------------------------------------------- re-ground
hips_rest3 = arm.data.bones['Hips'].matrix_local.to_3x3()
sc = bpy.context.scene
for act in actions:
    use_action(act)
    loc = sorted((fc for fc in fcurves(act) if fc.data_path == 'pose.bones["Hips"].location'), key=lambda f: f.array_index)
    fix, worst = {}, 0
    for t, target in foot_profile[act.name].items():
        set_time(t)
        dz = target - lowest_foot()
        worst = max(worst, abs(dz))
        fix[t] = hips_rest3.inverted() @ (to_arm.to_3x3() @ Vector((0, 0, dz)))
    for fc in loc:
        for kp in fc.keyframe_points:
            d = fix[round(kp.co[0], 4)][fc.array_index]
            kp.co[1] += d
            kp.handle_left[1] += d
            kp.handle_right[1] += d
        fc.update()
    f0, f1 = act.frame_range
    print(f'CLIP {act.name:<14} {(f1 - f0) / sc.render.fps:5.1f}s  feet re-grounded (max {worst * 100:.1f} cm), '
          f'arms pushed out (max {worst_arm[act.name]:.0f} deg)')

# Every clip goes out as its own glTF animation.
arm.animation_data.action = None
for act in actions:
    tr = arm.animation_data.nla_tracks.new()
    tr.name = act.name
    tr.strips.new(act.name, int(act.frame_range[0]), act)

os.makedirs(os.path.dirname(out_path), exist_ok=True)
for m in mesh.modifiers:
    m.show_viewport = True

# Meshy ships the color map as full-strength emission on a metallic material,
# i.e. an "unlit" look that ignores the scene's lights (and renders near-black
# in three.js without an environment map). Make it plain matte clay instead.
for mat in mesh.data.materials:
    if not (mat and mat.use_nodes):
        continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        continue
    for name, value in (('Emission Strength', 0.0), ('Emission Color', (0, 0, 0, 1)), ('Metallic', 0.0),
                        ('Roughness', 0.85), ('Specular IOR Level', 0.3), ('Specular Tint', (1, 1, 1, 1))):
        inp = bsdf.inputs.get(name)
        if inp is None:
            continue
        for link in list(inp.links):
            nt.links.remove(link)
        inp.default_value = value

# JPEG: the color map has no alpha, and as PNG it was 3.8 MB of a ~6.5 MB file.
bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_animation_mode='ACTIONS',
                          export_image_format='JPEG', export_jpeg_quality=90)
if os.environ.get('BUDDY_BLEND'):  # a .blend for hand tweaks, kept out of src/
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ['BUDDY_BLEND']))
print('EXPORTED', out_path)
