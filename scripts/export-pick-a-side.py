"""Inspect the authored assets scene; never save over the campaign source."""
import bpy
import sys, math, random, hashlib, ast, shutil
from pathlib import Path
import numpy as np
from mathutils import Vector
SOURCE='/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive/MAD/360campaigns/pick_a_side/pick_a_side.blend'
bpy.ops.wm.open_mainfile(filepath=SOURCE,load_ui=False)
for scene in bpy.data.scenes:
    print('SCENE',scene.name)
    if scene.name.lower()=='assets':
        bpy.context.window.scene=scene
        for obj in scene.objects:
            print('OBJECT',obj.name,obj.type,'hidden',obj.hide_render,'location',tuple(obj.location),'rotation',tuple(obj.rotation_euler),'dimensions',tuple(obj.dimensions),'materials',[m.name for m in obj.data.materials] if obj.type=='MESH' else [])
            if obj.type=='MESH':
                print('BOUNDS', [tuple(obj.matrix_world@__import__('mathutils').Vector(v)) for v in obj.bound_box])
                print('MODIFIERS',[(m.name,m.type) for m in obj.modifiers])
                print('LOCAL BOUNDS',[tuple(v) for v in obj.bound_box],'SCALE',tuple(obj.scale),'PARENT',obj.parent.name if obj.parent else None)
        used={m for o in scene.objects if o.type=='MESH' for m in o.data.materials if m}
        for mat in used:
            print('MATERIAL',mat.name)
            if not mat.use_nodes: continue
            for node in mat.node_tree.nodes:
                if node.type=='TEX_IMAGE': print('IMAGE',node.image.name if node.image else None,tuple(node.image.size) if node.image else None,bool(node.image.packed_file) if node.image else False,node.image.filepath if node.image else '')
                if node.type in ['BUMP','TEX_NOISE','TEX_COORD','MAPPING']:
                    print('DETAIL NODE',node.name,node.type,[(s.name,[(l.from_node.name,l.from_socket.name) for l in s.links] if s.is_linked else str(s.default_value)) for s in node.inputs if hasattr(s,'default_value')])
                if node.type=='BSDF_PRINCIPLED':
                    for s in node.inputs:
                        if s.is_linked: print('LINK',s.name,[(l.from_node.name,l.from_socket.name) for l in s.links])
                        elif s.name in ['Base Color','Roughness','Metallic']: print('VALUE',s.name,tuple(s.default_value) if s.name=='Base Color' else s.default_value)
