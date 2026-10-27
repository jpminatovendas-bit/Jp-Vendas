if(typeof importScripts==='function')importScripts('sender129.js');
const labels={gallery_image:'Galeria atual — marcar esta foto',gallery_link:'Galeria atual — guardar este link/página',crest:'Salvar como brasão deste município',name:'Nome do presidente',phone_president:'Telefone do presidente',phone_chamber:'Telefone da Câmara',email_chamber:'E-mail da Câmara',email_president:'E-mail do presidente',whatsapp_chamber:'WhatsApp da Câmara (link)',whatsapp_president:'WhatsApp do presidente (link)'};
function createMenu(properties){return new Promise((resolve,reject)=>chrome.contextMenus.create(properties,()=>{const error=chrome.runtime.lastError;if(error)reject(Error(error.message));else resolve()}))}
async function installMenus(){await new Promise((resolve,reject)=>chrome.contextMenus.removeAll(()=>{const error=chrome.runtime.lastError;if(error)reject(Error(error.message));else resolve()}));await createMenu({id:'jp-root',title:'JP Minato — Salvar como',contexts:['selection','link','image','page']});for(const [id,title] of Object.entries(labels))await createMenu({id,parentId:'jp-root',title,contexts:(id==='crest'||id==='gallery_image')?['image']:id==='gallery_link'?['link','page']:id.startsWith('whatsapp_')?['link']:id.startsWith('email_')||id.startsWith('phone_')?['selection','link']:['selection']});return {ok:true}}
function refreshMenus(){return installMenus().catch(async error=>{await chrome.storage.session.set({lastResult:{message:'Falha ao criar menus: '+error.message,error:true,timestamp:Date.now()}})})}
chrome.runtime.onInstalled.addListener(refreshMenus);chrome.runtime.onStartup.addListener(refreshMenus);
function privateHost(host){if(['localhost','127.0.0.1'].includes(host))return true;const n=host.split('.').map(Number);if(n.length!==4||n.some((v,i)=>!Number.isInteger(v)||v<0||v>255||String(v)!==host.split('.')[i]))return false;return n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168)||(n[0]===100&&n[1]>=64&&n[1]<=127)}
async function approvedBase(value){const base=loopback(value),u=new URL(base);if(['localhost','127.0.0.1'].includes(u.hostname))return base;const saved=await chrome.storage.local.get('remoteBase');if(saved.remoteBase!==base||!await chrome.permissions.contains({origins:[base+'/*']}))throw Error('Autorize o endereço da VPN no ícone da extensão.');return base}
function loopback(value){const u=new URL(value);if(u.protocol!=='http:'||!privateHost(u.hostname)||u.username||u.password)throw Error('Endereço do MVP inválido.');return u.origin}
async function request(base,path,body,token){const control=new AbortController(),timeout=setTimeout(()=>control.abort(),path==='/api/crest-save'?60000:15000);try{const r=await fetch((await approvedBase(base))+path,{method:'POST',headers:{'Content-Type':'application/json','X-JP-Extension':chrome.runtime.id,...(token?{'X-Capture-Token':token}:{})},body:JSON.stringify(body),signal:control.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Falha ao salvar.');return data}catch(e){if(e instanceof TypeError||e.name==='AbortError')throw Error('Não foi possível conectar ao MVP. Confira se o servidor do escritório e a VPN estão ligados e inicie a captura novamente.');throw e}finally{clearTimeout(timeout)}}
async function captureResult(tab,message,error=false){const context=(await chrome.storage.session.get('binding:'+tab.id))['binding:'+tab.id];if(context?.code)message+=' · '+context.code+' · '+(context.scope==='crest'?'Brasão':'Contatos');await chrome.storage.session.set({lastResult:{message,error,timestamp:Date.now()}});try{await chrome.action.setBadgeText({tabId:tab.id,text:error?'!':'OK'});await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:error?'#b62e24':'#18794e'});await chrome.action.setTitle({tabId:tab.id,title:message})}catch{}try{await chrome.notifications.create({type:'basic',iconUrl:'icon.png',title:error?'JP Minato — não foi salvo':'JP Minato — salvo',message})}catch{}if(error)await chrome.windows.create({url:chrome.runtime.getURL('instructions.html')+'?error=1',type:'popup',width:520,height:480})}
async function captureSelection(info,tab){if(!labels[info.menuItemId])return;try{if(navigationTasks.has(tab.id))await navigationTasks.get(tab.id);let binding=(await chrome.storage.session.get('binding:'+tab.id))['binding:'+tab.id];if(!binding)throw Error('Esta aba não está vinculada. No MVP, escolha o município e clique em Capturar contatos no site da Câmara.');if(info.frameUrl&&info.frameUrl!==info.pageUrl)throw Error('Capture na página principal vinculada, sem quadro externo.');if(cleanPage(info.pageUrl||tab.url)!==cleanPage(binding.page||binding.url))throw Error('A navegação ainda não foi autorizada. Aguarde ou reabra a captura pelo MVP.');if(info.menuItemId==='gallery_image'||info.menuItemId==='gallery_link'){const kind=info.menuItemId==='gallery_image'?'image':'link',result=await request(binding.base,'/api/gallery-capture',{kind,value:kind==='image'?info.srcUrl:(info.linkUrl||info.pageUrl||tab.url),url:info.pageUrl||tab.url,tab_id:tab.id,title:tab.title||''},binding.token);if(result.ok!==true)throw Error('O MVP não confirmou a referência da galeria.');await captureResult(tab,result.municipality+' / '+result.uf+' · Referência da galeria salva. Volte ao mapa e atualize as referências.');return;}if(info.menuItemId==='crest'){const result=await request(binding.base,'/api/crest-save',{src_url:info.srcUrl,url:info.pageUrl||tab.url||'',tab_id:tab.id},binding.token);if(result.ok!==true)throw Error('O MVP não confirmou o brasão.');await captureResult(tab,result.municipality+' / '+result.uf+' · Brasão salvo');return;}const original=info.menuItemId.startsWith('whatsapp_')?(info.linkUrl||''):((info.menuItemId.startsWith('email_')&&/^mailto:/i.test(info.linkUrl||''))||(info.menuItemId.startsWith('phone_')&&/^tel:/i.test(info.linkUrl||'')))?info.linkUrl:(info.selectionText||''),value=info.menuItemId==='name'?original.replace(/\s+/g,' ').trim():original.trim();const body={kind:info.menuItemId,value,selected_text:original,url:info.frameUrl||info.pageUrl||tab.url||'',direct:true,tab_id:tab.id};if(info.menuItemId.startsWith('whatsapp_')){const preview=await request(binding.base,'/api/capture-preview',body,binding.token);if(preview.requires_review){const id=crypto.randomUUID();await chrome.storage.session.set({['draft:'+id]:{kind:body.kind,value,url:body.url,binding,tabId:tab.id}});await chrome.windows.create({url:chrome.runtime.getURL('whatsapp.html')+'?id='+id,type:'popup',width:600,height:710});return}body.expected_link=preview.previous_link}const result=await request(binding.base,'/api/capture-save',body,binding.token);if(result.ok!==true)throw Error('O MVP não confirmou a gravação.');await captureResult(tab,result.municipality+' / '+result.uf+' · '+labels[info.menuItemId]+': '+result.value)}catch(e){await captureResult(tab,e.message,true)}}

chrome.contextMenus.onClicked.addListener((info,tab)=>captureSelection(info,tab).catch(console.error));
chrome.tabs.onRemoved.addListener(async id=>{const binding=(await chrome.storage.session.get('binding:'+id))['binding:'+id];await chrome.storage.session.remove('binding:'+id);if(binding)try{await request(binding.base,'/api/capture-navigate',{tab_id:id,from_url:binding.page||binding.url,url:binding.page||binding.url,transition:'typed'},binding.token)}catch{}});
async function handle(message,sender){
 if(message.action==='officeConnect')return officeConnect129(message,sender);
 if(message.action==='officeTick'){if(sender.url!==chrome.runtime.getURL('sender.html'))throw Error('Abra o painel da estação pela extensão.');return officeTick129()}
 if(message.action==='officePause'){if(sender.url!==chrome.runtime.getURL('sender.html'))throw Error('Origem inválida.');const b=(await chrome.storage.local.get('officeBinding129')).officeBinding129;if(!b)return {message:'Estação não conectada.'};return request(b.base,'/api/wa-office-worker',{action:'pause'},b.token)}
 if(message.action==='officeForget'){if(sender.url!==chrome.runtime.getURL('sender.html'))throw Error('Origem inválida.');await chrome.storage.local.remove('officeBinding129');return {message:'Estação desconectada neste Chrome.'}}
 if(message.action==='verifierTick'){if(sender.url!==chrome.runtime.getURL('verifier.html'))throw Error('Origem de verificação inválida.');return verifierTick()}
 if(message.action==='refreshMenus'){if(!sender.url?.startsWith(chrome.runtime.getURL('instructions.html')))throw Error('Solicitação inválida.');return installMenus()}
 if(message.action==='connect'){
  const u=new URL(sender.url);const base=loopback(sender.url);if(!sender.tab||u.pathname!=='/capturar'||message.ticket!==u.searchParams.get('ticket'))throw Error('Abra a captura pelo cadastro do município no MVP.');
  const binding=await request(base,'/api/capture-connect',{ticket:message.ticket,tab_id:sender.tab.id});if(binding.scope==='whatsapp_verifier'){await chrome.storage.session.set({verifierBinding:{...binding,base,tabId:sender.tab.id}});await chrome.tabs.update(sender.tab.id,{url:binding.url});await chrome.windows.create({url:chrome.runtime.getURL('verifier.html'),type:'popup',width:760,height:700});return {ok:true};}await chrome.storage.session.set({['binding:'+sender.tab.id]:{...binding,base,page:binding.url,initial:true}});await chrome.action.setBadgeText({tabId:sender.tab.id,text:'JP'});await chrome.action.setBadgeBackgroundColor({tabId:sender.tab.id,color:'#146e94'});await chrome.action.setTitle({tabId:sender.tab.id,title:'JP Minato · '+binding.municipality+' / '+binding.uf+' · '+binding.code+' · '+(binding.scope==='crest'?'Brasão':'Contatos')});await chrome.tabs.update(sender.tab.id,{url:binding.url});return {ok:true};
 }
 const page=new URL(sender.url||'https://invalid.example').pathname;if(![new URL(chrome.runtime.getURL('review.html')).pathname,new URL(chrome.runtime.getURL('whatsapp.html')).pathname].includes(page)||new URL(sender.url).origin!==new URL(chrome.runtime.getURL('review.html')).origin)throw Error('Solicitação inválida.');
 const draft=(await chrome.storage.session.get('draft:'+message.id))['draft:'+message.id];if(!draft)throw Error('Captura expirada. Selecione o texto novamente.');
 if(message.action==='draft')return {kind:draft.kind,value:draft.value,url:draft.url,error:draft.error,municipality:draft.binding?.municipality,uf:draft.binding?.uf,base:draft.binding?.base};
 if(draft.error)throw Error(draft.error);
 if(!['preview','save'].includes(message.action))throw Error('Ação desconhecida.');
 if(!labels[message.body.kind])throw Error('Campo inválido.');
 if(navigationTasks.has(draft.tabId))await navigationTasks.get(draft.tabId);const stillBound=(await chrome.storage.session.get('binding:'+draft.tabId))['binding:'+draft.tabId];if(!stillBound||stillBound.token!==draft.binding.token||cleanPage(stillBound.page||stillBound.url)!==cleanPage(draft.url))throw Error('A aba saiu da rota. Capture novamente pelo município no MVP.');const body={...message.body,url:draft.url,selected_text:draft.value,tab_id:draft.tabId};const result=await request(draft.binding.base,'/api/capture-'+message.action,body,draft.binding.token);if(message.action==='save'){await chrome.storage.session.remove('draft:'+message.id);if(draft.tabId!==undefined)await captureResult({id:draft.tabId},result.municipality+' / '+result.uf+' · '+labels[draft.kind]+': '+result.value)}return result;
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(sender.id!==chrome.runtime.id)return;handle(message,sender).then(data=>reply({data})).catch(e=>reply({error:e.message}));return true});

function cleanPage(value){const u=new URL(value);u.hash='';return u.href}
const navigationTasks=new Map();
function serializeNavigation(id,fn){const task=(navigationTasks.get(id)||Promise.resolve()).catch(()=>{}).then(fn);navigationTasks.set(id,task);task.catch(()=>{}).finally(()=>{if(navigationTasks.get(id)===task)navigationTasks.delete(id)});return task}
async function revokeBinding(id,binding,message){await chrome.storage.session.remove('binding:'+id);try{await request(binding.base,'/api/capture-navigate',{tab_id:id,from_url:binding.page||binding.url,url:binding.page||binding.url,transition:'typed'},binding.token)}catch{}await chrome.action.setBadgeText({tabId:id,text:'!'});await chrome.action.setTitle({tabId:id,title:message})}
chrome.webNavigation?.onCreatedNavigationTarget.addListener(details=>serializeNavigation(details.tabId,async()=>{
 if(details.sourceFrameId!==undefined&&details.sourceFrameId!==0)return;if(navigationTasks.has(details.sourceTabId))await navigationTasks.get(details.sourceTabId).catch(()=>{});
 const parent=(await chrome.storage.session.get('binding:'+details.sourceTabId))['binding:'+details.sourceTabId];if(!parent)return;
 try{await request(parent.base,'/api/capture-navigate',{tab_id:details.sourceTabId,child_tab_id:details.tabId,from_url:parent.page||parent.url,url:details.url,transition:'link'},parent.token);await chrome.storage.session.set({['binding:'+details.tabId]:{...parent,page:details.url,initial:true}})}catch{}
}));
function committedNavigation(details){if(details.frameId!==0)return;serializeNavigation(details.tabId,async()=>{
 const binding=(await chrome.storage.session.get('binding:'+details.tabId))['binding:'+details.tabId];if(!binding)return;
 try{
  if(binding.initial&&cleanPage(details.url)===cleanPage(binding.page||binding.url)){binding.initial=false;await chrome.storage.session.set({['binding:'+details.tabId]:binding});return}
  if((details.transitionQualifiers||[]).includes('forward_back'))return revokeBinding(details.tabId,binding,'Histórico de navegação: reabra a captura pelo município no MVP.');let transition=details.transitionType;
  if((details.transitionQualifiers||[]).some(x=>['server_redirect','client_redirect'].includes(x))&&transition!=='typed')transition='redirect';
  if(!['link','form_submit','reload','redirect'].includes(transition))return revokeBinding(details.tabId,binding,'Captura encerrada: endereço fora do percurso. Reabra pelo município no MVP.');
  await request(binding.base,'/api/capture-navigate',{tab_id:details.tabId,from_url:binding.page||binding.url,url:details.url,transition},binding.token);
  binding.page=details.url;binding.initial=false;await chrome.storage.session.set({['binding:'+details.tabId]:binding});
 }catch(e){await revokeBinding(details.tabId,binding,e.message)}
})}
chrome.webNavigation?.onCommitted.addListener(committedNavigation);
chrome.webNavigation?.onHistoryStateUpdated?.addListener(details=>committedNavigation({...details,transitionType:details.transitionType||'link'}));

let verifierBusy=false;
async function verifierTick(){
 if(verifierBusy)return {message:'Aguardando consulta em andamento.'};verifierBusy=true;let task=null,binding=null,account='';
 try{
  binding=(await chrome.storage.session.get('verifierBinding')).verifierBinding;if(!binding)throw Error('No MVP, abra o verificador neste perfil do Chrome.');
  const tab=await chrome.tabs.get(binding.tabId);if(new URL(tab.url).origin!=='https://web.whatsapp.com')throw Error('A aba vinculada não está no WhatsApp Web. Reabra o verificador pelo MVP.');
  const [{result:loaded}]=await chrome.scripting.executeScript({target:{tabId:binding.tabId},world:'MAIN',func:()=>!!window.WPP});
  if(!loaded)await chrome.scripting.executeScript({target:{tabId:binding.tabId},world:'MAIN',files:['vendor/wppconnect-wa.js']});
  const [{result:identity}]=await chrome.scripting.executeScript({target:{tabId:binding.tabId},world:'MAIN',func:()=>{
   const w=window.WPP;if(!w?.isReady||!w.conn.isAuthenticated()||!w.conn.isOnline())return null;
   const id=w.conn.getMyUserId();return id?.user||id?.toString().split('@')[0].split(':')[0]||null;
  }});
  account=identity;if(!account)throw Error('WhatsApp desconectado ou biblioteca ainda carregando. Conecte o número exclusivo e clique em iniciar novamente.');
  const next=await request(binding.base,'/api/verifier-next',{account},binding.token);task=next.task;if(!task)return {message:'Conta conectada: '+account+'\n'+next.message};
  const [{result:result}]=await chrome.scripting.executeScript({target:{tabId:binding.tabId},world:'MAIN',args:[task.number,binding.expected_number],func:async(number,expected)=>{
   const w=window.WPP,account=()=>{const id=w.conn.getMyUserId();return String(id?.user||id?.toString().split('@')[0].split(':')[0]||'')};
   if(!w?.isReady||!w.conn.isAuthenticated()||!w.conn.isOnline()||account()!==expected)throw Error('Conta exclusiva não está conectada.');
   let timer;try{
    const value=await Promise.race([w.contact.queryWidExists(number+'@c.us'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Consulta excedeu o tempo.')),30000)})]);
    const after=account();if(!w.conn.isAuthenticated()||!w.conn.isOnline()||after!==expected)return {state:'inconclusive',account_after:after};
    if(value===null)return {state:'absent',evidence:'explicit_null',account_after:after};
    const wid=value?.wid,found=String(wid?.user||wid?.toString().split('@')[0]||'');
    if(found===number)return {state:'confirmed',evidence:'matching_wid',account_after:after};
    return {state:'inconclusive',account_after:after};
   }finally{clearTimeout(timer)}
  }});
  await request(binding.base,'/api/verifier-result',{...task,...result,account},binding.token);
  return {message:'Conta conectada: '+account+'\n'+task.number+' · '+result.state,stop:result.state==='inconclusive'};
 }catch(error){
  if(task&&binding&&account)try{await request(binding.base,'/api/verifier-result',{...task,account,account_after:account,state:'inconclusive'},binding.token)}catch{}
  throw error;
 }finally{verifierBusy=false}
}
