/* Estação local: uma aba WhatsApp reutilizada e uma saudação por comando explícito. */
let officeBusy129=false;
async function officeTab129(binding,create=false){
 const tabs=await chrome.tabs.query({url:'https://web.whatsapp.com/*'});let tab=tabs.find(t=>t.id===binding.waTab)||tabs[0];
 if(!tab&&create)tab=await chrome.tabs.create({url:'https://web.whatsapp.com/',active:false});
 if(!tab)throw Error('Abra e conecte o WhatsApp Web no Chrome do escritório.');
 if(binding.waTab!==tab.id){binding.waTab=tab.id;await chrome.storage.local.set({officeBinding129:binding})}return tab;
}
async function officeConnect129(message,sender){
 const u=new URL(sender.url||'');if(!sender.tab||!['127.0.0.1','localhost'].includes(u.hostname)||u.protocol!=='http:'||u.pathname!=='/whatsapp-escritorio'||u.searchParams.get('ticket')!==message.ticket)throw Error('Conecte pelo MVP no computador do escritório.');
 const base=loopback(sender.url),binding={...await request(base,'/api/wa-office-connect',{ticket:message.ticket}),base};
 const previous=(await chrome.storage.local.get('officeBinding129')).officeBinding129;if(previous?.base===base)binding.waTab=previous.waTab;
 await chrome.storage.local.set({officeBinding129:binding});await officeTab129(binding,true);
 const panels=await chrome.tabs.query({url:chrome.runtime.getURL('sender.html')});
 if(panels.length){await chrome.tabs.update(panels[0].id,{active:true});await chrome.tabs.remove(sender.tab.id)}else await chrome.tabs.update(sender.tab.id,{url:chrome.runtime.getURL('sender.html')});
 return {ok:true};
}
async function officeLoad129(tab){
 const [{result:loaded}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>({library:!!window.WPP,version:String(window.WPP?.version||''),runtime:window.__jpMinatoOffice132?.build==='1.17.2'})});
 if(loaded.version&&/^\d+\.\d+\.\d+/.test(loaded.version)&&loaded.version!=='4.7.1')throw Error('A aba está usando WA-JS '+loaded.version+'. Feche a aba do WhatsApp Web e abra novamente após recarregar a extensão 1.17.2.');
 if(!loaded.library)await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['vendor/wppconnect-wa.js']});
 if(!loaded.runtime)await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['office-runtime132.js']});
}
async function officeIdentity129(tab){
 const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>window.__jpMinatoOffice132.identity()});return result;
}
async function officeCheck129(number,expected){return window.__jpMinatoOffice132.check(number,expected)}
async function officeSend129(number,message,expected){return window.__jpMinatoOffice132.send(number,message,expected)}
async function officeTick129(){
 if(officeBusy129)return {message:'Solicitação em andamento.'};officeBusy129=true;
 try{
  const binding=(await chrome.storage.local.get('officeBinding129')).officeBinding129;if(!binding)throw Error('Conecte esta estação no MVP do escritório.');
  const call=body=>request(binding.base,'/api/wa-office-worker',body,binding.token);
  const journalKey='officeJournal129:'+binding.station;let journal=(await chrome.storage.local.get(journalKey))[journalKey];
  const save=async()=>chrome.storage.local.set({[journalKey]:journal});
  // Recuperação nunca volta a chamar sendTextMessage para uma tentativa já iniciada.
  if(journal){
   if(journal.stage==='result'){
    const result=await call(journal.report);await chrome.storage.local.remove(journalKey);return {message:'Resultado recuperado: '+result.task.state};
   }
   await call({action:'abandon',id:journal.task.id,claim:journal.task.claim});await chrome.storage.local.remove(journalKey);return {message:'Tentativa interrompida preservada sem repetição. Confira no MVP.'};
  }
  let tab,identity;
  try{tab=await officeTab129(binding);await officeLoad129(tab);identity=await officeIdentity129(tab)}catch(e){identity={account:'',connected:false,reason:'extension_error',detail:String(e.message||e).slice(0,300)}}
  const next=await call({action:'poll',...identity});
  if(!identity.connected||identity.account!==binding.expected_number)return {message:identity.connected?'Conta diferente. Conectada: '+identity.account+' · Configurada no MVP: '+binding.expected_number:(identity.detail||'Não foi possível identificar a conexão.')+' · Configurada no MVP: '+binding.expected_number};
  if(!next.enabled)return {message:'Estação conectada: '+identity.account+'. Envio desativado nas configurações.'};
  const task=next.task;if(!task)return {message:'Conectado: '+identity.account+' · Aguardando um clique em Enviar saudação no MVP.'};
  journal={stage:'checking',task};await save();
  const [{result:checked}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:officeCheck129,args:[task.recipient,binding.expected_number]});
  const check=await call({action:'check',id:task.id,claim:task.claim,...identity,...checked});
  if(check.task.state!=='ready'){await chrome.storage.local.remove(journalKey);return {message:task.municipality+' · '+check.task.state+' · '+(check.task.error||'')};}
  journal.stage='authorizing';await save();
  const identityBefore=await officeIdentity129(tab);const permit=await call({action:'authorize',id:task.id,claim:task.claim,...identityBefore});
  if(!permit.send){await chrome.storage.local.remove(journalKey);return {message:'Envio não iniciado: '+permit.task.state};}
  journal.stage='sending';await save();
  const [{result:sent}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:officeSend129,args:[permit.task.delivery_number||task.recipient,task.message,binding.expected_number]});
  journal={...journal,stage:'result',report:{action:'result',id:task.id,claim:task.claim,permit:permit.permit,...identityBefore,...sent}};await save();
  const result=await call(journal.report);await chrome.storage.local.remove(journalKey);
  return {message:task.municipality+' · '+task.recipient+' · '+result.task.state};
 }finally{officeBusy129=false}
}
