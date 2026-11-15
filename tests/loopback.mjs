// Prueba de lazo cerrado SIMULADA (no es una prueba acústica real).
import {modulate,Demod,crc16} from '../js/modem.js';
import {prepare,roundFrames,parseFrame,Assembler} from '../js/protocol.js';
console.log('CRC-16 "123456789" =',crc16(new TextEncoder().encode('123456789')).toString(16),'(esperado 29b1)');
const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());
function resample(x,a,b){const n=Math.floor(x.length*b/a),o=new Float32Array(n);for(let i=0;i<n;i++){const t=i*a/b,k=Math.floor(t),f=t-k;o[i]=x[k]*(1-f)+(x[k+1]||0)*f}return o}
async function run(pid,txSr,rxSr,sigma,txt){
 const data=new TextEncoder().encode(txt),p=await prepare(data,{name:'t.txt',mime:'text/plain',isText:true,pid});
 const parts=[new Float32Array(Math.round(txSr*.7)),...roundFrames(p,1).map(f=>modulate(f,pid,txSr))];
 let sig=new Float32Array(parts.reduce((a,x)=>a+x.length,0)),o=0;for(const x of parts){sig.set(x,o);o+=x.length}
 if(txSr!==rxSr)sig=resample(sig,txSr,rxSr);for(let i=0;i<sig.length;i++)sig[i]+=sigma*gauss();
 let res=null,ok=0,bad=0;const as=new Assembler(r=>res=r);let q=Promise.resolve();
 const d=new Demod(rxSr,r=>{if(r.fail)return bad++;const f=parseFrame(r.bytes);if(!f)return bad++;ok++;q=q.then(()=>as.handle(f))});
 for(let i=0;i<sig.length;i+=2048)d.push(sig.subarray(i,i+2048));await q;
 console.log(`perfil ${pid} tx${txSr}->rx${rxSr} σ=${sigma}: tramas ok=${ok} mal=${bad} estado=${res?.status} texto_ok=${!!res?.data&&new TextDecoder().decode(res.data)===txt}`)}
await run(1,48000,48000,0.0,'Hola mundo desde el sonido');
await run(1,48000,44100,0.05,'Hola mundo desde el sonido');
await run(0,44100,48000,0.1,'Prueba robusta con ñ y acentos áéí');
await run(2,48000,48000,0.02,'Perfil rápido');
