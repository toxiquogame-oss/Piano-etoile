(function(){
'use strict';
// Piano étoilé V18 : calibration spectrale locale, 66 touches réglables, sélection de la source audio.
// La reconnaissance polyphonique existante reste en place. Aucune donnée sonore n'est envoyée à un serveur.
const key='piano-etoile-profiles-v18';
let trained={};try{trained=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(e){}
const $=id=>document.getElementById(id), hz=n=>440*Math.pow(2,(n-69)/12);
const get=()=>trained[pianoProfile]||(trained[pianoProfile]={});
const persist=()=>{try{localStorage.setItem(key,JSON.stringify(trained))}catch(e){message('Stockage local indisponible.')}};
const wrap=document.createElement('section');wrap.className='calibration-panel';
wrap.innerHTML='<style>.calibration-panel{border:1px solid #52516b;background:#1b1927;border-radius:14px;padding:13px;margin:0 0 12px;font-size:12px;color:#dcd4e6}.calibration-panel h2{font-size:15px;margin:0 0 6px}.calibration-panel p{line-height:1.5;margin:7px 0}.calrow{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:9px 0}.calibration-panel button,.calibration-panel select{padding:7px;min-height:36px;font-size:12px;max-width:100%}#calStatus{color:#d8c4ff}#calCount{color:#94e7e1;font-weight:bold}</style>'+
'<h2>Apprendre les sons de ton piano · Notes et accords</h2>'+
'<p>Enregistre le timbre de tes vraies touches, en <b>mode piano classique</b>. Joue une seule note à la fois pendant la calibration ; ensuite, la détection cherchera leurs associations dans les accords.</p>'+
'<div class="calrow"><label for="calInput">Source audio :</label><select id="calInput"><option value="">Entrée automatique Android</option></select><button id="calFind" type="button">Actualiser les entrées</button></div>'+
'<p><b>Mode casque :</b> brancher ton casque sur le piano ne transmet aucun son au téléphone. Pour jouer silencieusement et analyser les notes, il faut relier une sortie audio du piano à une <b>interface audio avec entrée ligne compatible Android USB-C</b>, éventuellement via un répartiteur pour garder le casque. Démarre avec un volume de sortie très bas. Seules les entrées réellement détectées par Chrome apparaissent ci-dessus.</p>'+
'<div class="calrow" id="calStartRow" hidden><label for="calFirst">Première note du piano 66 touches :</label><select id="calFirst"></select></div>'+
'<div class="calrow"><label for="calNote">Note à apprendre :</label><select id="calNote"></select><button id="calRecord" type="button" class="primary">Enregistrer cette note</button><button id="calNext" type="button">Suivante</button><button id="calErase" type="button">Effacer ce profil</button></div>'+
'<div class="calrow"><span id="calCount">0 note enregistrée</span><span id="calStatus" role="status"></span></div>'+
'<p>Les notes sont identifiées par leur fréquence et leurs harmoniques ; les combinaisons de notes sont analysées ensemble. Les accords denses, les octaves superposées et les basses peuvent encore être confondus.</p>';
document.querySelector('.mic-panel').insertAdjacentElement('afterend',wrap);
const message=s=>{$('calStatus').textContent=s};
const can=n=>n>=FIRST&&n<=PIANO_PROFILES[pianoProfile].workingLast;
const oldChoose=choosePianoProfile,oldPrepare=mic.prepareTemplates.bind(mic),oldStart=mic.start.bind(mic);
let recording=false;
PIANO_PROFILES.current66={first:36,last:101,workingLast:101,label:'Piano actuel · 66 touches (début réglable)',info:'66 touches, première note réglable dans le panneau sonore.'};
for(const [where,label] of [['pianoProfile','Piano actuel · 66 touches'],['profileMini','66 touches']]){
 const opt=document.createElement('option');opt.value='current66';opt.textContent=label;$(where).appendChild(opt);
}
let startNote=36;try{startNote=Number(localStorage.getItem('piano-etoile-66-start'))||36}catch(e){}
if(startNote<21||startNote>43)startNote=36;
for(let n=21;n<=43;n++){const opt=document.createElement('option');opt.value=n;opt.textContent=noteName(n)+' · '+hz(n).toFixed(1)+' Hz';$('calFirst').appendChild(opt)}
$('calFirst').value=startNote;
function setStart(n){const p=PIANO_PROFILES.current66;p.first=n;p.last=n+65;p.workingLast=p.last}
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
 $('calStartRow').hidden=pianoProfile!=='current66';
}
choosePianoProfile=function(id){
 if(recording){message('Attends la fin de la capture.');$('pianoProfile').value=pianoProfile;$('profileMini').value=pianoProfile;return;}
 oldChoose(id);refreshNotes();
};
$('calFirst').onchange=()=>{
 if(recording)return;startNote=Number($('calFirst').value);setStart(startNote);
 try{localStorage.setItem('piano-etoile-66-start',String(startNote))}catch(e){}
 if(pianoProfile==='current66')choosePianoProfile('current66');
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
 if(!mic.enabled)await mic.start();
 if(!mic.enabled||!mic.ctx){message('Autorise le microphone ou branche une entrée audio reconnue.');return;}
 const n=Number($('calNote').value),prof=pianoProfile;
 if(!can(n))return message('Cette touche est hors service ou hors du clavier.');
 recording=true;$('calRecord').disabled=true;$('calErase').disabled=true;
 const sums=new Float64Array(7),spec=new Float32Array(mic.analyser.frequencyBinCount),step=mic.ctx.sampleRate/mic.fftSize;
 let count=0;
 try{
  message('Joue '+noteName(n)+' maintenant, seul, et garde la touche appuyée 2 secondes.');
  await pause(250);
  for(let i=0;i<24;i++){
   if(!mic.enabled||pianoProfile!==prof)throw Error('Capture interrompue.');
   mic.analyser.getFloatTimeDomainData(mic.samples);
   let e=0;for(let k=0;k<mic.samples.length;k+=32)e+=mic.samples[k]*mic.samples[k];
   const rms=Math.sqrt(e/(mic.samples.length/32));
   if(rms>.0022){
    mic.analyser.getFloatFrequencyData(spec);let sum=0;
    for(let h=1;h<=7;h++){
     const at=hz(n)*h/step;let peak=0;
     for(let b=Math.max(2,Math.round(at)-3);b<=Math.min(spec.length-2,Math.round(at)+3);b++){
      peak=Math.max(peak,Math.pow(10,Math.max(-110,spec[b])/20));
     }
     sums[h-1]+=peak;sum+=peak;
    }
    if(sum>.00005)count++;
   }
   await pause(85);
  }
  if(count<5)throw Error('Son trop faible ou absent. Vérifie le micro/câble et réessaie.');
  const ratios=Array.from(sums,x=>x/count),max=Math.max(...ratios);
  if(max<.00001)throw Error('Aucun son exploitable capturé.');
  get()[n]=ratios.map(x=>Math.max(.025,Math.min(1,Number((x/max).toFixed(3)))));
  persist();if(mic.enabled&&mic.ctx)mic.prepareTemplates();
  refreshNotes();next();message(noteName(n)+' mémorisé : '+count+' mesures. Passe à la touche suivante.');
 }catch(e){message(e.message||String(e))}
 finally{recording=false;$('calRecord').disabled=false;$('calErase').disabled=false}
}
$('calRecord').onclick=()=>void record();
})();