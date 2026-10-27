/* Revisão de contatos e fechamento com gravação confirmada. */
let contactBaseline=null,contactClosing=false;
const contactTasks=new Map();
const localContactIds={municipalDDD:'ddd',localSector:'sector',localCommercial:'commercial',lastContact:'last_contact',localNotes:'notes',checked:'checked'};
function contactLocalValues(){const values={};for(const id of Object.keys(localContactIds)){const el=$(id);if(el)values[id]=el.type==='checkbox'?el.checked:el.value}return values}
const renderContactsBefore119=renderContacts;
renderContacts=function(){renderContactsBefore119();contactBaseline={key:current.key,local:contactLocalValues()};syncContactHeader()};
function syncContactHeader(){const showing=!$('contacts').classList.contains('hidden');for(const id of ['saveContactButton','reviewContactButton'])$(id).classList.toggle('hidden',!showing);for(const id of ['saveContactButton','cancelContactButton','reviewContactButton'])$(id).disabled=contactClosing||contactSaves.has(current?.key);$('closeContactButton').disabled=contactClosing;contactSaveButton();if(contactClosing)$('saveContactButton').disabled=true}
const tabBefore119=tab;
tab=async function(name){await tabBefore119(name);syncContactHeader()};
function contactDraft(){if(!current||contactBaseline?.key!==current.key)return {fields:{},local:{},values:{}};const fields={},local={},values=contactLocalValues();for(const el of $('contacts').querySelectorAll('[data-field]'))if(String(current.fields[el.dataset.field]??'')!==el.value)fields[el.dataset.field]=el.value;for(const [id,value] of Object.entries(values))if(value!==contactBaseline.local[id])local[localContactIds[id]]=value;return {fields,local,values}}
function hasContactDraft(){const d=contactDraft();return !!(Object.keys(d.fields).length||Object.keys(d.local).length)}
async function saveContact(){
 const key=current?.key;if(!key)return false;
 if(contactTasks.has(key))return contactTasks.get(key);
 const draft=contactDraft(),item=current,view=contactsViewVersion,edit=contactsEditVersion;
 if(!Object.keys(draft.fields).length&&!Object.keys(draft.local).length){contactsDirty=false;return true}
 if('ddd' in draft.local&&draft.local.ddd&&!/^\d{2}$/.test(draft.local.ddd)){notify('Informe um DDD de dois dígitos.',true);return false}
 contactSaves.add(key);syncContactHeader();
 const task=(async()=>{try{
   const r=await api('/api/save',{key,fields:draft.fields,local:draft.local});
   const index=db.items.findIndex(x=>x.key===key);if(index>=0)db.items[index]=r.item;
   if(current?.key===key){current=r.item;
    if(view===contactsViewVersion&&edit===contactsEditVersion){const history=$('contactHistory')?.innerHTML;renderContacts();if(history!==undefined)$('contactHistory').innerHTML=history}
    else if(contactBaseline?.key===key){for(const id of Object.keys(draft.values))if(localContactIds[id] in draft.local)contactBaseline.local[id]=draft.values[id];contactsDirty=hasContactDraft()}
    $('detailTitle').textContent=current.code+' · '+current.fields['Município']+' / '+current.fields.UF;
    if(project&&('Município' in draft.fields||'UF' in draft.fields))project.dirty=true;
   }
   render(true);notify('Dados e contatos salvos · '+r.item.fields['Município']+'.');return true;
  }catch(e){notify('Não foi possível salvar '+item.fields['Município']+': '+e.message,true);return false}
  finally{contactSaves.delete(key);contactTasks.delete(key);syncContactHeader()}
 })();contactTasks.set(key,task);return task;
}
async function closeContacts(){if(contactClosing)return;const key=current?.key;contactClosing=true;syncContactHeader();const locked=[...$('contacts').querySelectorAll('input,select,textarea')].map(el=>[el,el.disabled]);for(const [el] of locked)el.disabled=true;try{if(!await saveContact())return;if(current?.key!==key)return;if(hasContactDraft()&&!await saveContact())return;$('detail').close()}finally{for(const [el,disabled] of locked)if(el.isConnected)el.disabled=disabled;contactClosing=false;syncContactHeader()}}
function cancelContacts(){if(contactClosing||contactSaves.has(current?.key)){notify('Aguarde o salvamento em andamento. Cancelar descarta somente alterações ainda não salvas.',true);return}contactsDirty=false;renderContacts();$('detail').close()}
$('detail').addEventListener('cancel',event=>{event.preventDefault();closeContacts()});
async function reviewContact(){if(contactClosing)return;const key=current?.key;if(!key||!await saveContact())return;if(current?.key!==key)return;try{const r=await api('/api/review',{key});const index=db.items.findIndex(x=>x.key===key);if(index>=0)db.items[index]=r.item;if(current?.key===key){current.local.last_reviewed_at=r.item.local.last_reviewed_at}render(true);notify('Município marcado como revisado.')}catch(e){notify(e.message,true)}}
function recentContactActivity(item,at=Date.now()){const candidates=[['Editado',item.local.last_manual_edit_at],['Revisado',item.local.last_reviewed_at]].map(([label,time])=>({label,time,age:at-Date.parse(time)})).filter(x=>Number.isFinite(x.age)&&x.age>=0&&x.age<86400000).sort((a,b)=>a.age-b.age);return candidates[0]||null}
function paintContactActivity(at=Date.now()){const items=new Map(db.items.map(x=>[x.key,x]));for(const row of $('rows').querySelectorAll('[data-city-key]')){const item=items.get(row.dataset.cityKey);if(!item)continue;const recent=recentContactActivity(item,at);row.classList.toggle('recent-manual',!!recent);row.querySelector('.manual-activity')?.remove();if(!recent)continue;const badge=document.createElement('small');badge.className='manual-activity';const minutes=Math.floor(recent.age/60000);badge.textContent=recent.label+(minutes<1?' agora':minutes<60?' há '+minutes+' min':' há '+Math.floor(minutes/60)+' h');badge.title=(item.local.last_manual_edit_at?'Última edição manual: '+dateLabel(item.local.last_manual_edit_at):'')+(item.local.last_reviewed_at?' · Última revisão: '+dateLabel(item.local.last_reviewed_at):'');row.children[1].append(badge)}}
const renderBefore119=render;
render=function(keepPage=false){renderBefore119(keepPage);paintContactActivity()};
setInterval(()=>{if(!document.hidden)paintContactActivity()},60000);
window.addEventListener('focus',()=>paintContactActivity());
const activityStyle=document.createElement('style');activityStyle.textContent='#rows tr.recent-manual>td{background:#ededed}#rows .manual-activity{color:#475569;font-weight:600}#detail>.modalhead{flex-wrap:wrap;gap:10px}';document.head.append(activityStyle);
paintContactActivity();
