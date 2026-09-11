"""Inspect the user's Verified asset without modifying the source file."""
import bpy
import sys, math, hashlib, ast
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'models/verified/verified.blend'), load_ui=False)
for image in bpy.data.images:
    local = ROOT/'models/verified'/Path(image.filepath).name
    if local.is_file():
        image.filepath = str(local)
        image.reload()
        image.pack()
for scene in bpy.data.scenes:
    print('SCENE', scene.name)
    for obj in scene.objects:
        print('OBJECT', obj.name, obj.type, 'hidden', obj.hide_render, 'dimensions', tuple(obj.dimensions), 'rotation', tuple(obj.rotation_euler), 'modifiers', [(m.name,m.type) for m in obj.modifiers])
for mat in bpy.data.materials:
    print('MATERIAL', mat.name)
    if not mat.use_nodes: continue
    for node in mat.node_tree.nodes:
        print('NODE',node.name,node.type)
        if node.type == 'TEX_IMAGE':
            print('IMAGE', node.image.name if node.image else None, tuple(node.image.size) if node.image else None, node.image.filepath if node.image else None, 'PACKED', bool(node.image.packed_file) if node.image else False)
        if node.type == 'BSDF_PRINCIPLED':
            for socket in node.inputs:
                if socket.is_linked: print('LINK',socket.name,[(l.from_node.name,l.from_socket.name) for l in socket.links])
                elif socket.name in ['Base Color','Roughness','Metallic','Sheen Weight','Coat Weight']: print('VALUE',socket.name,str(socket.default_value))

if '--export' in sys.argv:
    scene=bpy.context.scene
    obj=bpy.data.objects['Book_Magazine']
    assert bpy.data.images['Artboard19.png'].size[0] > 0, 'Cover is missing'
    # Keep the authored subdivision and physical displacement in the mesh.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    for modifier in list(obj.modifiers):
        if modifier.type == 'SUBSURF': modifier.levels = modifier.render_levels
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    print('EXPORT MESH',len(obj.data.vertices),'vertices','MATERIALS',[m.name for m in obj.data.materials])
    # Bake only the scalar roughness node chains. Preserve original color
    # images, UVs and authored geometric normals without a lighting bake.
    helper=ROOT/'scripts/blender-export-model.py'
    tree=ast.parse(helper.read_text())
    tree.body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.Assign))]
    scope={'__name__':'bake_helpers'}
    exec(compile(tree,str(helper),'exec'),scope)
    scene.render.engine='CYCLES'; scene.cycles.samples=4
    # Every material needs a disposable active target during multi-material
    # baking; otherwise Blender writes into its original artwork texture.
    scratch=[]
    for mat in obj.data.materials:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image=bpy.data.images.new(mat.name+' bake scratch',width=16,height=16)
        mat.node_tree.nodes.active=node
        scratch.append((mat,node))
    for mat in obj.data.materials:
        p=mat.node_tree.nodes.get('Principled BSDF')
        if not p or not p.inputs['Roughness'].is_linked: continue
        rough=bpy.data.images.new(mat.name+' roughness',width=1024,height=1024)
        rough.colorspace_settings.name='Non-Color'
        node=scope['bake_socket'](scene,bpy.context.view_layer,obj,mat,rough,'ROUGHNESS',set(),obj.data.uv_layers.active.name)
        mat.node_tree.links.new(node.outputs['Color'],p.inputs['Roughness'])
        rough.pack()
        mat.node_tree.nodes.active=next(n for m,n in scratch if m==mat)
    for mat,node in scratch: mat.node_tree.nodes.remove(node)
    # The source is laid on XY. Present its cover upright toward web +Z.
    obj.rotation_euler.x=math.pi/2
    bpy.context.view_layer.update()
    output=ROOT/'thelifeofpita/public/models/verified-magazine.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True)
    digest=hashlib.sha256(output.read_bytes()).hexdigest()[:10]
    versioned=output.with_name(f'verified-magazine-{digest}.glb')
    output.rename(versioned)
    print('WEB MODEL',versioned.name,versioned.stat().st_size)
    # Preview the exported pose without saving changes over the user's file.
    bounds=[obj.matrix_world@Vector(c) for c in obj.bound_box]
    center=sum(bounds,Vector())/8
    def aim(o): o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
    camera=scene.camera
    camera.location=center+Vector((.025,-.6,.018)); aim(camera)
    camera.data.type='ORTHO'; camera.data.ortho_scale=.36
    for loc,power,size in [((-.3,-.4,.4),10,.4),((.3,-.2,.1),2,.3),((.2,.2,.3),6,.3)]:
        bpy.ops.object.light_add(type='AREA',location=center+Vector(loc))
        light=bpy.context.object; light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
    scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.filepath='/private/tmp/verified-magazine-render.png'
    bpy.ops.render.render(write_still=True)
