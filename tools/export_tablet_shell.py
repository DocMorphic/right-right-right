#!/usr/bin/env python3
"""Recover the original runtime-created tablet shell without running the game.

Emulate only pinned TabletShell.Awake arithmetic. All engine calls are stubs;
Part and MakeLit are intercepted to capture their original arguments. This is
an offline asset-export tool, not browser code or a Unity runtime replacement.
Install tools/cabin-asset-requirements.txt before using it.
"""
import argparse,hashlib
import struct,json,math
from pathlib import Path
import pefile,capstone
from unicorn import Uc,UC_ARCH_X86,UC_MODE_64,UC_HOOK_CODE
from unicorn.x86_const import *
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--runtime',type=Path,default=root/'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
parser.add_argument('--output',type=Path,default=root/'web/public/assets')
args=parser.parse_args();assembly=args.runtime.parent/'GameAssembly.dll'
digest=hashlib.sha256(assembly.read_bytes()).hexdigest()
PINNED_SHA256='b81c064eabebbc0b30af66f9684df3ffbae5e8a515e76a813c95a5ca95158f2e'
if digest!=PINNED_SHA256:raise ValueError('TabletShell export requires the pinned original runtime; RVAs changed.')
p=pefile.PE(str(assembly),fast_load=True);base=p.OPTIONAL_HEADER.ImageBase
u=Uc(UC_ARCH_X86,UC_MODE_64);u.mem_map(base,(p.OPTIONAL_HEADER.SizeOfImage+4095)&~4095);u.mem_write(base,p.get_memory_mapped_image())
u.mem_map(0x100000,0x100000);u.mem_map(0x400000,0x100000)
heap=0x400000

def alloc(size=0x400):
 global heap
 result=heap;heap+=(size+15)&~15;return result

def write64(a,v):u.mem_write(a,struct.pack('<Q',v))
def read64(a):return struct.unpack('<Q',u.mem_read(a,8))[0]
def floats(a,n):return list(struct.unpack('<'+'f'*n,u.mem_read(a,n*4)))
meta=(args.runtime/'il2cpp_data/Metadata/global-metadata.dat').read_bytes()
if struct.unpack_from('<I',meta,4)[0]!=39:raise ValueError('Unsupported IL2CPP metadata version.')
def literal(v):
 if v>>29!=5:return hex(v)
 idx=(v&0x1fffffff)>>1;a,b=struct.unpack_from('<II',meta,380+idx*4);return meta[50192+a:50192+b].decode()
classes={};materials={};parts=[];settings={}
obj=alloc();transform=alloc();gameobj=alloc();shell=alloc();shelltransform=alloc()
colors=[[.93,.52,.12,1],[.78,.38,.08,1],[.14,.11,.09,1],[.42,.24,.10,1],[.18,.16,.14,1]]
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64)
for start,length in [(0x510ec0,0xeb2),(0x5122d0,0xa6)]:
 for i in md.disasm(p.get_data(start,length),base+start):
  if i.mnemonic=='lea' and i.op_str.startswith('rcx, [rip + '):
   disp=int(i.op_str.split('+ ')[1].split(']')[0],16);slot=i.address+i.size+disp;v=read64(slot)
   if v>>29==1:
    typ=classes.setdefault(v,alloc());stat=alloc();write64(typ+0xb8,stat);u.mem_write(typ+0xe4,struct.pack('<I',1))
    if slot==base+0x30151c0:u.mem_write(stat,struct.pack('<20f',*sum(colors,[])))
    else:u.mem_write(stat,struct.pack('<6f',0,0,0,1,1,1))
    write64(slot,typ)
# Explicit source type static blocks: TabletShell, Quaternion, Vector3.
for rva,data in [(0x30151c0,sum(colors,[])),(0x3003760,[0,0,0,1]),(0x301e7c0,[0,0,0,1,1,1])]:
 typ=alloc();stat=alloc();write64(typ+0xb8,stat);u.mem_write(typ+0xe4,struct.pack('<I',1));u.mem_write(stat,struct.pack('<'+'f'*len(data),*data));write64(base+rva,typ)

def hook(uc,address,size,data):
 if base+0x510ec0<=address<=base+0x511d6c:return
 rcx=u.reg_read(UC_X86_REG_RCX);rdx=u.reg_read(UC_X86_REG_RDX);r8=u.reg_read(UC_X86_REG_R8);r9=u.reg_read(UC_X86_REG_R9);rsp=u.reg_read(UC_X86_REG_RSP);rva=address-base;ret=1
 if rva==0x41fb90 or rva==0x41fec0:ret=0
 elif rva==0x215be50:ret=transform
 elif rva==0xa20660:ret=alloc()
 elif rva==0x215bd70:ret=gameobj
 elif rva==0x2176460:ret=int(rcx!=0)
 elif rva==0x21825d0:ret=0
 elif rva==0x41fdd0:ret=shell
 elif rva==0x2170940:ret=shelltransform
 elif rva==0x2185160:
  settings.setdefault('scales',[]).append(floats(rdx,3))
 elif rva==0x511d80:
  ret=alloc();materials[ret]={'color':floats(rcx,4),'smoothness':struct.unpack('<f',u.reg_read(UC_X86_REG_XMM1).to_bytes(16,'little')[:4])[0]}
 elif rva==0x511f90:
  parts.append({'name':literal(rdx),'primitive':r8,'position':floats(r9,3),'scale':floats(read64(rsp+0x28),3),'rotation':floats(read64(rsp+0x30),4),'material':materials.get(read64(rsp+0x38))})
 elif rva==0x2163d30:
  x,y,z=[v/2 for v in floats(rdx,3)];cx,sx=math.cos(x),math.sin(x);cy,sy=math.cos(y),math.sin(y);cz,sz=math.cos(z),math.sin(z)
  q=[sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz];u.mem_write(rcx,struct.pack('<4f',*q));ret=rcx
 elif rva in [0x2184fa0,0x2185080,0x5121f0,0x2170130,0x2183950,0x21705c0,0x214dcb0,0x2176460]:pass
 else:raise Exception(f'Unhandled call {rva:x}')
 u.reg_write(UC_X86_REG_RAX,ret);u.reg_write(UC_X86_REG_RIP,read64(rsp));u.reg_write(UC_X86_REG_RSP,rsp+8)
u.hook_add(UC_HOOK_CODE,hook)
stack=0x1f0008;u.reg_write(UC_X86_REG_RSP,stack);u.reg_write(UC_X86_REG_RCX,obj);write64(stack,base+0x511d6d)
u.emu_start(base+0x510ec0,base+0x511d6d,count=100000)
if len(parts)!=14:raise ValueError(f'Incomplete original shell capture: {len(parts)} parts.')
result={'source':'TabletShell.Awake RVA0x510EC0, static colors RVA0x5122D0','sourceSha256':digest,
 'rootScale':settings['scales'][0],'screenPosition':[0,.5+.008/settings['scales'][0][1],-.015],
 'coordinates':'Native Unity local coordinates; browser reflects X and quaternion Y/Z.','parts':parts,
 'screenStyle':{'source':'TabletMinimap constructor RVA0x510DF0: gold route/orange marker as in developer reference screenshots. The compiled level1 has white/grey scene overrides.',
 'roadColor':[.86,.72,.42,1],'markerFill':[1,.55,.08,1],'markerOutline':[.28,.12,.02,1],
 'backgroundColor':[.2,.18,.1,1],'markerSize':26}}
args.output.mkdir(parents=True,exist_ok=True);path=args.output/'tablet-shell.json';path.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'path':str(path),'parts':len(parts),'sourceSha256':digest}))
