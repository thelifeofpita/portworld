"""Prune unreachable glTF nodes, meshes, materials and buffer views losslessly."""
import json, struct, hashlib
from pathlib import Path
src=Path('public/models/surfthespike-phone.glb')
b=src.read_bytes(); n=struct.unpack_from('<I',b,12)[0]; d=json.loads(b[20:20+n]); binary=b[28+n:]
# Active roots are already the authored phone and can. Preserve their transforms.
d['scenes']=[d['scenes'][d.get('scene',0)]]; d['scene']=0
used={k:set() for k in ['nodes','meshes','materials','textures','images','samplers','accessors','bufferViews']}
def node(i):
 if i in used['nodes']:return
 used['nodes'].add(i); o=d['nodes'][i]
 if 'mesh' in o:used['meshes'].add(o['mesh'])
 for j in o.get('children',[]):node(j)
for scene in d['scenes']:
 for i in scene['nodes']:node(i)
for i in used['meshes']:
 for p in d['meshes'][i]['primitives']:
  if 'material' in p:used['materials'].add(p['material'])
  used['accessors'].update(p.get('attributes',{}).values())
  if 'indices' in p:used['accessors'].add(p['indices'])
  draco=p.get('extensions',{}).get('KHR_draco_mesh_compression')
  if draco:used['bufferViews'].add(draco['bufferView'])
def textures(o):
 if isinstance(o,dict):
  for k,v in o.items():
   if k.endswith('Texture') and isinstance(v,dict) and 'index' in v:used['textures'].add(v['index'])
   else:textures(v)
 elif isinstance(o,list):
  for v in o:textures(v)
for i in used['materials']:textures(d['materials'][i])
for i in used['textures']:
 t=d['textures'][i]
 if 'source' in t:used['images'].add(t['source'])
 if 'sampler' in t:used['samplers'].add(t['sampler'])
for i in used['images']:
 if 'bufferView' in d['images'][i]:used['bufferViews'].add(d['images'][i]['bufferView'])
for i in used['accessors']:
 a=d['accessors'][i]
 if 'sparse' in a:raise RuntimeError('Handle sparse accessors before pruning')
 if 'bufferView' in a:used['bufferViews'].add(a['bufferView'])
remap={k:{old:new for new,old in enumerate(sorted(v))} for k,v in used.items()}
for scene in d['scenes']:scene['nodes']=[remap['nodes'][i] for i in scene['nodes']]
for k,indices in used.items():d[k]=[d[k][i] for i in sorted(indices)]
for o in d['nodes']:
 if 'mesh' in o:o['mesh']=remap['meshes'][o['mesh']]
 if 'children' in o:o['children']=[remap['nodes'][i] for i in o['children']]
for mesh in d['meshes']:
 for p in mesh['primitives']:
  if 'material' in p:p['material']=remap['materials'][p['material']]
  p['attributes']={k:remap['accessors'][v] for k,v in p['attributes'].items()}
  if 'indices' in p:p['indices']=remap['accessors'][p['indices']]
  draco=p.get('extensions',{}).get('KHR_draco_mesh_compression')
  if draco:draco['bufferView']=remap['bufferViews'][draco['bufferView']]
def rewrite(o):
 if isinstance(o,dict):
  for k,v in o.items():
   if k.endswith('Texture') and isinstance(v,dict) and 'index' in v:v['index']=remap['textures'][v['index']]
   else:rewrite(v)
 elif isinstance(o,list):
  for v in o:rewrite(v)
for m in d['materials']:rewrite(m)
for t in d['textures']:
 if 'source' in t:t['source']=remap['images'][t['source']]
 if 'sampler' in t:t['sampler']=remap['samplers'][t['sampler']]
for o in d['images']+d['accessors']:
 if 'bufferView' in o:o['bufferView']=remap['bufferViews'][o['bufferView']]
blob=bytearray()
for view in d['bufferViews']:
 while len(blob)%4:blob.append(0)
 offset=view.get('byteOffset',0); data=binary[offset:offset+view['byteLength']];view['byteOffset']=len(blob);blob.extend(data)
d['buffers']=[{'byteLength':len(blob)}]
while len(blob)%4:blob.append(0)
js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
out=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
name=f'surfthespike-phone-{hashlib.sha256(out).hexdigest()[:12]}.glb';Path('public/generated',name).write_bytes(out)
Path('content/phone-manifest.json').write_text(json.dumps({'src':'/generated/'+name,'sourceBytes':len(b),'bytes':len(out),'removedNodes':['ST2:SURF THE SPIKE','Google Pixel 9 Pro XL.004']},indent=2)+'\n')
print(len(b),'->',len(out),name)
