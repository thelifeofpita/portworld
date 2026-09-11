"""Inspect/export the Twix preview without modifying its source .blend."""
import bpy, sys
bpy.ops.wm.open_mainfile(filepath='/Users/pita/Desktop/portworld/models/twix.blend', load_ui=False)
for scene in bpy.data.scenes:
    print('SCENE',scene.name)
    for obj in scene.objects:
        print('OBJECT',obj.name,obj.type,'hidden',obj.hide_render)
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    print('MATERIAL',mat.name)
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE':
            print('IMAGE',node.image.name if node.image else None, node.image.size[:] if node.image else None, bool(node.image.packed_file) if node.image else None)
        if node.type == 'BSDF_PRINCIPLED':
            for key in ['Base Color','Normal','Roughness']:
                print(key,[(link.from_node.type,link.from_node.name) for link in node.inputs[key].links])

if '--export' in sys.argv:
    scene = bpy.data.scenes['Scene']
    bpy.context.window.scene = scene
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type == 'MESH' and not obj.hide_render:
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
    for image in bpy.data.images:
        if image.size[0] > 1024 or image.size[1] > 1024:
            ratio = 1024 / max(image.size)
            image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
            image.pack()
    # Direct texture/normal/roughness nodes are already glTF-compatible.
    # Preserve the authored world transforms and smooth vertex normals.
    bpy.ops.export_scene.gltf(filepath='/Users/pita/Desktop/portworld/thelifeofpita/public/models/hat-twix.glb', export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=True)
