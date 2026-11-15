(function(){
'use strict';
// Piano étoilé V19 : calibration spectrale locale, Schubert Etude 61 touches, sélection de la source audio.
// La reconnaissance polyphonique existante reste en place. Aucune donnée sonore n'est envoyée à un serveur.
// Anciens profils conservés dans le stockage, mais captures non vérifiées écartées.
const key='piano-etoile-profiles-v29-verified';
let trained={};try{trained=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(e){}
const $=id=>document.getElementById(id), hz=n=>440*Math.pow(2,(n-69)/12);
const get=()=>trained[pianoProfile]||(trained[pianoProfile]={});
// Les gabarits appris séparément aident à distinguer des octaves réellement jouées
// des harmoniques d'une seule touche. Jamais besoin d'enregistrer les combinaisons.
window.pianoEtoileIsPairTrained=(a,b)=>Boolean(trained[pianoProfile]?.[a]&&trained[pianoProfile]?.[b]);
window.pianoEtoileCalibratedCount=()=>Object.keys(trained[pianoProfile]||{}).length;
const persist=()=>{try{localStorage.setItem(key,JSON.stringify(trained))}catch(e){message('Stockage local indisponible.')}};
const wrap=document.createElement('section');wrap.className='calibration-panel';
wrap.innerHTML='<style>.calibration-panel{border:1px solid #52516b;background:#1b1927;border-radius:14px;padding:13px;margin:0 0 12px;font-size:12px;color:#dcd4e6}.calibration-panel h2{font-size:15px;margin:0 0 6px}.calibration-panel p{line-height:1.5;margin:7px 0}.calrow[hidden]{display:none!important}.calrow{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:9px 0}.calibration-panel button,.calibration-panel select{padding:7px;min-height:36px;font-size:12px;max-width:100%}#calStatus{color:#d8c4ff}#calCount{color:#94e7e1;font-weight:bold}</style>'+
'<h2>Apprendre les sons de ton piano · Notes et accords</h2>'+
'<p>Enregistre uniquement les <b>notes jouables séparément</b> en son <b>piano classique</b> : 61 pour le Schubert et 61 pour le RockJam. Ensuite, le programme tentera de reconnaître les accords sans enregistrer toutes les combinaisons.</p>'+
'<div class="calrow"><label for="calInput">Source audio :</label><select id="calInput"><option value="">Entrée automatique Android</option></select><button id="calFind" type="button">Actualiser les entrées</button></div>'+
'<p><b>Casque branché au piano :</b> tu peux approcher une oreillette du microphone du téléphone, à condition qu’un peu de son s’en échappe. Le micro ne peut pas entendre un casque complètement silencieux à l’extérieur. Pour une écoute plus précise, une interface avec entrée ligne USB-C compatible Android reste une autre possibilité.</p>'+
'<div class="calrow" id="calStartRow" hidden><label for="calFirst">Première note du Schubert 61 touches :</label><select id="calFirst"></select></div>'+
'<div class="calrow"><label for="calNote">Note à apprendre :</label><select id="calNote"></select><button id="calRecord" type="button" class="primary">Enregistrer cette note</button><button id="calNext" type="button">Suivante</button><button id="calErase" type="button">Effacer ce profil</button></div>'+
'<div class="calrow"><span id="calCount">0 note enregistrée</span><span id="calStatus" role="status"></span></div>'+
'<p>Nouvelle calibration : laisse le piano silencieux pendant la mesure du bruit, puis joue uniquement la note demandée après le signal. En l’absence de note valide, la sélection ne change pas.</p><p>Les notes sont identifiées par leur fréquence et leurs harmoniques ; les combinaisons de notes sont analysées ensemble. Les accords denses, les octaves superposées et les basses peuvent encore être confondus.</p>';
document.querySelector('.mic-panel').insertAdjacentElement('afterend',wrap);
const message=s=>{$('calStatus').textContent=s};
const can=n=>n>=FIRST&&n<=PIANO_PROFILES[pianoProfile].workingLast;
const oldChoose=choosePianoProfile,oldPrepare=mic.prepareTemplates.bind(mic),oldStart=mic.start.bind(mic);
let recording=false;
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
 let total=0,count=0;
 for(let n=FIRST;n<=LAST;n++){
  if(!can(n))continue;total++;if(map[n])count++;
  const opt=document.createElement('option');opt.value=n;opt.textContent=(map[n]?'✓ ':'')+noteName(n)+' ('+hz(n).toFixed(1)+' Hz)';el.appendChild(opt);
 }
 if(can(prev))el.value=prev;
 $('calCount').textContent=count+' / '+total+' touches apprises · enregistrées localement';
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
 const n=list.filter(x=>x>current).concat(list.filter(x=>x<=current)).find(x=>!map[x]);
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
  const hs=learned[t.note];if(!Array.isArray(hs)||hs.length<7)continue;
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
mic.start=async function(){await oldStart();if(mic.enabled)void refreshInputs()};
if(navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>void refreshInputs());
refreshNotes();void refreshInputs();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function record(){
 if(recording)return;
 recording=true;window.pianoEtoileCalibrating=true;
 const ids=['calRecord','calErase','calNext','calNote','calInput','calFirst','calFind'];
 for(const id of ids)$(id).disabled=true;
 try{
  if(!mic.enabled)await mic.start();
  if(!mic.enabled||!mic.ctx)throw Error('Autorise le microphone ou branche une entrée audio reconnue.');
  const n=Number($('calNote').value),prof=pianoProfile,generation=mic.generation;
  if(!can(n))throw Error('Cette touche est hors service ou hors du clavier.');
  const spec=new Float32Array(mic.analyser.frequencyBinCount),step=mic.ctx.sampleRate/mic.fftSize;
  const sums=new Float64Array(7);
  function sample(){
   if(!mic.enabled||mic.generation!==generation||pianoProfile!==prof||mic.ctx.state!=='running')throw Error('Capture interrompue. Réactive le micro et réessaie.');
   mic.analyser.getFloatTimeDomainData(mic.samples);mic.analyser.getFloatFrequencyData(spec);return mic.sampleRms();
  }
  message('Ne joue rien : mesure du bruit de fond…');
  await pause(450);
  let noise=0,noisePeak=0;
  for(let j=0;j<7;j++){noise=Math.max(noise,sample());noisePeak=Math.max(noisePeak,mic.notePeak(spec,n)?.amp||0);await pause(85);}
  const gate=Math.max(.00030,noise*2.2),signalPeak=Math.max(.000075,noisePeak*3);
  message('Joue '+noteName(n)+' maintenant et garde la touche appuyée environ 2 secondes.');
  let count=0,consecutive=0;
  const deadline=performance.now()+30000;
  while(performance.now()<deadline){
   const rms=sample(),peak=mic.notePeak(spec,n);
   if(rms>gate&&peak&&peak.amp>=signalPeak){
    consecutive++;count++;
    for(let h=1;h<=7;h++){
     const at=hz(n)*h/step;let amp=0;
     for(let b=Math.max(2,Math.round(at)-2);b<=Math.min(spec.length-2,Math.round(at)+2);b++)amp=Math.max(amp,Math.pow(10,Math.max(-110,spec[b])/20));
     sums[h-1]+=amp;
    }
    if(consecutive>=8&&count>=8){
     const ratios=Array.from(sums,x=>x/count),max=Math.max(...ratios);
     if(max<.000075)throw Error('Son trop faible : rapproche le micro et réessaie.');
     get()[n]=ratios.map(x=>Math.max(.025,Math.min(1,Number((x/max).toFixed(3)))));
     persist();mic.prepareTemplates();refreshNotes();next();
     message(noteName(n)+' vérifié et mémorisé. Relâche la touche avant la prochaine capture.');return;
    }
   }else{
    consecutive=0;count=0;sums.fill(0);
   }
   await pause(85);
  }
  message('Aucune note '+noteName(n)+' valide détectée. La touche reste sélectionnée. Réessaie en rapprochant le micro ou en augmentant le volume.');
 }catch(e){message(e.message||String(e))}
 finally{recording=false;window.pianoEtoileCalibrating=false;for(const id of ids)$(id).disabled=false}
}
$('calRecord').onclick=()=>void record();
})();