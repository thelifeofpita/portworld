"""Read only the authored assets scene; never save the source blend."""
import bpy,json,sys,ast
bpy.ops.wm.open_mainfile(filepath='/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive/MAD/ADS/surfTheSpike/surfTheSpike.blend',load_ui=False)
scene=bpy.data.scenes['assets']
for obj in scene.objects:
    if obj.type!='MESH':continue
    print('OBJECT',obj.name)
    for slot in obj.material_slots:
        mat=slot.material
        if not mat or not mat.use_nodes:continue
        nodes=mat.node_tree.nodes
        output=next((n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
        queue=[l.from_node for l in output.inputs['Surface'].links] if output else []
        seen=set();bsdf=None
        while queue:
            node=queue.pop(0)
            if node.name in seen:continue
            seen.add(node.name)
            if node.type=='BSDF_PRINCIPLED':bsdf=node;break
            queue.extend(l.from_node for s in node.inputs for l in s.links)
        if not bsdf:continue
        result={'name':mat.name,'shader':bsdf.name}
        for key in ['Base Color','Metallic','Roughness','Normal','Coat Weight','Coat Roughness','Transmission Weight','IOR','Specular IOR Level','Emission Color','Emission Strength']:
            socket=bsdf.inputs.get(key)
            if socket is None:continue
            value=socket.default_value
            result[key]={'value':list(value) if hasattr(value,'__len__') else value,'links':[(l.from_node.type,l.from_node.name) for l in socket.links]}
        print(json.dumps(result))
        for node in nodes:
            if node.type in ['NORMAL_MAP','BUMP']:
                print('NORMAL',node.name,[(s.name,str(s.default_value)) for s in node.inputs if s.name in ['Strength','Distance']])

if '--restore-maps' in sys.argv:
    bpy.context.window.scene=scene
    # Reuse the existing UV-aware bake helper, without invoking its exporter.
    helper_path='/Users/pita/Desktop/portworld/scripts/blender-export-model.py'
    with open(helper_path) as source:
        module=ast.parse(source.read())
    module.body=[node for node in module.body if not (isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='main')]
    helpers={}
    exec(compile(module,helper_path,'exec'),helpers)
    scene.render.engine='CYCLES'
    scene.cycles.samples=8
    scene.cycles.device='CPU'
    for obj_name,mat_name,filename in [('Can','silver 1','surf-can-metal-normal.png'),('Popper','silver 1.001','surf-popper-normal.png'),('Google Pixel 9 Pro XL.003','GP9XL_Flash.001','surf-flash-normal.png')]:
        obj=scene.objects[obj_name]
        mat=bpy.data.materials[mat_name]
        uv=helpers['ensure_best_uv_at_index0'](obj)
        for node in mat.node_tree.nodes:
            if node.type=='BSDF_PRINCIPLED' and node.inputs.get('Weight') is not None:node.inputs['Weight'].default_value=1
        image=bpy.data.images.new(filename,512,512,alpha=False)
        image.colorspace_settings.name='Non-Color'
        helpers['bake_socket'](scene,scene.view_layers[0],obj,mat,image,'NORMAL',set(),uv)
        image.filepath_raw='/Users/pita/Desktop/portworld/thelifeofpita/public/models/'+filename
        image.file_format='PNG'
        image.save()
    image=bpy.data.materials['Label'].node_tree.nodes['Image Texture.001'].image.copy()
    if max(image.size)>1024:
        scale=1024/max(image.size)
        image.scale(round(image.size[0]*scale),round(image.size[1]*scale))
    image.filepath_raw='/Users/pita/Desktop/portworld/thelifeofpita/public/models/surf-can-roughness.png'
    image.file_format='PNG'
    image.save()
