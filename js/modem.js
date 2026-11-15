// Capa física + utilidades de enlace: CRC, scrambler, Gray, modulador M-FSK y demodulador (Goertzel).
import {PROFILES as PR,CHIRP,SIL,TRAIN,AMP} from './config.js';
export function crc16(b){let c=0xFFFF;for(const x of b){c^=x<<8;for(let i=0;i<8;i++)c=c&0x8000?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c}
export function scramble(b){let s=0x7F;const o=new Uint8Array(b.length);for(let i=0;i<b.length;i++){let k=0;for(let j=0;j<8;j++){const f=((s>>6)^(s>>3))&1;s=((s<<1)|f)&127;k=(k<<1)|f}o[i]=b[i]^k}return o}
const gray=v=>v^(v>>1),ungray=g=>{let v=0;for(;g;g>>=1)v^=g;return v};
export function toSyms(b,n){const o=[];let a=0,c=0;for(const x of b)for(let j=7;j>=0;j--){a=(a<<1)|((x>>j)&1);if(++c==n){o.push(a);a=0;c=0}}if(c)o.push(a<<(n-c));return o}
export function fromSyms(s,n,nb){const o=new Uint8Array(nb);let bi=0;for(const v of s)for(let j=n-1;j>=0&&bi<nb*8;j--,bi++)if((v>>j)&1)o[bi>>3]|=0x80>>(bi&7);return o}
const M=P=>1<<P.bits,freq=(P,k)=>P.f0+P.df*k,symLen=(P,sr)=>Math.round(P.ms*sr/1000);
export const frameSeconds=(len,pid)=>{const P=PR[pid];return 2*SIL+CHIRP.ms/1000+.12+(TRAIN+Math.ceil((8+len)*8/P.bits))*P.ms/1000};
export function chirp(sr){const n=Math.round(CHIRP.ms*sr/1000),k=(CHIRP.f1-CHIRP.f0)/(CHIRP.ms/1000),o=new Float32Array(n);
 for(let i=0;i<n;i++){const t=i/sr;o[i]=AMP*(.5-.5*Math.cos(2*Math.PI*i/(n-1)))*Math.sin(2*Math.PI*(CHIRP.f0*t+k*t*t/2))}return o}
function tone(out,off,len,f,sr){const r=Math.floor(len*.1);for(let i=0;i<len;i++){const e=i<r?.5-.5*Math.cos(Math.PI*i/r):i>=len-r?.5-.5*Math.cos(Math.PI*(len-1-i)/r):1;out[off+i]=AMP*e*Math.sin(2*Math.PI*f*i/sr)}}
// Trama -> señal: [silencio][chirp][cabecera PHY 2 símb. robustos][6 entrenamiento][carga][silencio]
export function modulate(frame,pid,sr){
 const P=PR[pid],P0=PR[0],sl=symLen(P,sr),s0=symLen(P0,sr),sil=Math.round(SIL*sr),ch=chirp(sr);
 const syms=toSyms(scramble(frame),P.bits).map(gray);
 const out=new Float32Array(2*sil+ch.length+2*s0+(TRAIN+syms.length)*sl);
 let o=sil;out.set(ch,o);o+=ch.length;
 for(const v of [pid,pid^7]){tone(out,o,s0,freq(P0,v),sr);o+=s0}
 for(let j=0;j<TRAIN;j++){tone(out,o,sl,freq(P,j%2?M(P)-1:0),sr);o+=sl}
 for(const v of syms){tone(out,o,sl,freq(P,v),sr);o+=sl}
 return out}
export class Demod{
 constructor(sr,cb){this.sr=sr;this.cb=cb;this.buf=new Float32Array(sr*90);this.n=0;this.base=0;
  this.tpl=chirp(sr);this.L=this.tpl.length;this.te=Math.sqrt(this.tpl.reduce((a,v)=>a+v*v,0));this.pos=0;this.st=null;this.thr=.12;this.peak=0}
 push(x){if(this.n-this.base+x.length>this.buf.length){const d=this.n-this.base-60*this.sr;this.buf.copyWithin(0,d);this.base+=d}
  this.buf.set(x,this.n-this.base);this.n+=x.length;for(;;){if(!(this.st?this.decode():this.find()))return}}
 corr(p){const b=this.buf,o=p-this.base,t=this.tpl;let d=0,e=0;for(let i=0;i<this.L;i++){const v=b[o+i];d+=v*t[i];e+=v*v}return Math.abs(d)/(this.te*Math.sqrt(e)+1e-9)}
 find(){const S=16,L=this.L;if(this.pos<this.base)this.pos=this.base;
  while(this.pos+L+3*S<=this.n){const c0=this.corr(this.pos);if(c0>this.peak)this.peak=c0;if(c0>this.thr){let bp=this.pos,bc=0;
    for(let p=Math.max(this.base,this.pos-2*S);p<=this.pos+3*S;p++){const v=this.corr(p);if(v>bc){bc=v;bp=p}}
    this.st={start:bp+L};this.pos=bp+L;return true}this.pos+=S}return false}
 goertz(a,len,f){const w=2*Math.cos(2*Math.PI*f/this.sr),b=this.buf,o=a-this.base;let s1=0,s2=0;for(let i=0;i<len;i++){const s=b[o+i]+w*s1-s2;s2=s1;s1=s}return s1*s1+s2*s2-w*s1*s2}
 energies(start,sl,P){const w=Math.round(.8*sl),a=start+Math.round(.1*sl),e=[];let sum=0;for(let k=0;k<M(P);k++){const v=this.goertz(a,w,freq(P,k));e.push(v);sum+=v}e.sum=sum;return e}
 argmax(start,sl,P){const e=this.energies(start,sl,P);return e.indexOf(Math.max(...e))}
 fail(){this.st=null;this.cb({fail:true});return true}
 decode(){const s=this.st,sr=this.sr,s0=symLen(PR[0],sr);if(s.start<this.base)return this.fail();
  if(!s.P){if(this.n<s.start+2*s0)return false;const a=this.argmax(s.start,s0,PR[0]),b=this.argmax(s.start+s0,s0,PR[0]);
   if(a>2||(a^b)!==7)return this.fail();s.P=PR[a];s.pid=a;s.sl=symLen(s.P,sr);s.ts=s.start+2*s0}
  const P=s.P,sl=s.sl,R=Math.round(sr*.004);
  if(s.ps===undefined){if(this.n<s.ts+TRAIN*sl+R)return false;let best=-1,bo=0,bsnr=0;
   for(let d=-R;d<=R;d+=Math.max(1,Math.round(sr/2000))){let ex=0,tot=0;for(let j=0;j<TRAIN;j++){const e=this.energies(s.ts+j*sl+d,sl,P);tot+=e.sum;ex+=e[j%2?M(P)-1:0]}
    if(ex/tot>best){best=ex/tot;bo=d;bsnr=10*Math.log10(ex*(M(P)-1)/(tot-ex+1e-12))}}
   s.ps=s.ts+TRAIN*sl+bo;s.snr=bsnr}
  const syms=c=>{const r=[];for(let i=0;i<c;i++)r.push(ungray(this.argmax(s.ps+i*sl,sl,P)));return r};
  if(!s.total){const nH=Math.ceil(48/P.bits);if(this.n<s.ps+(nH+1)*sl)return false;
   const len=scramble(fromSyms(syms(nH),P.bits,6))[5];if(len>100)return this.fail();s.len=len;s.total=Math.ceil((8+len)*8/P.bits)}
  if(this.n<s.ps+(s.total+1)*sl)return false;
  const bytes=scramble(fromSyms(syms(s.total),P.bits,8+s.len));this.pos=s.ps+s.total*sl;this.st=null;this.cb({bytes,snr:s.snr,pid:s.pid});return true}
}
