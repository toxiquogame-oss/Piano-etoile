(function(){
'use strict';
// Piano étoilé V32 : calibration séquentielle et reconnaissance strictement empirique.
// La reconnaissance polyphonique existante reste en place. Aucune donnée sonore n'est envoyée à un serveur.
// Anciens profils conservés dans le stockage, mais captures non vérifiées écartées.
const key='piano-etoile-profiles-v29-verified';
let trained={};try{trained=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(e){}
const $=id=>document.getElementById(id), hz=n=>440*Math.pow(2,(n-69)/12);
const get=()=>trained[pianoProfile]||(trained[pianoProfile]={});
let runtimeNoise=null;

// Apprentissage empirique : ignore les infrasons et compare les pics mesurés,
// sans utiliser la fréquence théorique de la touche sélectionnée.
const MIN_CAPTURE_HZ=25,MAX_CAPTURE_HZ=5200;
const amplitude=db=>Number.isFinite(db)?Math.pow(10,Math.max(-130,db)/20):0;
const isMeasured=x=>x?.method==='three-strikes'&&Array.isArray(x.peaks)&&x.peaks.length>0;
function localPeak(spec,k,step){
 const a=spec[k-1],b=spec[k],c=spec[k+1],den=a-2*b+c;
 const offset=Number.isFinite(den)&&den<0?Math.max(-.5,Math.min(.5,.5*(a-c)/den)):0;
 return {f:(k+offset)*step,a:amplitude(b)};
}
function extractSignature(spec,step,noise,cfg){
 const peaks=[],limit=Math.min(spec.length-2,Math.floor(MAX_CAPTURE_HZ/step)+1);
 for(let k=Math.max(2,Math.floor(MIN_CAPTURE_HZ/step));k<=limit;k++){
  if(!(spec[k]>spec[k-1]&&spec[k]>=spec[k+1]))continue;
  const {f,a}=localPeak(spec,k,step);
  if(f<MIN_CAPTURE_HZ||f>MAX_CAPTURE_HZ)continue;
  let bg=0,count=0;
  for(let j=Math.max(1,k-9);j<=Math.min(spec.length-1,k+9);j++){
   if(Math.abs(j-k)<=2)continue;bg+=amplitude(spec[j]);count++;
  }
  const floor=Math.max(cfg.peakFloor, (noise?.[k]||0)*cfg.peakRatio, (bg/Math.max(1,count))*2.2);
  if(a<floor)continue;
  peaks.push([f,a]);
 }
 peaks.sort((a,b)=>b[1]-a[1]);
 const level=peaks[0]?.[1]||0;
 return {level,peaks:peaks.filter(p=>p[1]>=level*.065).slice(0,14).map(([f,a])=>[f,a/level])};
}
const tolerance=(f,step)=>Math.max(step*.55,f*.004);
function similarity(a,b,step){
 if(!a.length||!b.length)return 0;
 let dot=0;const used=new Set();
 for(const [f,w] of a){
  let best=-1,distance=Infinity;
  for(let j=0;j<b.length;j++){
   const d=Math.abs(f-b[j][0]);
   if(!used.has(j)&&d<=tolerance(f,step)&&d<distance){best=j;distance=d;}
  }
  if(best>=0){used.add(best);dot+=w*b[best][1];}
 }
 const norm=x=>Math.sqrt(x.reduce((s,p)=>s+p[1]*p[1],0));
 return dot/(norm(a)*norm(b)||1);
}
function combineSignatures(samples,step){
 const consensus=samples[0].filter(([f])=>samples.slice(1).every(s=>s.some(p=>Math.abs(f-p[0])<=tolerance(f,step))));
 const out=consensus.map(([f])=>{
  const matches=samples.map(s=>s.filter(p=>Math.abs(f-p[0])<=tolerance(f,step)).sort((a,b)=>Math.abs(a[0]-f)-Math.abs(b[0]-f))[0]);
  return [matches.reduce((s,p)=>s+p[0],0)/matches.length,matches.reduce((s,p)=>s+p[1],0)/matches.length];
 });
 const max=Math.max(0,...out.map(p=>p[1]));
 return out.filter(p=>p[1]>=max*.065).sort((a,b)=>b[1]-a[1]).map(([f,a])=>[Number(f.toFixed(2)),Number((a/max).toFixed(4))]);
}
function validateStrikes(strikes,step){
 if(strikes.length!==3||strikes.some(s=>!s.length))return null;
 if(similarity(strikes[0],strikes[1],step)<.76||similarity(strikes[0],strikes[2],step)<.76||similarity(strikes[1],strikes[2],step)<.76)return null;
 const peaks=combineSignatures(strikes,step);
 return peaks.length?peaks:null;
}
// Une frappe doit être stable, suivie d'un vrai retour à un niveau faible,
// puis d'une nouvelle attaque. La même note tenue ne compte qu'une fois.
function newStrikeCollector(step,peakFloor){
 let stable=[],strikes=[],waitingRelease=false,quiet=0,peak=0,release=0,minAttack=peakFloor;
 return { push(frame){
  if(waitingRelease){
   if(frame.level<=Math.max(peakFloor,peak*.13)){
    quiet++;release=Math.max(release,frame.level);
    if(quiet>=4){waitingRelease=false;minAttack=Math.max(peakFloor,release*2.6,peak*.14);stable=[];peak=0;return {type:'ready',count:strikes.length};}
   }else{quiet=0;release=0;}
   return null;
  }
  if(frame.level<minAttack||!frame.peaks.length){stable=[];return null;}
  if(stable.length&&similarity(stable[stable.length-1],frame.peaks,step)<.7)stable=[];
  stable.push(frame.peaks);peak=Math.max(peak,frame.level);
  if(stable.length<3)return null;
  const sig=combineSignatures(stable,step);
  if(!sig.length){stable=[];peak=0;return null;}
  strikes.push(sig);waitingRelease=true;quiet=0;release=0;
  return {type:strikes.length===3?'done':'strike',count:strikes.length,strikes:strikes.slice()};
 }};
}
// Reconnaissance fermée : seules les empreintes apprises peuvent gagner.
 // Le résidu spectral non expliqué et les ambiguïtés sont rejetés.
function identifyLearned(observed,entries,step){
 if(!observed.length||!entries.length)return [];
 const candidates=entries.map(([n,entry])=>{
  const used=new Set(),weights=observed.map(()=>0);
  for(const [f,w] of entry.peaks){
   let best=-1,distance=Infinity;
   for(let i=0;i<observed.length;i++){
    const d=Math.abs(f-observed[i][0]);
    if(!used.has(i)&&d<=tolerance(f,step)&&d<distance){best=i;distance=d;}
   }
   if(best>=0){used.add(best);weights[best]=w;}
  }
  const norm=entry.peaks.reduce((sum,p)=>sum+p[1]**2,0);
  const covered=weights.reduce((sum,w)=>sum+w*w,0);
  return {n,weights,norm,covered};
 }).filter(c=>c.norm>0&&c.covered/c.norm>=.80);
 const signal=observed.map(p=>p[1]),power=signal.reduce((sum,w)=>sum+w*w,0);
 const residual=signal.slice(),chosen=[];
 if(!power)return [];
 for(let i=0;i<5;i++){
  const ranked=candidates.filter(c=>!chosen.some(p=>p.n===c.n)).map(c=>{
   const dot=c.weights.reduce((sum,w,k)=>sum+w*residual[k],0);
   return {...c,amp:dot/c.covered,score:dot/Math.sqrt(c.norm)};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(!best||best.score<Math.sqrt(power)*.16||best.amp<.12)break;
  // Two nearly indistinguishable templates must not randomly select a key.
  if(i===0&&ranked[1]&&ranked[1].score>=best.score*.96){
   const other=ranked[1],overlap=best.weights.reduce((sum,w,k)=>sum+w*other.weights[k],0);
   if(overlap/Math.sqrt(best.covered*other.covered)>.85)return [];
  }
  chosen.push({n:best.n,amp:best.amp});
  for(let k=0;k<residual.length;k++)residual[k]=Math.max(0,residual[k]-best.amp*best.weights[k]);
  if(residual.reduce((sum,w)=>sum+w*w,0)<=power*.10)break;
 }
 // Reject unknown strong partials / noise instead of matching a small subset.
 if(!chosen.length||residual.reduce((sum,w)=>sum+w*w,0)>power*.10)return [];
 const strongest=Math.max(...chosen.map(c=>c.amp));
 return chosen.map(c=>({n:c.n,strength:c.amp/strongest}));
}
function measuredMatch(spec,step,entry,cfg){
 if(!isMeasured(entry))return null;
 const peaks=entry.peaks;
 let observed=[],matched=0,total=0;
 for(const [f,w] of peaks){
  if(f<MIN_CAPTURE_HZ||f>MAX_CAPTURE_HZ)continue;
  total+=w*w;const at=f/step;
  let best=0;
  for(let k=Math.max(2,Math.floor(at)-2);k<=Math.min(spec.length-2,Math.ceil(at)+2);k++){
   if(!(spec[k]>spec[k-1]&&spec[k]>=spec[k+1]))continue;
   const p=localPeak(spec,k,step);
   if(Math.abs(p.f-f)<=tolerance(f,step)&&p.a>best){
    let b=0,count=0;for(let j=Math.max(1,k-9);j<=Math.min(spec.length-1,k+9);j++){if(Math.abs(j-k)<=2)continue;b+=amplitude(spec[j]);count++;}
    if(p.a>=Math.max(cfg.peakFloor,2.2*b/Math.max(1,count)))best=p.a;
   }
  }
  observed.push([w,best]);if(best>0)matched+=w*w;
 }
 if(!total||matched/total<.72)return null;
 const dot=observed.reduce((s,[w,a])=>s+w*a,0),power=observed.reduce((s,[,a])=>s+a*a,0);
 if(!power||dot/Math.sqrt(total*power)<.72)return null;
 return {amp:Math.max(...observed.map(x=>x[1])),cents:0};
}

// Les gabarits appris séparément aident à distinguer des octaves réellement jouées
// des harmoniques d'une seule touche. Jamais besoin d'enregistrer les combinaisons.
window.pianoEtoileIsPairTrained=(a,b)=>Boolean(trained[pianoProfile]?.[a]&&trained[pianoProfile]?.[b]);
window.pianoEtoileCalibratedCount=()=>Object.keys(trained[pianoProfile]||{}).length;
const persist=()=>{try{localStorage.setItem(key,JSON.stringify(trained))}catch(e){message('Stockage local indisponible.')}};
const wrap=document.createElement('section');wrap.className='calibration-panel';
wrap.innerHTML='<style>.calibration-panel{border:1px solid #52516b;background:#1b1927;border-radius:14px;padding:13px;margin:0 0 12px;font-size:12px;color:#dcd4e6}.calibration-panel h2{font-size:15px;margin:0 0 6px}.calibration-panel p{line-height:1.5;margin:7px 0}.calrow[hidden]{display:none!important}.calrow{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:9px 0}.calibration-panel button,.calibration-panel select{padding:7px;min-height:36px;font-size:12px;max-width:100%}#calStatus{color:#d8c4ff}#calCount{color:#94e7e1;font-weight:bold}</style>'+
'<h2>Apprendre les sons de ton piano · Notes et accords</h2>'+
'<p>Enregistre trois frappes séparées pour chacune des <b>notes jouables</b> en son <b>piano classique</b> : 61 pour le Schubert et 61 pour le RockJam. Ensuite, le programme tentera de reconnaître les accords sans enregistrer toutes les combinaisons.</p>'+
'<div class="calrow"><label for="calInput">Source audio :</label><select id="calInput"><option value="">Entrée automatique Android</option></select><button id="calFind" type="button">Actualiser les entrées</button></div>'+
'<p><b>Casque branché au piano :</b> sélectionne « Casque · sons faibles » dans Type d’écoute au-dessus, puis approche une oreillette du microphone du téléphone, à condition qu’un peu de son s’en échappe. Le micro ne peut pas entendre un casque complètement silencieux à l’extérieur. Pour une écoute plus précise, une interface avec entrée ligne USB-C compatible Android reste une autre possibilité.</p>'+
'<div class="calrow" id="calStartRow" hidden><label for="calFirst">Première note du Schubert 61 touches :</label><select id="calFirst"></select></div>'+
'<div class="calrow"><button id="calAll" type="button" class="primary">Calibrer tout le clavier (3 frappes par touche)</button><button id="calStop" type="button" disabled>Arrêter la calibration</button></div>'+
'<div class="calrow"><label for="calNote">Note à apprendre :</label><select id="calNote"></select><button id="calRecord" type="button">Apprendre cette note (3 frappes)</button><button id="calNext" type="button">Suivante</button><button id="calErase" type="button">Effacer ce profil</button></div>'+
'<div class="calrow"><span id="calCount">0 note enregistrée</span><span id="calStatus" role="status"></span></div>'+
'<p>Nouvelle calibration : reste silencieux au début, puis joue trois fois la touche choisie. Relâche-la et attends le signal entre chaque frappe. L’application compare les sons réellement captés (25 Hz et plus), sans imposer une fréquence théorique. Aucun passage automatique si les trois frappes ne concordent pas.</p><p>Le jeu reconnaît uniquement les empreintes apprises, jamais les fréquences théoriques. Les bruits non concordants sont ignorés. Un bruit imitant vraiment une empreinte ou un accord dense peut encore tromper la détection. Choisis bien la touche physique affichée.</p>';
document.querySelector('.mic-panel').insertAdjacentElement('afterend',wrap);
const message=s=>{$('calStatus').textContent=s};
const can=n=>n>=FIRST&&n<=PIANO_PROFILES[pianoProfile].workingLast;
const oldChoose=choosePianoProfile,oldPrepare=mic.prepareTemplates.bind(mic),oldStart=mic.start.bind(mic);
let recording=false,cancelled=false;
$('calStop').onclick=()=>{cancelled=true;message('Arrêt de la calibration…');};
// Le Schubert Etude 61 MKII possède 61 touches, toutes utilisables.
// Les cinq touches aiguës ont été réactivées.
// La première note du Schubert n'est pas confirmée : elle peut être réglée.
let startNote=36;
try{startNote=Number(localStorage.getItem('piano-etoile-schubert61-start'))||36}catch(e){}
if(startNote<21||startNote>48)startNote=36;
for(let n=21;n<=48;n++){
 const opt=document.createElement('option');
 opt.value=n;opt.textContent=noteName(n)+' · '+hz(n).toFixed(1)+' Hz';
 $('calFirst').appendChild(opt);
}
$('calFirst').value=startNote;
function setStart(n){
 const p=PIANO_PROFILES.schubert;
 p.first=n;p.last=n+60;p.workingLast=p.last;
 p.label='Schubert Etude 61 MKII · 61 touches';
 p.info='61 touches utilisables sur 61 · '+noteName(n)+' à '+noteName(n+60)+'.';
}
setStart(startNote);
function refreshNotes(){
 const el=$('calNote'),prev=Number(el.value),map=get();el.replaceChildren();
 let total=0,count=0,measured=0;
 for(let n=FIRST;n<=LAST;n++){
  if(!can(n))continue;total++;if(map[n])count++;if(isMeasured(map[n]))measured++;
  const opt=document.createElement('option');opt.value=n;opt.textContent=(isMeasured(map[n])?'✓ ':map[n]?'Ancien · ':'')+noteName(n);el.appendChild(opt);
 }
 if(can(prev))el.value=prev;
 $('calCount').textContent=measured+' / '+total+' touches apprises par 3 frappes'+(count>measured?' · '+(count-measured)+' anciennes signatures conservées':'');
 $('calStartRow').hidden=pianoProfile!=='schubert';
}
choosePianoProfile=function(id){
 if(recording){message('Attends la fin de la capture.');$('pianoProfile').value=pianoProfile;$('profileMini').value=pianoProfile;return;}
 oldChoose(id);refreshNotes();
};
$('calFirst').onchange=()=>{
 if(recording)return;
 startNote=Number($('calFirst').value);setStart(startNote);
 try{localStorage.setItem('piano-etoile-schubert61-start',String(startNote))}catch(e){}
 if(pianoProfile==='schubert')choosePianoProfile('schubert');
};
function next(){const list=[...$('calNote').options].map(o=>Number(o.value)),current=Number($('calNote').value),map=get();
 const n=list.filter(x=>x>current).concat(list.filter(x=>x<=current)).find(x=>!isMeasured(map[x]));
 if(n===undefined)message('Toutes les touches jouables de ce piano sont enregistrées.');
 else $('calNote').value=n;
}
$('calNext').onclick=next;
$('calErase').onclick=()=>{
 if(!confirm('Effacer les signatures sonores de ce piano uniquement ?'))return;
 delete trained[pianoProfile];persist();
 if(mic.enabled&&mic.ctx)mic.prepareTemplates();
 refreshNotes();message('Ce profil a été effacé.');
};
function learnedPrepare(){
 oldPrepare();const learned=get(),df=mic.ctx.sampleRate/mic.fftSize;
 for(const t of mic.templates){
  const hs=learned[t.note];
  if(isMeasured(hs)){
   const bins=new Map();for(const [f,a] of hs.peaks){const at=f/df,width=Math.max(1,at*.003);for(let b=Math.max(1,Math.floor(at-2.5*width));b<=Math.min(mic.fftSize/2-2,Math.ceil(at+2.5*width));b++){const d=(b-at)/width;bins.set(b,(bins.get(b)||0)+a*Math.exp(-.5*d*d));}}
   const norm=Math.sqrt([...bins.values()].reduce((s,w)=>s+w*w,0))||1;t.list=[...bins].map(([b,w])=>[b,w/norm]);continue;
  }
  if(!Array.isArray(hs)||hs.length<7)continue;
  const bins=new Map(),f0=hz(t.note);
  for(let h=1;h<=7;h++){
   const f=f0*h;if(f>Math.min(5200,mic.ctx.sampleRate*.45))break;
   const at=f/df,width=Math.max(1.25,at*.006),left=Math.max(1,Math.floor(at-2.7*width)),right=Math.min(mic.fftSize/2-2,Math.ceil(at+2.7*width));
   const amp=(.14+Math.max(.025,Number(hs[h-1])||0)*.86)/Math.pow(h,.36);
   for(let b=left;b<=right;b++){const d=(b-at)/width;bins.set(b,(bins.get(b)||0)+amp*Math.exp(-.5*d*d))}
  }
  const list=[...bins],norm=Math.sqrt(list.reduce((s,x)=>s+x[1]*x[1],0))||1;
  t.list=list.map(([bin,w])=>[bin,w/norm]);
 }
 const maps=mic.templates.map(t=>new Map(t.list));
 mic.gram=mic.templates.map((t,i)=>mic.templates.map((other,j)=>{
  if(i===j)return 1;let dot=0;for(const [bin,w] of t.list)dot+=w*(maps[j].get(bin)||0);
  return dot;
 }));
}
mic.prepareTemplates=learnedPrepare;
window.pianoEtoileMeasuredNote=n=>isMeasured(get()[n]);
const measuredEntries=()=>Object.entries(get()).filter(([n,v])=>can(Number(n))&&isMeasured(v)).map(([n,v])=>[Number(n),v]);
let recognized=new Set();
// No theoretical fallback, including when only part of the keyboard is calibrated.
mic.estimate=function(){
 const step=this.ctx.sampleRate/this.fftSize;
 const frame=extractSignature(this.spectrum,step,runtimeNoise,this.captureSettings());
 const result=identifyLearned(frame.peaks,measuredEntries(),step);
 recognized=new Set(result.map(x=>x.n));
 return result;
};
mic.notePeak=function(spec,n){return recognized.has(n)?{amp:1,cents:0}:null;};
window.pianoEtoileObserveNoise=function(m){
 if(!m.ctx||!m.analyser)return;
 if(!runtimeNoise||runtimeNoise.length!==m.analyser.frequencyBinCount)runtimeNoise=new Float32Array(m.analyser.frequencyBinCount);
 const spec=new Float32Array(runtimeNoise.length);m.analyser.getFloatFrequencyData(spec);
 for(let k=0;k<spec.length;k++)runtimeNoise[k]=Math.max(runtimeNoise[k],amplitude(spec[k]));
};
async function refreshInputs(){
 if(!navigator.mediaDevices?.enumerateDevices)return message('Sélection audio non prise en charge sur ce navigateur.');
 try{
  const devices=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput');
  const select=$('calInput'),prev=select.value||window.pianoInputDeviceId||'';
  select.replaceChildren();const defaultOption=document.createElement('option');defaultOption.value='';defaultOption.textContent='Entrée automatique Android';select.appendChild(defaultOption);
  for(const [i,device] of devices.entries()){
   if(!device.deviceId)continue;
   const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||('Micro / entrée '+(i+1));select.appendChild(option);
  }
  if([...select.options].some(x=>x.value===prev))select.value=prev;
  message(devices.length+' entrée(s) disponibles. L’entrée USB nécessite une interface audio compatible.');
 }catch(e){message('Impossible de lister les entrées audio : '+e.message)}
}
$('calFind').onclick=()=>void refreshInputs();
$('calInput').onchange=()=>{
 window.pianoInputDeviceId=$('calInput').value;
 if(mic.enabled){mic.stop('Changement de source audio');void mic.start()}
};
mic.start=async function(){if(!mic.enabled&&!mic.starting)runtimeNoise=null;await oldStart();if(mic.enabled)void refreshInputs()};
if(navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>void refreshInputs());
refreshNotes();void refreshInputs();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function record(all=false){
 if(recording)return;
 recording=true;cancelled=false;window.pianoEtoileCalibrating=true;
 const ids=['calAll','calRecord','calErase','calNext','calNote','calInput','calFirst','calFind','micMode','micSensitivity'];
 for(const id of ids)$(id).disabled=true;
 $('calStop').disabled=false;
 try{
  if(!mic.enabled)await mic.start();
  if(!mic.enabled||!mic.ctx)throw Error('Autorise le microphone ou branche une entrée audio reconnue.');
  const prof=pianoProfile,generation=mic.generation;
  const notes=all?[...$('calNote').options].map(o=>Number(o.value)):[Number($('calNote').value)];
  if(!notes.length||notes.some(n=>!can(n)))throw Error('Cette touche est hors service ou hors du clavier.');
  const spec=new Float32Array(mic.analyser.frequencyBinCount),step=mic.ctx.sampleRate/mic.fftSize;
  const noise=new Float32Array(spec.length),cfg=mic.captureSettings();
  function sample(){
   if(cancelled)throw Error('Calibration arrêtée. Les touches validées restent enregistrées.');
   if(!mic.enabled||mic.generation!==generation||pianoProfile!==prof||mic.ctx.state!=='running')throw Error('Capture interrompue. Réactive le micro et réessaie.');
   mic.analyser.getFloatFrequencyData(spec);
  }
  function observeNoise(){
   for(let k=0;k<spec.length;k++)noise[k]=Math.max(noise[k],amplitude(spec[k]));
  }
  message('Ne joue rien : mesure du bruit de fond (2 secondes)…');
  await pause(450);
  for(let j=0;j<19;j++){sample();observeNoise();await pause(85);}
  runtimeNoise=noise.slice();
  let previousLevel=0;
  for(const n of notes){
   $('calNote').value=n;
   if(previousLevel>0){
    message('Relâche la touche précédente avant '+noteName(n)+'…');
    let quiet=0,deadline=performance.now()+45000;
    while(quiet<4){
     if(performance.now()>deadline)throw Error('Relâchement non détecté : la calibration s’arrête sur '+noteName(n)+'.');
     sample();const frame=extractSignature(spec,step,noise,cfg);
     if(frame.level<=Math.max(cfg.peakFloor,previousLevel*.10)){quiet++;if(!frame.peaks.length)observeNoise();}
     else quiet=0;
     await pause(85);
    }
    runtimeNoise=noise.slice();
   }
   let collector=newStrikeCollector(step,cfg.peakFloor),validated=false;
   message(noteName(n)+' · frappe 1/3 : joue une fois.');
   const deadline=performance.now()+45000;
   while(performance.now()<deadline){
    sample();const frame=extractSignature(spec,step,noise,cfg);
    const event=collector.push(frame);
    if(event?.type==='strike')message(noteName(n)+' · '+event.count+'/3 captées. Relâche et attends le signal.');
    if(event?.type==='ready')message(noteName(n)+' · frappe '+(event.count+1)+'/3 : joue maintenant.');
    if(event?.type==='done'){
     const peaks=validateStrikes(event.strikes,step);
     if(!peaks)throw Error(noteName(n)+' : les 3 sons ne concordent pas. Rien enregistré. Rejoue cette touche.');
     const duplicate=Object.entries(get()).find(([k,v])=>Number(k)!==n&&isMeasured(v)&&similarity(v.peaks,peaks,step)>.96);
     if(duplicate)throw Error('Ce son ressemble trop à '+noteName(Number(duplicate[0]))+' déjà apprise. Vérifie la touche.');
     get()[n]={method:'three-strikes',peaks};
     persist();refreshNotes();previousLevel=frame.level;validated=true;
     message(noteName(n)+' · 3/3 validées et mémorisées. Relâche.');
     await pause(500);
     break;
    }
    await pause(85);
   }
   if(!validated)throw Error(noteName(n)+' : 3 frappes séparées non validées. Cette touche reste sélectionnée.');
  }
  if(all)message('Calibration terminée : '+notes.length+' touches validées. Seuls les sons appris sont reconnus.');
  else{next();message(noteName(notes[0])+' · 3/3 frappes validées et mémorisées.');}
 }catch(e){message(e.message||String(e))}
 finally{recording=false;window.pianoEtoileCalibrating=false;mic.tracks.clear();mic.lastSeen.clear();$('calStop').disabled=true;for(const id of ids)$(id).disabled=false}
}
$('calRecord').onclick=()=>void record(false);
$('calAll').onclick=()=>void record(true);
})();
