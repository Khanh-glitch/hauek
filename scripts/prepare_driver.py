# Resample embedded texture payloads before mesh simplification
import json,io,struct,math,sys
from PIL import Image
f=open(sys.argv[1],'rb');f.seek(12);n,_=struct.unpack('<II',f.read(8));g=json.loads(f.read(n));f.read(8);raw=f.read();data=b''
for i,bv in enumerate(g['bufferViews']):
 off=bv.get('byteOffset',0);b=raw[off:off+bv['byteLength']];im=next((im for im in g['images'] if im['bufferView']==i),None)
 if im:
  img=Image.open(io.BytesIO(b)).convert('RGB'); img.thumbnail((1536,1536));out=io.BytesIO();img.save(out,'JPEG',quality=88);b=out.getvalue();im['mimeType']='image/jpeg'
 bv['byteOffset']=len(data);bv['byteLength']=len(b);data+=b+b'\0'*(-len(b)%4)
# Build a simple fitted cabin rig in Y-up coordinates. Skin weights are sampled
# from this particular scan's height and sleeve silhouette, not generic humanoids.
def append(rows,fmt,kind,ctype):
 global data
 off=len(data);raw=b''.join(struct.pack('<'+fmt,*r) for r in rows);data+=raw+b'\0'*(-len(raw)%4)
 v=len(g['bufferViews']);g['bufferViews'].append(dict(buffer=0,byteOffset=off,byteLength=len(raw)))
 a=len(g['accessors']);g['accessors'].append(dict(bufferView=v,componentType=ctype,count=len(rows),type=kind));return a
positions=[]
for ai in [0,1]:
 acc=g['accessors'][ai];bv=g['bufferViews'][acc['bufferView']];off=bv['byteOffset'];length=bv['byteLength'];rows=[(x,-z,y) for x,y,z in struct.iter_unpack('<fff',data[off:off+length])];data=data[:off]+b''.join(struct.pack('<fff',*r) for r in rows)+data[off+length:]
 if ai==0: positions=rows;acc['min']=list(map(min,zip(*rows)));acc['max']=list(map(max,zip(*rows)))
bones=[('Body',-1,(0,0,0),0),('Hips',0,(0,.52,0),-78),('Knees',1,(0,.285,.008),86),('Neck',0,(0,.965,0),0)]
for side in [-1,1]:
 idx=len(bones);bones.extend([('Shoulder'+str(side),0,(side*.13,.93,0),-28),('Elbow'+str(side),idx,(side*.156,.728,0),-63)])
g['nodes']=[{'mesh':0,'skin':0,'name':'TaiXe'},{'name':'Rig','children':[2]}];inv=[]
for i,(name,parent,p,angle) in enumerate(bones):
 base=bones[parent][2] if parent>=0 else (0,0,0);rad=math.radians(angle)/2;node={'name':name,'translation':[a-b for a,b in zip(p,base)],'rotation':[math.sin(rad),0,0,math.cos(rad)]};g['nodes'].append(node)
 if parent>=0:g['nodes'][parent+2].setdefault('children',[]).append(i+2)
 inv.append((1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1))
g['scenes'][0]['nodes']=[0,1];joints=[];weights=[]
def smooth(lo,hi,h): t=max(0,min(1,(h-lo)/(hi-lo)));return t*t*(3-2*t)
for x,h,z in positions:
 arm=smooth(.12,.149,abs(x))*smooth(.477,.526,h)*(1-smooth(.87,1,h));el=1-smooth(.70,.75,h);hip=(1-smooth(.50,.58,h))*(1-arm);knee=1-smooth(.265,.309,h);neck=smooth(.955,1.002,h);side=4 if x<0 else 6
 vals=sorted([(0,max(0,1-arm-hip-neck)),(1,hip*(1-knee)),(2,hip*knee),(side,arm*(1-el)),(side+1,arm*el),(3,neck)],key=lambda r:-r[1])[:4];total=sum(v for _,v in vals);joints.append(tuple(k for k,_ in vals));weights.append(tuple(v/total for _,v in vals))
g['skins']=[dict(joints=list(range(2,2+len(bones))),skeleton=2,inverseBindMatrices=append(inv,'16f','MAT4',5126))];attrs=g['meshes'][0]['primitives'][0]['attributes'];attrs['JOINTS_0']=append(joints,'4B','VEC4',5121);attrs['WEIGHTS_0']=append(weights,'4f','VEC4',5126)
g['buffers'][0]['byteLength']=len(data);j=json.dumps(g).encode();j+=b' '*(-len(j)%4);open(sys.argv[2],'wb').write(struct.pack('<4sIIII',b'glTF',2,28+len(j)+len(data),len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data)
