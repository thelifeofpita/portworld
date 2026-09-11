"""Build a reusable dashboard monitor; never modify campaign source assets."""
import bpy, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, roughness=.4):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=roughness
    return mat

housing=material('Dashboard — charcoal moulded housing',(.027,.033,.039),.03,.65)
bezel=material('Dashboard — piano black bezel',(.009,.012,.015),.22,.23)
trim=material('Dashboard — brushed aluminium trim',(.27,.31,.34),.85,.24)
rubber=material('Dashboard — rubber controls',(.015,.018,.021),0,.65)
white=material('Dashboard — control legends',(.65,.70,.72),0,.5)

def box(name, location, dimensions, mat, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    obj=bpy.context.object;obj.name=name;obj.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=5
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

# A cutaway centre stack, with a broad dash shoulder tapering into the
# console. Its silhouette and automotive controls must read before the LCD.
contour=[(-1.85,-1.73),(1.85,-1.73),(2.03,-1.38),(2.10,.95),
         (2.34,1.49),(2.28,1.96),(1.78,2.13),(-1.78,2.13),
         (-2.28,1.96),(-2.34,1.49),(-2.10,.95),(-2.03,-1.38)]
n=len(contour)
vertices=[(x,y,z) for z in [-.40,.17] for x,y in contour]
faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new('Tapered centre console');mesh.from_pydata(vertices,[],faces);mesh.update()
dash=bpy.data.objects.new('Moulded dashboard centre stack',mesh)
bpy.context.collection.objects.link(dash);dash.data.materials.append(housing)
bpy.context.view_layer.objects.active=dash;dash.select_set(True)
mod=dash.modifiers.new('Rounded dash shoulders','BEVEL');mod.width=.12;mod.segments=5
bpy.ops.object.modifier_apply(modifier=mod.name)
mod=dash.modifiers.new('Dashboard normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
dash.select_set(False)
box('Screen mounting recess',(0,0,.19),(3.64,2.32,.10),rubber,.13)
box('Inset satin perimeter',(0,0,.247),(3.43,2.13,.075),housing,.115)
box('Gloss black recessed fascia',(0,0,.282),(3.37,2.07,.095),bezel,.105)
box('Screen recess',(-.12,.025,.334),(2.87,1.83,.025),rubber,.065)

screen=material('Dashboard — reversing camera LCD',(1,1,1),0,.12)
p=screen.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Strength'].default_value=1.15
p.inputs['Coat Weight'].default_value=.25
p.inputs['Coat Roughness'].default_value=.14
image=bpy.data.images.load(str(ROOT/'public/projects/proj5/thumb.webp'))
image.pack()
tex=screen.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
screen.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
screen.node_tree.links.new(tex.outputs['Color'],p.inputs['Emission Color'])

# UV-window just the camera feed; the old dashboard photograph must not
# become a picture of another dashboard inside the new physical monitor.
w,h,r=2.73,1.64,.045
outline=[]
for cx,cy,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
    for i in range(9):
        a=math.radians(start+i*90/8)
        outline.append((cx+r*math.cos(a),cy+r*math.sin(a),0))
verts=[(0,0,0)]+outline
faces=[(0,i+1,(i+1)%len(outline)+1) for i in range(len(outline))]
mesh=bpy.data.meshes.new('Rounded LCD surface');mesh.from_pydata(verts,[],faces);mesh.update()
uv=mesh.uv_layers.new(name='Camera feed crop')
for poly in mesh.polygons:
    for loop in poly.loop_indices:
        x,y,_=verts[mesh.loops[loop].vertex_index]
        uv.data[loop].uv=(.235+(x/w+.5)*.52, .13+(y/h+.5)*.55)
obj=bpy.data.objects.new('Recessed luminous camera screen',mesh)
bpy.context.collection.objects.link(obj);obj.location=(-.12,.025,.351);obj.data.materials.append(screen)

# Right-hand tactile controls, a knurled volume knob and restrained labels.
for y in [.59,.28,-.03]:
    box('Physical side key',(1.48,y,.362),(.18,.22,.06),rubber,.025)
    box('Key legend',(1.48,y,.395),(.068,.009,.003),white,.003)
def cylinder(name,radius,depth,location,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=depth,location=location)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    mod=o.modifiers.new('Machined edge','BEVEL');mod.width=.014;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for polygon in o.data.polygons:polygon.use_smooth=True
    return o
cylinder('Volume knob silver ring',.135,.095,(1.48,-.52,.377),trim)
cylinder('Volume knob rubber face',.114,.103,(1.48,-.52,.391),rubber)
for i in range(32):
    a=i*math.tau/32
    box('Knob grip', (1.48+.128*math.cos(a),-.52+.128*math.sin(a),.407),(.014,.014,.032),rubber,.004)
box('Volume indicator',(1.48,-.449,.446),(.013,.039,.003),white,.003)
led=material('Dashboard — standby LED',(.35,.55,.32),0,.3)
led.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.2,.65,.2,1)
led.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.5
box('Status light',(1.48,-.83,.336),(.042,.013,.005),led,.005)

# Twin front-facing air vents: recessed wells, directional louvers, sliders.
for side in [-1,1]:
    cx=side*1.13
    box('Air vent satin rim',(cx,1.60,.205),(1.70,.67,.07),trim,.08)
    box('Deep air vent well',(cx,1.60,.248),(1.60,.57,.04),bezel,.06)
    for y in [1.40,1.53,1.66,1.79]:
        slat=box('Horizontal air vent louver',(cx,y,.31),(1.45,.042,.115),housing,.018)
        slat.rotation_euler.x=math.radians(-12)
    box('Vent direction slider',(cx+.16,1.60,.38),(.23,.11,.10),rubber,.035)
    box('Slider satin accent',(cx+.16,1.60,.438),(.14,.018,.008),trim,.007)

red=material('Dashboard — hazard red',(.65,.014,.008),0,.38)
blue=material('Dashboard — cold blue',(.015,.19,.6),0,.4)
box('Hazard switch',(0,1.61,.267),(.38,.55,.10),rubber,.07)
def line(name,points,mat,width=.009):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=width;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
line('Red hazard triangle',[(-.115,1.53,.324),(0,1.74,.324),(.115,1.53,.324),(-.115,1.53,.324)],red,.017)

# Three rotary climate controls beneath the radio: temperature, fan, airflow.
box('Climate control recess',(0,-1.37,.201),(3.49,.50,.055),bezel,.07)
for x in [-1.1,0,1.1]:
    cylinder('Climate dial satin ring',.196,.07,(x,-1.37,.25),trim)
    cylinder('Climate dial rubber grip',.174,.115,(x,-1.37,.29),rubber)
    box('Climate dial pointer',(x,-1.255,.354),(.018,.066,.006),white,.006)
    for a in [-140,-100,-60,0,60,100,140]:
        angle=math.radians(a)
        box('Dial position mark',(x+.235*math.sin(angle),-1.37+.235*math.cos(angle),.24),(.019,.019,.008),white,.005)
for start,end,mat in [(-135,-25,blue),(25,135,red)]:
    pts=[]
    for i in range(20):
        a=math.radians(start+(end-start)*i/19)
        pts.append((-1.1+.23*math.sin(a),-1.37+.23*math.cos(a),.249))
    line('Temperature colour arc',pts,mat,.016)

box('Dashboard top lip',(0,2.04,.07),(4.40,.19,.73),housing,.08)
box('Rear console chassis',(0,.1,-.43),(3.53,3.08,.23),housing,.11)

parts=list(bpy.context.scene.objects)
root=bpy.data.objects.new('Dashboard monitor',None)
bpy.context.collection.objects.link(root)
for part in parts: part.parent=root
# glTF converts Blender Z-up to Y-up; present the XY face toward web +Z.
root.rotation_euler.x=math.pi/2
bpy.ops.object.select_all(action='SELECT')
output=ROOT/'public/models/back-in-smoothly-monitor.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT.parent/'models/back-in-smoothly-monitor.blend'))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,
    export_apply=True,export_animations=False,export_cameras=False,export_lights=False,
    export_draco_mesh_compression_enable=True)
print('EXPORTED',output,output.stat().st_size)
