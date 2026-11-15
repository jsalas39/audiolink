// Capa de enlace (tramas) y sesión (META/DATA/END, compresión, hash, reensamblado).
import {crc16} from './modem.js';
import {PROFILES as PR} from './config.js';
export const T={META:1,DATA:2,ACK:3,END:4,ABORT:5};
export function buildFrame(type,sid,seq,pl){const L=pl.length,f=new Uint8Array(8+L);f[0]=16|type;f[1]=sid>>8;f[2]=sid&255;f[3]=seq>>8;f[4]=seq&255;f[5]=L;f.set(pl,6);
 const c=crc16(f.subarray(0,6+L));f[6+L]=c>>8;f[7+L]=c&255;return f}
export function parseFrame(f){if(f.length<8||f.length!==8+f[5]||f[0]>>4!==1)return null;const L=f[5];
 if(crc16(f.subarray(0,6+L))!==((f[6+L]<<8)|f[7+L]))return null;return{type:f[0]&15,sid:(f[1]<<8)|f[2],seq:(f[3]<<8)|f[4],payload:f.slice(6,6+L)}}
const enc=new TextEncoder(),dec=new TextDecoder();
export function encMeta(m){const nm=enc.encode(m.name).slice(0,32),mi=enc.encode(m.mime).slice(0,24),o=new Uint8Array(30+nm.length+mi.length),v=new DataView(o.buffer);
 v.setUint32(0,m.fileSize);v.setUint32(4,m.wireSize);v.setUint16(8,m.total);o[10]=m.pkt;o[11]=m.flags;o.set(m.hash,12);o[28]=nm.length;o.set(nm,29);o[29+nm.length]=mi.length;o.set(mi,30+nm.length);return o}
export function decMeta(o){if(o.length<30)return null;const v=new DataView(o.buffer,o.byteOffset,o.length),nl=o[28];if(o.length<30+nl)return null;const ml=o[29+nl];if(o.length!==30+nl+ml)return null;
 return{fileSize:v.getUint32(0),wireSize:v.getUint32(4),total:v.getUint16(8),pkt:o[10],flags:o[11],hash:o.slice(12,28),
  name:dec.decode(o.slice(29,29+nl)).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,64)||'archivo',mime:dec.decode(o.slice(30+nl,30+nl+ml))}}
const pipe=async(d,C,f)=>new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new C(f))).arrayBuffer());
const sha=async d=>new Uint8Array(await crypto.subtle.digest('SHA-256',d)).slice(0,16);
export async function prepare(data,{name,mime,isText,pid}){
 let wire=data,flags=isText?2:0;
 try{if(typeof CompressionStream!=='undefined'){const c=await pipe(data,CompressionStream,'deflate');if(c.length<data.length){wire=c;flags|=1}}}catch{}
 const pkt=PR[pid].pkt,total=Math.max(1,Math.ceil(wire.length/pkt)),pk=[];
 for(let i=0;i<total;i++)pk.push(wire.slice(i*pkt,(i+1)*pkt));
 const meta={fileSize:data.length,wireSize:wire.length,total,pkt,flags,hash:await sha(data),name,mime};
 return{sid:crypto.getRandomValues(new Uint16Array(1))[0],meta,metaBytes:encMeta(meta),pk}}
export const roundFrames=(p,r)=>[buildFrame(T.META,p.sid,0,p.metaBytes),...p.pk.map((d,i)=>buildFrame(T.DATA,p.sid,i,d)),buildFrame(T.END,p.sid,r,new Uint8Array(0))];
export class Assembler{
 constructor(on){this.on=on;this.reset()}
 reset(){this.sid=null;this.meta=null;this.pk=new Map();this.status='receiving';this.msg='';this.data=null}
 emit(){const t=this.meta?.total,missing=[];if(t)for(let i=0;i<t;i++)if(!this.pk.has(i))missing.push(i);
  this.on({sid:this.sid,meta:this.meta,got:this.pk.size,total:t,missing,status:this.status,msg:this.msg,data:this.data})}
 async handle(f){if(f.type!==T.META&&f.type!==T.DATA)return;
  if(f.sid!==this.sid){this.reset();this.sid=f.sid}else if(this.status!=='receiving')return;
  if(f.type===T.META){const m=decMeta(f.payload);if(!m||m.total<1)return;this.meta=m}else this.pk.set(f.seq,f.payload);
  if(this.meta&&this.pk.size>=this.meta.total&&[...this.pk.keys()].every(k=>k<this.meta.total))await this.finish();else this.emit()}
 async finish(){const m=this.meta,w=new Uint8Array(m.wireSize);let o=0,bad='';
  for(let i=0;i<m.total&&!bad;i++){const p=this.pk.get(i);if(o+p.length>w.length)bad='Tamaño de paquetes inconsistente';else{w.set(p,o);o+=p.length}}
  if(!bad&&o!==m.wireSize)bad='Tamaño total inconsistente';
  let d=w;if(!bad&&m.flags&1)try{d=await pipe(w,DecompressionStream,'deflate')}catch{bad='Error al descomprimir'}
  if(!bad){const h=await sha(d);if(d.length!==m.fileSize||h.some((v,i)=>v!==m.hash[i]))bad='El hash SHA-256 no coincide'}
  if(bad){this.status='corrupt';this.msg=bad+': el archivo NO es confiable.'}else{this.status='ok';this.data=d;this.msg='Archivo verificado (CRC-16 por paquete + SHA-256).'}this.emit()}
}
// ACK: [base 2B][bitmap 4B = paquetes base..base+31][SNR+20 1B]. base = primer paquete que falta.
export function ackPayload(a,snr){const m=a.meta;let base=0;while(a.pk.has(base)&&(!m||base<m.total))base++;
 const o=new Uint8Array(7);o[0]=base>>8;o[1]=base&255;for(let j=0;j<32;j++)if(a.pk.has(base+j)&&!(m&&base+j>=m.total))o[2+(j>>3)]|=0x80>>(j&7);
 o[6]=Math.max(0,Math.min(255,Math.round((snr??0)+20)));return o}
export function parseAck(p){if(p.length<7)return null;const bits=[];for(let j=0;j<32;j++)bits.push((p[2+(j>>3)]>>(7-(j&7)))&1);return{base:(p[0]<<8)|p[1],bits,snr:p[6]-20}}
