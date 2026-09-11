"""Bake original sheen roughness without saving or altering the source blend."""
import bpy
from pathlib import Path
SOURCE='/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive/CASES/duolingo/duolingo.blend'
bpy.ops.wm.open_mainfile(filepath=SOURCE,load_ui=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=1
scene.render.bake.margin=8
scene.render.bake.use_clear=True
out=Path('/tmp/duolingo-sheen');out.mkdir(exist_ok=True)
names=['body','eyes','feet','mask','pockets','beek_up','beek_down']
# Bake on the original surfaces: preserve generated coordinates and modifier UVs.
for obj in scene.objects: obj.hide_render=True
for name in names:
 obj=bpy.data.objects[name]
 obj.hide_render=False;obj.hide_set(False)
 for other in bpy.context.selected_objects:other.select_set(False)
 obj.select_set(True);bpy.context.view_layer.objects.active=obj
 obj.data=obj.data.copy()
 # The exporter promotes the body's active 'automap' to TEXCOORD_0.
 uv_index=obj.data.uv_layers.find('automap') if name=='body' else 0
 obj.data.uv_layers.active_index=uv_index
 obj.data.uv_layers[uv_index].active_render=True
 mat=obj.data.materials[0].copy();obj.data.materials[0]=mat
 nodes=mat.node_tree.nodes;links=mat.node_tree.links
 output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
 shader=output.inputs['Surface'].links[0].from_node
 roughness=shader.inputs['Sheen Roughness']
 assert roughness.is_linked, name+' has no authored sheen roughness variation'
 emit=nodes.new('ShaderNodeEmission')
 links.new(roughness.links[0].from_socket,emit.inputs['Color'])
 links.new(emit.outputs[0],output.inputs['Surface'])
 size=1024 if name=='body' else 512
 image=bpy.data.images.new(name+' sheen roughness',width=size,height=size,alpha=False)
 image.colorspace_settings.name='Non-Color'
 target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
 bpy.ops.object.bake(type='EMIT')
 image.filepath_raw=str(out/(name+'.png'));image.file_format='PNG';image.save()
 obj.hide_render=True
 print('BAKED',name,flush=True)
