"""Build real stitched geometry from the supplied artwork; never edit the PNG."""
import math
import hashlib
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'thelifeofpita/public/models'
bpy.ops.wm.read_factory_settings(use_empty=True)
source = bpy.data.images.load(str(ROOT / 'models/verified.png'))
iw, ih = source.size
pixels = np.array(source.pixels[:], dtype=np.float32).reshape(ih, iw, 4)
mask = (pixels[:, :, :3].mean(axis=2) > .45) & (pixels[:, :, 3] > .5)
scale = 7 / iw
W, H = 7.32, ih * scale + .30

def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m

cloth = material('Charcoal woven backing', (.009, .011, .014), .92)
thread = material('Ivory embroidery yarn', (.82, .80, .74), .60)
border = material('Black merrow edge thread', (.016, .019, .024), .68)

# Tangent-space woven normal texture, retained in the web export. Alternating
# warp/weft ridges create an actual light response, not painted highlights.
res = 1024
y, x = np.mgrid[0:res, 0:res] / res
warp = np.sin(x * 260 * math.tau)
weft = np.sin(y * 80 * math.tau)
over = ((np.floor(x*260) + np.floor(y*80)) % 2) == 0
nx = np.where(over, warp * .34, warp * .09)
ny = np.where(over, weft * .09, weft * .34)
nz = np.sqrt(1 - nx*nx - ny*ny)
rgba = np.stack((nx*.5+.5, ny*.5+.5, nz*.5+.5, np.ones_like(nx)), axis=-1)
normal = bpy.data.images.new('Woven fabric normals', width=res, height=res)
normal.colorspace_settings.name = 'Non-Color'
normal.pixels.foreach_set(rgba.astype(np.float32).ravel())
normal.pack()
nodes = cloth.node_tree.nodes
tex = nodes.new('ShaderNodeTexImage'); tex.image = normal
n = nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = .28
cloth.node_tree.links.new(tex.outputs['Color'], n.inputs['Color'])
cloth.node_tree.links.new(n.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])

bpy.ops.mesh.primitive_cube_add(size=1)
base = bpy.context.object
base.name = 'Soft rounded fabric patch'
base.scale = (W, H, .07)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
base.data.materials.append(cloth)
# Tessellate the backing BEFORE bending it, so its surface follows the same
# continuous shape as every stitch. A bent, four-corner face buried letters.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=32)
bpy.ops.object.mode_set(mode='OBJECT')
bevel = base.modifiers.new('Soft stitched corners', 'BEVEL')
bevel.width = .028; bevel.segments = 4; bevel.limit_method = 'ANGLE'
bpy.ops.object.modifier_apply(modifier=bevel.name)
uv = base.data.uv_layers.active
for polygon in base.data.polygons:
    for loop_index in polygon.loop_indices:
        co = base.data.vertices[base.data.loops[loop_index].vertex_index].co
        uv.data[loop_index].uv = (co.x/W+.5, co.y/H+.5)
for p in base.data.polygons: p.use_smooth = True
base.modifiers.new('Weighted backing normals', 'WEIGHTED_NORMAL')

verts, faces = [], []
def stitch(ax, ay, bx, by, z, radius, rise=.006):
    dx, dy = bx-ax, by-ay
    length = math.hypot(dx, dy)
    if length < .001: return
    px, py = -dy/length, dx/length
    start = len(verts)
    rings, sides = 5, 5
    for j in range(rings):
        t = j/(rings-1)
        r = radius * (.75 + .25*math.sin(math.pi*t)**.35)
        for k in range(sides):
            a = math.tau*k/sides
            verts.append((ax+dx*t+px*r*math.cos(a), ay+dy*t+py*r*math.cos(a), z+rise*math.sin(math.pi*t)+r*math.sin(a)))
    for j in range(rings-1):
        for k in range(sides):
            a = start+j*sides+k; b = start+j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(start+k for k in reversed(range(sides))))
    faces.append(tuple(start+(rings-1)*sides+k for k in range(sides)))

