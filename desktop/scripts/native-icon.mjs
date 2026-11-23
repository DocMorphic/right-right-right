import {readFile,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';

function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,bytes){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,bytes])));return Buffer.concat([length,tag,bytes,crc]);}
function pngFromDib(dib){
 const header=dib.readUInt32LE(0),width=dib.readInt32LE(4),height=Math.abs(dib.readInt32LE(8))/2;
 if(dib.readUInt16LE(14)!==32||!Number.isInteger(height))return null;
 const stride=width*4,maskStride=Math.ceil(width/32)*4,maskOffset=header+stride*height,hasAlpha=Array.from({length:width*height},(_,i)=>dib[header+i*4+3]).some(Boolean),rows=[];
 for(let y=0;y<height;y++){const row=Buffer.alloc(1+width*4);for(let x=0;x<width;x++){
  const at=header+(height-1-y)*stride+x*4,to=1+x*4,masked=(dib[maskOffset+(height-1-y)*maskStride+(x>>3)]??0)&(0x80>>(x&7));
  row[to]=dib[at+2];row[to+1]=dib[at+1];row[to+2]=dib[at];row[to+3]=masked?0:hasAlpha?dib[at+3]:255;
 }rows.push(row);}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 return {width,height,png:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))])};
}
/** Losslessly re-encodes the original executable's icon pixels; no new artwork. */
export async function extractNativeIcon(executable,destination){
 const bytes=await readFile(executable),pe=bytes.readUInt32LE(0x3c),optional=pe+24,count=bytes.readUInt16LE(pe+6),sections=optional+bytes.readUInt16LE(pe+20);
 const offset=rva=>{for(let i=0;i<count;i++){const at=sections+i*40,address=bytes.readUInt32LE(at+12);if(rva>=address&&rva<address+Math.max(bytes.readUInt32LE(at+8),bytes.readUInt32LE(at+16)))return rva-address+bytes.readUInt32LE(at+20);}throw new Error('Invalid resource address');};
 const directory=optional+(bytes.readUInt16LE(optional)===0x20b?112:96),root=offset(bytes.readUInt32LE(directory+16));
 function resources(at,ids=[]){const result=[];for(let i=0;i<bytes.readUInt16LE(at+12)+bytes.readUInt16LE(at+14);i++){
  const id=bytes.readUInt32LE(at+16+i*8),target=bytes.readUInt32LE(at+20+i*8);
  if(target&0x80000000)result.push(...resources(root+(target&0x7fffffff),[...ids,id]));
  else{const data=root+target,start=offset(bytes.readUInt32LE(data)),size=bytes.readUInt32LE(data+4);result.push({ids:[...ids,id],bytes:bytes.subarray(start,start+size)});}
 }return result;}
 const types={16:'icp4',32:'icp5',64:'icp6',128:'ic07',256:'ic08'},icons=new Map();
 for(const resource of resources(root))if(resource.ids[0]===3){const image=pngFromDib(resource.bytes);if(image&&image.width===image.height&&types[image.width]&&!icons.has(image.width))icons.set(image.width,image.png);}
 if(!icons.size)throw new Error('The original runtime has no supported icon pixels.');
 const parts=[];for(const [size,png]of icons){const header=Buffer.alloc(8);header.write(types[size]);header.writeUInt32BE(png.length+8,4);parts.push(header,png);}
 const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+parts.reduce((sum,part)=>sum+part.length,0),4);await writeFile(destination,Buffer.concat([header,...parts]));
 return {source:'Original game runtime executable RT_ICON resources',executableSha256:createHash('sha256').update(bytes).digest('hex'),pixelSizes:[...icons.keys()].sort((a,b)=>a-b),newArtwork:false};
}
