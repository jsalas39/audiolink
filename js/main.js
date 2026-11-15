import {PROFILES as PR,QUALITY} from './config.js';
import {modulate,Demod,frameSeconds} from './modem.js';
import {prepare,roundFrames,parseFrame,Assembler,T,buildFrame,ackPayload,parseAck} from './protocol.js';
const $=id=>document.getElementById(id),fmt=n=>n<1024?n+' B':(n/1024).toFixed(1)+' KB',dur=s=>s<90?Math.round(s)+' s':(s/60).toFixed(1)+' min',sleep=ms=>new Promise(r=>setTimeout(r,ms));
const qual=s=>QUALITY.find(([t])=>s>=t)[1];
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
let ctx,aTx,aRx,gate=0;
const ensure=async()=>{if(!ctx){ctx=new AudioContext();aTx=ctx.createAnalyser();aTx.fftSize=4096;aRx=ctx.createAnalyser();aRx.fftSize=4096}await ctx.resume()};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('on',x===b));
 for(const s of ['tx','rx','hist'])$(s).hidden=s!==b.dataset.t;if(b.dataset.t==='hist')renderHist()});
const setEstado=(t,on)=>{$('estado').textContent=t;$('estado').classList.toggle('on',!!on)};
const hist=()=>{try{return JSON.parse(localStorage.getItem('al_hist')||'[]')}catch{return[]}};
const addHist=r=>{try{localStorage.setItem('al_hist',JSON.stringify([{t:new Date().toLocaleString('es'),...r},...hist()].slice(0,50)))}catch{}};
function renderHist(){const tb=$('hb');tb.textContent='';for(const h of hist()){const tr=tb.insertRow();for(const v of [h.t,h.dir,h.name,fmt(h.size),h.estado])tr.insertCell().textContent=v}}
$('clr').onclick=()=>{try{localStorage.removeItem('al_hist')}catch{}renderHist()};
// Salida de audio. El micrófono se ignora mientras se emite y 1,5 s después (compuerta anti-eco propio).
function play(frame,pid){return new Promise(res=>{const d=modulate(frame,pid,ctx.sampleRate),b=ctx.createBuffer(1,d.length,ctx.sampleRate);b.copyToChannel(d,0);
 const s=ctx.createBufferSource();s.buffer=b;s.connect(aTx);aTx.connect(ctx.destination);gate=Infinity;s.onended=()=>{gate=Date.now()+1500;res()};tx.src=s;s.start()})}
// Micrófono compartido (receptor y espera de ACK del emisor)
let stream,src,node,dm,micOn=false,rxUser=false,workletOk=false,ok=0,bad=0,recent=[],lastSnr=0,q=Promise.resolve(),saved=null,ackRes=null,txSid=null;
const asm=new Assembler(u=>renderRx(u));
function stats(){const per=recent.length?recent.filter(v=>!v).length/recent.length:0;$('sOk').textContent=ok;$('sBad').textContent=bad;$('sPer').textContent=Math.round(per*100)+'%';
 if(ok){$('sSnr').textContent=lastSnr.toFixed(1);$('sQual').textContent=qual(lastSnr)}}
const sendAck=async pid=>{await sleep(700);setEstado('Confirmando (ACK)',true);await play(buildFrame(T.ACK,asm.sid,0,ackPayload(asm,lastSnr)),pid);setEstado('Escuchando',true)};
function onFrame(f,r){if(f.type===T.ACK){if(f.sid===txSid&&ackRes){const cb=ackRes,a=parseAck(f.payload);ackRes=null;cb(a)}return}
 if(tx.run)return;q=q.then(async()=>{await asm.handle(f);if(f.type===T.END&&f.sid===asm.sid&&$('ackOn').checked)await sendAck(r.pid)})}
function onDemod(r){if(Date.now()<gate)return;const f=r.bytes&&parseFrame(r.bytes);recent.push(f?1:0);if(recent.length>20)recent.shift();
 if(!f)bad++;else{ok++;lastSnr=r.snr;$('sPerf').textContent=PR[r.pid].name;$('bits').textContent=[...r.bytes.slice(0,8)].map(b=>b.toString(2).padStart(8,'0')).join(' ');$('rxst').className='muted';onFrame(f,r)}stats()}
