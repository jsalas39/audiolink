// Pruebas de lógica de sesión (sin audio): paquete perdido, ACK, éxito, hash corrupto.
import {prepare,Assembler,buildFrame,parseFrame,roundFrames,ackPayload,parseAck,T} from '../js/protocol.js';
const chk=(n,c)=>console.log(c?'OK  ':'FALLO',n);
const data=crypto.getRandomValues(new Uint8Array(400));
const p=await prepare(data,{name:'a.bin',mime:'application/octet-stream',isText:false,pid:1});
let res;const a=new Assembler(r=>res=r);
for(const f of roundFrames(p,1).map(parseFrame))if(!(f.type===T.DATA&&f.seq===2))await a.handle(f);
const k=parseAck(ackPayload(a,12));
chk(`paquete 2 faltante, estado=${res.status}, faltan=[${res.missing}]`,res.status==='receiving'&&res.missing.join()==='2');
chk(`ACK: base=${k.base}, snr=${k.snr}, bit(3)=${k.bits[1]}`,k.base===2&&k.snr===12&&k.bits[0]===0&&k.bits[1]===1);
await a.handle(parseFrame(buildFrame(T.DATA,p.sid,2,p.pk[2])));
chk('tras reenviar: estado ok y bytes idénticos',res.status==='ok'&&res.data.length===400&&res.data.every((v,i)=>v===data[i]));
chk('ACK final: base=total',parseAck(ackPayload(a,0)).base===p.meta.total);
const b=new Assembler(r=>res=r),bad=p.pk.map(x=>x.slice());bad[3][0]^=1;
await b.handle(parseFrame(buildFrame(T.META,p.sid,0,p.metaBytes)));
for(let i=0;i<bad.length;i++)await b.handle(parseFrame(buildFrame(T.DATA,p.sid,i,bad[i])));
chk(`paquete alterado con CRC válido: estado=${res.status}, sin datos entregados`,res.status==='corrupt'&&res.data===null);
