"""Remove only the exterior black backdrop; retain the complete dark phone silhouette."""
import cv2, numpy as np, subprocess, json, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'content/back-in-smoothly-media.json').read_text())
for number in [3,4]:
 source=root/'public'/manifest[f'gif{number}.mp4']['src'].lstrip('/')
 cap=cv2.VideoCapture(str(source));fps=cap.get(cv2.CAP_PROP_FPS)
 w,h=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
 output=Path(f'/tmp/bis-transparent-{number}.webp')
 frames_dir=Path(f'/tmp/bis-alpha-frames-{number}');frames_dir.mkdir(exist_ok=True)
 frames=[]
 count=0
 while True:
  ok,frame=cap.read()
  if not ok:break
  # The background is black; find the outer phone contour and fill its interior.
  # Unlike chroma-keying black, this retains dark UI, shadows, and the bezel.
  nonblack=(frame.max(axis=2)>5).astype(np.uint8)*255
  contours,_=cv2.findContours(nonblack,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
  contour=max(contours,key=cv2.contourArea)
  assert cv2.contourArea(contour)>w*h*.5, 'Phone silhouette was not found'
  alpha=np.zeros((h,w),np.uint8);cv2.drawContours(alpha,[contour],-1,255,cv2.FILLED)
  alpha=cv2.GaussianBlur(alpha,(3,3),.45)
  rgba=cv2.cvtColor(frame,cv2.COLOR_BGR2BGRA);rgba[:,:,3]=alpha
  assert alpha[h//2,w//2]==255 and alpha[0,0]==0
  frame_path=frames_dir/f'{count:04d}.png';cv2.imwrite(str(frame_path),rgba);frames.append(str(frame_path))
  if count in [0,100,190]:
   yellow=np.full_like(frame,(0,229,255));a=alpha[:,:,None]/255
   cv2.imwrite(f'/tmp/bis-transparent-{number}-{count}.png',(frame*a+yellow*(1-a)).astype(np.uint8))
  count+=1
 cap.release()
 subprocess.run(['img2webp','-loop','0','-lossy','-q','85','-m','4','-d',str(round(1000/fps)),*frames,'-o',str(output)],check=True)
 data=output.read_bytes();name=f'back-in-smoothly-game-{number}-alpha-{hashlib.sha256(data).hexdigest()[:12]}.webp'
 (root/'public/generated'/name).write_bytes(data)
 manifest[f'gif{number}.transparent']={'src':'/generated/'+name,'width':w,'height':h,'frames':count,'duration':count/fps}
 print(name,len(data),'bytes',count,'frames',flush=True)
(root/'content/back-in-smoothly-media.json').write_text(json.dumps(manifest,indent=2)+'\n')