async function startMic(user){if(micOn){if(user)rxUser=true;return true}
 try{await ensure();stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(!workletOk){await ctx.audioWorklet.addModule('js/capture-worklet.js');workletOk=true}}
 catch(e){const m='No se pudo acceder al micrófono: '+e.message+'. Requiere HTTPS o localhost y permiso del usuario.';$('rxst').textContent=m;$('txst').textContent=m;return false}
 src=ctx.createMediaStreamSource(stream);node=new AudioWorkletNode(ctx,'cap');const mute=ctx.createGain();mute.gain.value=0;
 src.connect(node);node.connect(mute);mute.connect(ctx.destination);src.connect(aRx);dm=new Demod(ctx.sampleRate,onDemod);
 node.port.onmessage=e=>{let s=0;for(const v of e.data)s+=v*v;$('sNivel').textContent=Math.round(Math.sqrt(s/e.data.length)*100)+'%';dm.push(e.data);$('sSync').textContent=dm.peak.toFixed(2);if(!dm.st)dm.peak*=.97};
 micOn=true;rxUser=!!user;$('rxst').textContent='Escuchando… Al enviar, «Sincronía» debe subir por encima de 0,12.';$('mic').disabled=true;$('stop').disabled=false;setEstado('Escuchando',true);
 (function draw(){if(!micOn)return;const c=$('spec').getContext('2d'),a=new Uint8Array(aRx.frequencyBinCount),n=Math.floor(6000/(ctx.sampleRate/aRx.fftSize));aRx.getByteFrequencyData(a);
  c.fillStyle='#0d1426';c.fillRect(0,0,800,160);c.fillStyle='#e59a00';for(let i=0;i<n;i++){const h=a[i]/255*160;c.fillRect(i/n*800,160-h,Math.max(1,800/n),h)}requestAnimationFrame(draw)})();return true}
function stopMic(){micOn=false;stream?.getTracks().forEach(t=>t.stop());src?.disconnect();node?.disconnect();$('mic').disabled=false;$('stop').disabled=true;setEstado('Canal inactivo',false)}
$('mic').onclick=()=>startMic(true);$('stop').onclick=stopMic;
function renderRx(u){const pct=u.total?u.got/u.total*100:0;$('rxbar').style.width=pct+'%';const r=$('rxres');r.textContent='';
 if(u.status==='receiving'){$('rxst').textContent=u.meta?`Recibiendo «${u.meta.name}» (${fmt(u.meta.fileSize)}): ${u.got}/${u.total} paquetes.`+(u.missing.length&&u.missing.length<=30?` Faltan: ${u.missing.join(', ')}.`:''):`Paquetes recibidos: ${u.got}. Esperando metadatos (META)…`;return}
 const k=u.status==='ok';$('rxst').textContent=(k?'✔ Transmisión exitosa. ':'✖ Error de integridad. ')+u.msg;$('rxst').className=k?'ok':'er';
 if(saved!==u.sid){saved=u.sid;addHist({dir:'Recibido',name:u.meta.name,size:u.meta.fileSize,estado:k?'Verificado':'Corrupto'})}
 if(k){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([u.data],{type:u.meta.mime||'application/octet-stream'}));a.download=u.meta.name;a.textContent=`Descargar ${u.meta.name}`;a.style.cssText='display:inline-block;padding:9px 18px;border-radius:8px;text-decoration:none;color:#fff;background:var(--ac)';r.append(a);
  if(u.meta.flags&2){const p=document.createElement('pre');p.textContent=new TextDecoder().decode(u.data);r.append(p)}}}