if '--build' in sys.argv:
    scene=bpy.data.scenes['assets'];bpy.context.window.scene=scene
    box=bpy.data.objects['Body2.001']
    # Isolate this scene's paper material from the campaign's other boxes.
    box.data=box.data.copy()
    card=box.data.materials[0].copy();card.name='Pick a Side — textured red card'
    box.data.materials[0]=card
    for node in card.node_tree.nodes:
        if node.type=='BUMP':
            node.inputs['Strength'].default_value=.4
            node.inputs['Distance'].default_value=.002
    p=card.node_tree.nodes.get('Principled BSDF')
    if p.inputs['Roughness'].is_linked:
        upstream=p.inputs['Roughness'].links[0].from_socket
        floor=card.node_tree.nodes.new('ShaderNodeMath');floor.operation='MAXIMUM';floor.inputs[1].default_value=.52
        card.node_tree.links.new(upstream,floor.inputs[0]);card.node_tree.links.new(floor.outputs[0],p.inputs['Roughness'])
    from mathutils.bvhtree import BVHTree
    surface=BVHTree.FromPolygons([v.co for v in box.data.vertices],[list(p.vertices) for p in box.data.polygons])
    ROOT=Path(__file__).resolve().parents[2]
    if scene.objects.get('Pick a Side — golden fries'):
        if '--rebuild-export' not in sys.argv:
            raise RuntimeError('Fries already exist in source; refusing to duplicate them')
        # Rebuild only this generated object in memory; do not re-save source.
        bpy.data.objects.remove(scene.objects['Pick a Side — golden fries'],do_unlink=True)
    rng=random.Random(83)
    # Shared physically lit color/roughness/normal textures, not a photo plane.
    size=512
    y,x=np.mgrid[0:size,0:size]/size
    mottling=np.zeros_like(x)
    for i in range(9):
        mottling += np.sin(x*math.tau*rng.uniform(2,16)+rng.uniform(0,6))*np.cos(y*math.tau*rng.uniform(2,18)+rng.uniform(0,6))/(i+2)
    mottling=np.clip(mottling*.5+.5,0,1)
    toasted=np.clip((mottling-.60)*.5,0,.18)
    toasted+=np.clip((abs(y-.5)-.39)*5,0,.4)
    toasted=np.clip(toasted,0,.75)
    golden=np.array([.91,.59,.20]); brown=np.array([.57,.29,.065])
    rgb=golden[None,None,:]*(1-toasted[:,:,None])+brown[None,None,:]*toasted[:,:,None]
    grain=np.random.default_rng(14).random((size,size))
    rgb*=.98+.025*grain[:,:,None]
    def make_image(name,array,noncolor=False):
        img=bpy.data.images.new(name,width=size,height=size)
        if noncolor:img.colorspace_settings.name='Non-Color'
        rgba=np.concatenate([array,np.ones((size,size,1))],axis=2)
        img.pixels.foreach_set(rgba.astype(np.float32).ravel());img.pack();return img
    color=make_image('Fries — golden crust and toasted tips',rgb)
    height=grain*.10+mottling*.04
    dy,dx=np.gradient(height)
    nx,ny=-dx*.65,-dy*.65
    normals=np.stack([nx*.5+.5,ny*.5+.5,np.sqrt(1-nx*nx-ny*ny)*.5+.5],axis=2)
    normal=make_image('Fries — fine crisp surface normals',normals,True)
    rough=make_image('Fries — oil and crust roughness',np.repeat((.46+grain*.12+mottling*.10)[:,:,None],3,axis=2),True)
    mat=bpy.data.materials.new('Golden potato — crisp fried surface');mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
    for img,socket in [(color,'Base Color'),(rough,'Roughness')]:
        n=nodes.new('ShaderNodeTexImage');n.image=img;links.new(n.outputs['Color'],p.inputs[socket])
    n=nodes.new('ShaderNodeTexImage');n.image=normal
    normalnode=nodes.new('ShaderNodeNormalMap');normalnode.inputs['Strength'].default_value=.7
    links.new(n.outputs['Color'],normalnode.inputs['Color']);links.new(normalnode.outputs['Normal'],p.inputs['Normal'])
    p.inputs['Subsurface Weight'].default_value=.035
    p.inputs['Subsurface Radius'].default_value=(.04,.018,.008)
    verts=[];faces=[];uvs=[]
    def add_face(indices,uv): faces.append(indices);uvs.append(uv)
    # Irregular packing in the curved opening, not parallel depth rows.
    count=0
    placed=[]
    for row in range(1):
        for col in range(32):
            for attempt in range(300):
                bx=rng.uniform(-.34,.34) if col<27 else rng.uniform(-.12,.12)
                front=[]
                for yy in [.05,.15,.25,.35,.45]:
                    hit=surface.ray_cast(Vector((bx,yy,2)),Vector((0,0,-1)))[0]
                    if hit:front.append(hit.z)
                bz=min(front)-rng.uniform(.055,.27) if front else -.10
                if all(math.hypot(bx-px,bz-pz)>.055 for px,pz in placed):break
            placed.append((bx,bz))
            bottom=rng.uniform(.05,.15)
            top=rng.uniform(.72,.94)
            if col%7==0:top=rng.uniform(.67,.77)
            if col>=27:top=rng.uniform(.79,.90)
            width=rng.uniform(.047,.066);depth=width*rng.uniform(.83,1.06)
            # A full, gently spreading serving: outer fries lean toward
            # the sides, while the middle fills the opening without spikes.
            lean=bx*.26+rng.uniform(-.055,.055)
            if col>=27:lean=rng.uniform(-.055,.055)
            lean_z=rng.uniform(-.04,.015)
            bend=rng.uniform(-.018,.018)
            twist=rng.uniform(-.7,.7)
            if '--settle' in sys.argv:
                bottom=.72+col*.018
                top=bottom+rng.uniform(1.24,1.44)
                lean=rng.uniform(-.035,.035)
                lean_z=rng.uniform(-.015,.015)
                bend=rng.uniform(-.01,.01)
            start=len(verts);rings=12
            # Beveled square cross-section, with cut rather than pointed ends.
            cross=[(-.32,-.5),(.32,-.5),(.5,-.32),(.5,.32),(.32,.5),(-.32,.5),(-.5,.32),(-.5,-.32)]
            for j in range(rings):
                t=j/(rings-1)
                taper=(.82 if j in [0,rings-1] else 1)*(1+.05*math.sin(t*11+col))
                for cx,cz in cross:
                    a=twist+.06*math.sin(t*5)
                    xx=(cx*width*math.cos(a)-cz*depth*math.sin(a))*taper
                    zz=(cx*width*math.sin(a)+cz*depth*math.cos(a))*taper
                    # Keep buried stems behind the wall; let the exposed
                    # ends lean and cross at different depths above the rim.
                    fan=t if '--settle' in sys.argv else max(0,(bottom+(top-bottom)*t-.40)/(top-.40))
                    verts.append((bx+lean*fan+bend*math.sin(math.pi*t)+xx,bottom+(top-bottom)*t,bz+lean_z*fan+zz))
            for j in range(rings-1):
                for k in range(8):
                    a=start+j*8+k;b=start+j*8+(k+1)%8
                    add_face((a,a+8,b+8,b),[(k/8,j/(rings-1)),(k/8,(j+1)/(rings-1)),((k+1)/8,(j+1)/(rings-1)),((k+1)/8,j/(rings-1))])
            add_face(tuple(start+k for k in range(8)),[(.5+cx*.5,.03+cz*.03) for cx,cz in cross])
            add_face(tuple(start+(rings-1)*8+k for k in reversed(range(8))),[(.5+cross[k][0]*.5,.97+cross[k][1]*.03) for k in reversed(range(8))])
            count+=1
    mesh=bpy.data.meshes.new('Individually shaped fries');mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='Crust UV')
    for polygon,coords in zip(mesh.polygons,uvs):
        for loop,coord in zip(polygon.loop_indices,coords):uv.data[loop].uv=coord
        polygon.use_smooth=len(polygon.vertices)==4
    fries=bpy.data.objects.new('Pick a Side — golden fries',mesh);scene.collection.objects.link(fries)
    fries.data.materials.append(mat);fries.parent=box
    fries['description']='32 irregularly packed fries with varied lean, lengths, golden crust and surface normals'
    if '--settle' in sys.argv:
        # Simulate in the carton coordinate frame, independent of the
        # presentation tilt. No animation or temporary colliders are saved.
        from mathutils import Matrix
        sim=bpy.data.scenes.new('Temporary fry settling')
        bpy.context.window.scene=sim
        sim.gravity=(0,-9.81,0)
        collider=bpy.data.objects.new('Temporary carton collider',box.data.copy())
        sim.collection.objects.link(collider)
        def body(obj,kind,shape):
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
            bpy.ops.rigidbody.object_add()
            obj.rigid_body.type=kind;obj.rigid_body.collision_shape=shape
            obj.rigid_body.use_margin=True;obj.rigid_body.collision_margin=.001
            obj.rigid_body.friction=.7;obj.rigid_body.restitution=0
        body(collider,'PASSIVE','MESH')
        # Invisible bottom inside the carton, beneath the visible front.
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.54,0))
        floor=bpy.context.object;floor.name='Temporary carton bottom';floor.scale=(1,.04,.8)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        body(floor,'PASSIVE','BOX')
        loose=bpy.data.objects.new('Fries to settle',fries.data.copy());sim.collection.objects.link(loose)
        bpy.ops.object.select_all(action='DESELECT');loose.select_set(True);bpy.context.view_layer.objects.active=loose
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
        pieces=[o for o in sim.objects if o not in [floor,collider]]
        for piece in pieces:
            bpy.ops.object.select_all(action='DESELECT');piece.select_set(True);bpy.context.view_layer.objects.active=piece
            bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY',center='MEDIAN')
            body(piece,'ACTIVE','CONVEX_HULL');piece.rigid_body.mass=.012
            piece.rigid_body.linear_damping=.4;piece.rigid_body.angular_damping=.6
        world=sim.rigidbody_world;world.substeps_per_frame=12;world.solver_iterations=30
        world.point_cache.frame_end=200
        for frame in range(1,201):sim.frame_set(frame)
        deps=bpy.context.evaluated_depsgraph_get()
        settled=[]
        for piece in pieces:
            transform=piece.evaluated_get(deps).matrix_world.copy()
            bpy.ops.object.select_all(action='DESELECT');piece.select_set(True);bpy.context.view_layer.objects.active=piece
            bpy.ops.rigidbody.object_remove()
            piece.matrix_world=transform
            center=transform.translation
            if -.52<center.y<1.1 and abs(center.x)<.65 and abs(center.z)<.55:
                settled.append(piece)
        assert len(settled)>=18, f'Only {len(settled)} fries remained in the carton'
        bpy.ops.object.select_all(action='DESELECT')
        for piece in settled:piece.select_set(True)
        bpy.context.view_layer.objects.active=settled[0];bpy.ops.object.join()
        joined=bpy.context.object
        joined.data.transform(joined.matrix_world)
        fries.data=joined.data.copy()
        assert all(abs(v.co.x)<1 and -.8<v.co.y<1.5 and abs(v.co.z)<1 for v in fries.data.vertices), 'Loose fry outside presentation bounds'
        bpy.context.window.scene=scene
        for obj in list(sim.objects):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(sim)
        fries['description']=f'{len(settled)} shorter fries, rigid-body settled against the carton and one another'
        print('SETTLED',len(settled),'fries;',len(pieces)-len(settled),'loose fallen pieces excluded')
    bpy.context.view_layer.update()
    if '--save-source' in sys.argv:
        refinement_backup=ROOT/'models/pick-a-side-before-natural-fries.blend'
        if not refinement_backup.exists():shutil.copy2(SOURCE,refinement_backup)
        backup=ROOT/'models/pick-a-side-before-fries.blend'
        if not backup.exists():shutil.copy2(SOURCE,backup)
        # Save before export material conversion or temporary preview lights.
        bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
        print('SOURCE SAVED; BACKUP',backup)
    if '--export' in sys.argv:
        selected=[box,scene.objects['Circle.002'],fries]
        helper=ROOT/'scripts/blender-export-model.py'
        tree=ast.parse(helper.read_text());tree.body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.Assign))]
        scope={'__name__':'bake_helpers'};exec(compile(tree,str(helper),'exec'),scope)
        scene.render.engine='CYCLES';scene.cycles.samples=4
        for obj in selected[:2]:
            bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
            for mod in list(obj.modifiers):
                if mod.type=='SUBSURF':mod.levels=min(mod.render_levels,3)
                bpy.ops.object.modifier_apply(modifier=mod.name)
            # Duplicate materials only in the export copy, retaining source nodes.
            unique={}
            for i,original in enumerate(list(obj.data.materials)):
                if original not in unique:unique[original]=original.copy()
                obj.data.materials[i]=unique[original]
            for mat in set(obj.data.materials):
                p=mat.node_tree.nodes.get('Principled BSDF')
                for socket,kind in [('Normal','NORMAL'),('Roughness','ROUGHNESS')]:
                    if not p.inputs[socket].is_linked:continue
                    img=bpy.data.images.new(mat.name+' '+socket,width=1024,height=1024);img.colorspace_settings.name='Non-Color'
                    node=scope['bake_socket'](scene,bpy.context.view_layer,obj,mat,img,kind,set(),obj.data.uv_layers.active.name)
                    if kind=='NORMAL':
                        n=mat.node_tree.nodes.new('ShaderNodeNormalMap');mat.node_tree.links.new(node.outputs['Color'],n.inputs['Color']);mat.node_tree.links.new(n.outputs['Normal'],p.inputs[socket])
                    else:mat.node_tree.links.new(node.outputs['Color'],p.inputs[socket])
                    img.pack()
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:obj.select_set(True)
        output=ROOT/'thelifeofpita/public/models/pick-a-side-fries.glb'
        bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=True)
        digest=hashlib.sha256(output.read_bytes()).hexdigest()[:10]
        output=output.rename(output.with_name(f'pick-a-side-fries-{digest}.glb'))
        print('WEB MODEL',output.name,output.stat().st_size)
if '--preview' in sys.argv:
    scene=bpy.data.scenes['assets'];bpy.context.window.scene=scene
    center=Vector((0,0,1))
    def aim(o): o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(0,-5,2))
    scene.camera=bpy.context.object;aim(scene.camera);scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=2.7
    for loc,power,size in [((-3,-4,5),500,3),((3,-2,2),100,3),((2,2,4),400,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        light=bpy.context.object;light.data.energy=power;light.data.size=size;aim(light)
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.filepath='/private/tmp/pick-a-side-source.png'
    bpy.ops.render.render(write_still=True)
