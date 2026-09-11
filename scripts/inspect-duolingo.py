import bpy
bpy.ops.wm.open_mainfile(filepath='/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive/CASES/duolingo/duolingo.blend',load_ui=False)
for scene in bpy.data.scenes:
    print('SCENE',scene.name)
    for obj in scene.objects:
        if obj.type=='MESH':print('MESH',obj.name,[(m.type,m.show_render) for m in obj.modifiers])
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    print('MATERIAL',mat.name)
    for n in mat.node_tree.nodes:
        if n.type in ['BUMP','NORMAL_MAP','BSDF_PRINCIPLED']:
            print('NODE',n.type,n.name)
            for s in n.inputs:
                if s.name not in ['Base Color','Normal','Roughness','Metallic','Weight','Strength','Distance','Height','Subsurface Weight','Subsurface Radius','Coat Weight','Coat Roughness','Sheen Weight']:continue
                print(s.name,str(s.default_value),[(l.from_node.type,l.from_node.name) for l in s.links])