// Transmisor
const tx={cancel:false,paused:false,run:false,src:null};
$('file').onchange=()=>{const f=$('file').files[0];$('info').textContent=f?`${f.name} · ${f.type||'tipo desconocido'} · ${fmt(f.size)}`:'Sin archivo seleccionado.';if(f)$('txt').value=''};
$('pause').onclick=async()=>{tx.paused=!tx.paused;$('pause').textContent=tx.paused?'Reanudar':'Pausar';tx.paused?await ctx.suspend():await ctx.resume()};
$('cancel').onclick=()=>{tx.cancel=true;tx.paused=false;try{tx.src?.stop()}catch{}ctx?.resume();if(ackRes){const c=ackRes;ackRes=null;c(null)}};
const waitAck=ms=>new Promise(r=>{ackRes=r;setTimeout(()=>{if(ackRes===r){ackRes=null;r(null)}},ms)});
$('send').onclick=async()=>{if(tx.run)return;let data,name,mime,isText=false;const f=$('file').files[0],t=$('txt').value;
 if(t.trim()){data=new TextEncoder().encode(t);name='mensaje.txt';mime='text/plain';isText=true}else if(f){data=new Uint8Array(await f.arrayBuffer());name=f.name;mime=f.type||'application/octet-stream'}else{$('txst').textContent='Selecciona un archivo o escribe un mensaje.';return}
 await ensure();const pid=+$('prof').value,arq=$('arq').checked,rounds=Math.max(1,Math.min(20,+$('rounds').value||1));
 if(arq&&!await startMic(false))return;
 const p=await prepare(data,{name,mime,isText,pid}),total=p.meta.total,secs=roundFrames(p,1).reduce((a,x)=>a+frameSeconds(x.length-8,pid),0)*(arq?1:rounds);
 if(secs>300&&!confirm(`La transmisión durará aprox. ${dur(secs)}. ¿Continuar?`))return;
 tx.run=true;tx.cancel=false;tx.paused=false;txSid=p.sid;$('send').disabled=true;$('pause').disabled=$('cancel').disabled=false;setEstado('Transmitiendo',true);
 (function draw(){if(!tx.run)return;const c=$('scope').getContext('2d'),a=new Uint8Array(aTx.fftSize);aTx.getByteTimeDomainData(a);c.fillStyle='#0d1426';c.fillRect(0,0,800,140);c.strokeStyle='#37c2e6';c.beginPath();
  for(let i=0;i<800;i++){const y=a[Math.floor(i*a.length/800)]/255*140;i?c.lineTo(i,y):c.moveTo(i,y)}c.stroke();requestAnimationFrame(draw)})();
 const acked=new Set(),maxR=arq?Math.ceil(total/32)+8:rounds;let confirmed=false,fails=0,note='';
 for(let r=1;r<=maxR&&!tx.cancel&&!confirmed;r++){let fr;
  if(arq){const pend=[];for(let i=0;i<total&&pend.length<32;i++)if(!acked.has(i))pend.push(i);
   fr=[buildFrame(T.META,p.sid,0,p.metaBytes),...pend.map(i=>buildFrame(T.DATA,p.sid,i,p.pk[i])),buildFrame(T.END,p.sid,r,new Uint8Array(0))]}else fr=roundFrames(p,r);
  for(let i=0;i<fr.length&&!tx.cancel;i++){$('txst').textContent=`${arq?'Ventana':'Ronda'} ${r}/${maxR} · trama ${i+1}/${fr.length} · ${PR[pid].name} · ${total} paquetes${p.meta.flags&1?' (comprimido)':''}`;
   if(!arq)$('txbar').style.width=(((r-1)*fr.length+i)/(rounds*fr.length)*100)+'%';await play(fr[i],pid)}
  if(arq&&!tx.cancel){$('txst').textContent='Esperando confirmación (ACK) del receptor…';const a=await waitAck(14000);
   if(!a){if(++fails>=3){note='Sin respuesta del receptor tras 3 intentos. Revisa distancia, volumen y que el receptor tenga activada la confirmación.';break}continue}
   fails=0;for(let i=0;i<a.base&&i<total;i++)acked.add(i);a.bits.forEach((b,j)=>{if(b&&a.base+j<total)acked.add(a.base+j)});
   confirmed=acked.size>=total;$('txbar').style.width=(acked.size/total*100)+'%';
   note=`Calidad reportada por el receptor: ${qual(a.snr)} (SNR ${a.snr} dB, umbral provisional).`+(a.snr<6&&pid>0?' Sugerencia: usa el perfil Robusto.':'')}}
 const estado=tx.cancel?'Cancelado':arq?(confirmed?'Confirmado por el receptor':'Sin confirmar'):'Emitido (sin confirmación)';
 if(!arq&&!tx.cancel)$('txbar').style.width='100%';
 $('txst').textContent=tx.cancel?'Transmisión cancelada.':arq?(confirmed?'✔ Todos los paquetes fueron confirmados por el receptor. ':'✖ No se pudo confirmar la entrega. ')+note:`Transmisión terminada (${rounds} rondas). Modo carrusel: sin confirmación; verifica en el receptor.`;
 addHist({dir:'Enviado',name,size:data.length,estado});tx.run=false;txSid=null;if(!rxUser&&micOn)stopMic();
 $('send').disabled=false;$('pause').disabled=$('cancel').disabled=true;$('pause').textContent='Pausar';setEstado(micOn?'Escuchando':'Canal inactivo',micOn)};