def finish(name, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in mesh.polygons: p.use_smooth = True
    verts.clear(); faces.clear()
    return obj

# Subdivide each white scanline into staggered satin stitches. The mask is
# sampled directly, so counters in letters and QR gaps remain open.
count = 0
for row in range(0, ih, 1):
    line = mask[row]
    edges = np.diff(np.r_[False, line, False].astype(np.int8))
    for lo, hi in zip(np.where(edges == 1)[0], np.where(edges == -1)[0]):
        # Dense underlay thread bed: avoids dark pinholes when the raised
        # strands become subpixel at the site's normal preview size.
        start = len(verts)
        for px,py in [(lo,row-.5),(hi,row-.5),(hi,row+.5),(lo,row+.5)]:
            verts.append(((px-iw/2)*scale,(py-ih/2)*scale,.046))
        faces.append((start,start+1,start+2,start+3))
        a = float(lo)
        while a < hi:
            b = min(hi, a + (11 if a == lo and row % 2 else 22))
            stitch((a-iw/2)*scale, (row-ih/2)*scale,
                   (b-iw/2)*scale, (row-ih/2)*scale,
                   .053, scale*.55, .003)
            count += 1; a = b
finish('Raised satin embroidery — original lettering and QR', thread)

# Closely wrapped merrow stitches follow the entire rounded perimeter.
radius = .09
perimeter = []
for cx, cy, start in [(W/2-radius,H/2-radius,0),(-W/2+radius,H/2-radius,90),(-W/2+radius,-H/2+radius,180),(W/2-radius,-H/2+radius,270)]:
    # Start on right and travel counter-clockwise around each corner.
    for degree in np.linspace(start, start+90, 14):
        angle = math.radians(degree)
        perimeter.append((cx+radius*math.cos(angle),cy+radius*math.sin(angle)))
for i, (ax, ay) in enumerate(perimeter):
    bx, by = perimeter[(i+1)%len(perimeter)]
    distance = math.hypot(bx-ax,by-ay)
    steps = max(1, round(distance/.018))
    for j in range(steps):
        t = j/steps
        x,y = ax+(bx-ax)*t,ay+(by-ay)*t
        dx,dy = bx-ax,by-ay
        norm = max(.0001,math.hypot(dx,dy))
        # Left normal points inward around a CCW outline.
        ix,iy = -dy/norm,dx/norm
        stitch(x+ix*.008,y+iy*.008,x+ix*.085+dx/norm*.012,y+iy*.085+dy/norm*.012,.042,.009,.017)
finish('Merrow border — individual wrapped stitches', border)

# Orient the embroidered face toward glTF's +Z camera-facing direction.
# Apply the same shallow cloth curvature to the tessellated backing AND yarn.
models = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in models:
    for v in obj.data.vertices:
        x,y = v.co.x,v.co.y
        v.co.z += .045*(x/(W/2))**2 + .018*math.sin(x*1.3)*math.cos(y*1.2)
    obj.rotation_euler.x = math.pi/2

bpy.ops.object.select_all(action='DESELECT')
for obj in models: obj.select_set(True)
bpy.context.view_layer.objects.active = base
bpy.ops.export_scene.gltf(filepath=str(OUT/'verified-patch.glb'), export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=True)
# A content-addressed URL invalidates both browser cache and useGLTF's cache.
digest = hashlib.sha256((OUT/'verified-patch.glb').read_bytes()).hexdigest()[:10]
versioned = OUT/f'verified-patch-{digest}.glb'
shutil.copyfile(OUT/'verified-patch.glb', versioned)
print('WEB MODEL', versioned.name)

# Save a lit, editable source, with the model itself kept independent of lights.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.world = bpy.data.worlds.new('Patch studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.11,.13,.16,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
def aim(obj, target=(0,0,0)):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-3,-4,5),650,4),('Fill',(4,-2,1),100,3),('Rim',(1,2,4),450,3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    light=bpy.context.object; light.name=name; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; aim(light)
bpy.ops.object.camera_add(location=(.5,-10,3.2))
camera=bpy.context.object; aim(camera); camera.data.type='ORTHO'; camera.data.ortho_scale=8.15; scene.camera=camera
scene.render.resolution_x=1600; scene.render.resolution_y=700; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=True
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'models/verified-patch.blend'))
scene.render.filepath='/private/tmp/verified-patch-render.png'
bpy.ops.render.render(write_still=True)
print('PATCH COMPLETE',count,'embroidery stitches', 'size', (OUT/'verified-patch.glb').stat().st_size)
