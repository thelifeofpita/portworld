import bpy, json
from mathutils import Matrix
bpy.ops.wm.open_mainfile(filepath='/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive/MAD/ADS/surfTheSpike/surfTheSpike.blend', load_ui=False)
for scene in bpy.data.scenes:
    print('SCENE', scene.name, 'camera', scene.camera.name if scene.camera else None)
    for obj in scene.objects:
        if obj.type == 'CAMERA' or obj.name in ['Google Pixel 9 Pro XL.003', 'Google Pixel 9 Pro XL.004', 'Can', 'ST2:SURF THE SPIKE']:
            print(json.dumps({'name':obj.name,'matrix':[list(row) for row in obj.matrix_world], 'hidden':obj.hide_render}))
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            r = area.spaces.active.region_3d
            print('VIEW',screen.name,list(r.view_rotation),list(r.view_location),r.view_distance)
for obj in bpy.data.scenes['assets'].objects:
    if obj.name not in ['Google Pixel 9 Pro XL.003','Can']: continue
    for slot in obj.material_slots:
        mat=slot.material
        if not mat or not mat.use_nodes: continue
        print('MATERIAL',mat.name)
        for node in mat.node_tree.nodes:
            if node.type=='TEX_IMAGE':
                print('IMAGE',node.name, node.image.filepath if node.image else None)
                if node.image and mat.name == 'Label' and node.name == 'Image Texture':
                    print('LABEL',node.image.size[:],bool(node.image.packed_file))
                    node.image.filepath_raw='/Users/pita/Desktop/portworld/thelifeofpita/public/models/surf-can-label.png'
                    node.image.file_format='PNG'
                    node.image.save()
            if node.type=='BSDF_PRINCIPLED':
                for name in ['Base Color','Emission Color','Metallic']:
                    sock=node.inputs[name]
                    print('INPUT',name, list(sock.default_value) if name != 'Metallic' else sock.default_value, [(l.from_node.name,l.from_socket.name) for l in sock.links])
