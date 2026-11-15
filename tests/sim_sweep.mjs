// SIMULACIÓN: barrido de ruido, eco, pérdida de tramas y archivo binario. No son mediciones acústicas.
import {modulate,Demod} from '../js/modem.js';
import {PROFILES as PR} from '../js/config.js';
import {prepare,roundFrames,buildFrame,parseFrame,Assembler,T} from '../js/protocol.js';
const gauss=()=>Math.sqrt(-2*Math.log(Math.random()+1e-12))*Math.cos(2*Math.PI*Math.random());
const SR=48000;
function decode(sig,sr=SR){const out=[];const d=new Demod(sr,r=>out.push(r));for(let i=0;i<sig.length;i+=2048)d.push(sig.subarray(i,i+2048));return out}
function chan(x,{sigma=0,echo=false}){const y=new Float32Array(x.length+SR);y.set(x,Math.round(SR*.3));
 if(echo){const z=y.slice();for(const[dl,g]of[[.012,.5],[.035,.3]]){const k=Math.round(dl*SR);for(let i=k;i<y.length;i++)z[i]+=g*y[i-k]}return z.map(v=>v+sigma*gauss())}
 return y.map(v=>v+sigma*gauss())}
const T_=8,sigmas=[0.05,0.2,0.4,0.6,0.9,1.5,3,6,12];
console.log('Tasa de tramas válidas (%) por perfil, 1 trama de carga completa, '+T_+' intentos. SNR aprox. = 10log10(0.18/σ²)');
console.log('| σ | SNR aprox (dB) | '+PR.map(p=>p.name).join(' | ')+' | Robusto + eco |');console.log('|---|---|---|---|---|---|');
for(const s of sigmas){const row=[];
 for(const [pid,echo] of [[0,0],[1,0],[2,0],[0,1]]){let ok=0;for(let t=0;t<T_;t++){const pl=crypto.getRandomValues(new Uint8Array(PR[pid].pkt)),f=buildFrame(T.DATA,t,t,pl);
  const r=decode(chan(modulate(f,pid,SR),{sigma:s,echo}));const g=r.find(x=>x.bytes&&parseFrame(x.bytes));if(g&&g.bytes.every((v,i)=>v===f[i]))ok++}row.push(Math.round(ok/T_*100))}
 console.log(`| ${s} | ${(10*Math.log10(.18/(s*s))).toFixed(1)} | ${row.join(' | ')} |`)}
// Pérdida de tramas en carrusel: se pierde un DATA en la ronda 1; debe recuperarse en la ronda 2. Archivo binario de 300 B (no compresible).
const data=crypto.getRandomValues(new Uint8Array(300)),pid=2,p=await prepare(data,{name:'x.bin',mime:'application/octet-stream',isText:false,pid});
const fr=[...roundFrames(p,1).filter((_,i)=>i!==3),...roundFrames(p,2)];let res;const as=new Assembler(r=>res=r);let q=Promise.resolve();
const sig=chan(Float32Array.from(fr.flatMap(f=>[...modulate(f,pid,SR)])),{sigma:.1});
for(const r of decode(sig)){const f=r.bytes&&parseFrame(r.bytes);if(f)q=q.then(()=>as.handle(f))}await q;
console.log(`\nCarrusel con pérdida de la trama DATA nº2 en ronda 1 (binario ${data.length} B, perfil ${PR[pid].name}, σ=0.1): estado=${res?.status}, idéntico=${!!res?.data&&res.data.every((v,i)=>v===data[i])}`);
console.log('Duración de audio de una ronda (s):',(Float32Array.from(roundFrames(p,1).flatMap(f=>[...modulate(f,pid,SR)])).length/SR).toFixed(1));
