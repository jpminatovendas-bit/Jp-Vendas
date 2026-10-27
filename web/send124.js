/* Envio por destinatário: Câmara e Presidente, cada um com seus dois canais. */
const renderSendBefore124=renderSend;
renderSend=function(){
 renderSendBefore124();
 const grid=$('send').querySelector('.send-grid');if(!grid)return;
 const channels=[...grid.children],groups=document.createElement('div');groups.className='send-role-grid';
 for(const target of ['camara','presidente']){
  const group=document.createElement('section');group.className='send-role panel';group.dataset.sendTarget=target;
  const heading=document.createElement('h3');heading.textContent=roleName(target);group.append(heading);
  const subtitle=document.createElement('p');subtitle.className='muted';subtitle.textContent=target==='camara'?'Contatos institucionais da Câmara':(current.fields['Presidente Atual (Nome)']||'Contatos próprios do presidente');group.append(subtitle);
  for(const [index,channel] of ['whatsapp','email'].entries()){
   const original=channels[index],section=document.createElement('section');section.className='send-channel';section.dataset.sendChannel=channel;
   const title=document.createElement('h4');title.innerHTML=icon(channel==='whatsapp'?'whatsapp':'email')+' '+(channel==='whatsapp'?'Envio por WhatsApp':'Envio por e-mail');section.append(title);
   const hint=document.createElement('small');hint.className='muted';hint.textContent='Destinatário e mensagem: '+roleName(target);section.append(hint);
   const list=document.createElement('div');list.className='recipient-checks';
   for(const row of [...original.querySelectorAll('[data-recipient]')]){
    const r=JSON.parse(row.dataset.recipient);if(r.target!==target)continue;
    const button=row.querySelector('button');button.classList.add('send-recipient-button');button.textContent='Enviar';button.setAttribute('aria-label','Enviar '+(channel==='whatsapp'?'WhatsApp':'e-mail')+' para '+roleName(target)+' · '+r.value);list.append(row);
   }
   if(!list.children.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhum '+(channel==='whatsapp'?'número ou link':'e-mail')+' cadastrado para '+roleName(target)+'.';list.append(empty)}
   section.append(list);
   const editor=original.querySelector('#body_'+modelId(channel,target))?.closest('.message-editor');if(editor){editor.querySelector('summary').textContent='Conferir / editar mensagem para '+roleName(target);section.append(editor)}
   const batch=document.createElement('button');batch.textContent='Enviar aos marcados · '+roleName(target);batch.disabled=!list.querySelector('[data-recipient]');batch.onclick=()=>startSendQueue(channel,target);section.append(batch);group.append(section);
  }
  groups.append(group);
 }
 grid.before(groups);
 const manual=document.createElement('details');manual.className='send-manual';const summary=document.createElement('summary');summary.textContent='Outro contato / envio manual';manual.append(summary);grid.before(manual);manual.append(grid);
 for(const panel of channels){panel.querySelector('.recipient-checks')?.remove();const label=panel.querySelector('label');if(label)label.textContent='Contato manual';const manualButton=panel.querySelector('.contact-buttons button');manualButton.textContent='Enviar contato manual';manualButton.onclick=()=>startSendQueue(panel===channels[0]?'whatsapp':'email',null,true)}
 const progress=document.createElement('div');progress.className='send-progress';
 for(const channel of ['whatsapp','email']){const queue=$('sendQueue'+channel);if(queue)progress.append(queue)}groups.after(progress);
 paintRecipientStates();
};
const paintRecipientStatesBefore124=paintRecipientStates;
paintRecipientStates=function(){
 paintRecipientStatesBefore124();if(!current)return;
 const events=sendEvents.get(current.key)||[];
 for(const row of $('send').querySelectorAll('[data-recipient]')){
  const r=JSON.parse(row.dataset.recipient),sent=events.some(x=>x.active!==false&&x.kind==='sent'&&openingKey(x.channel,x)===openingKey(r.channel,r));
  const q=sendQueues.get(current.key+':'+r.channel),pending=q?.pendingRecord&&openingKey(q.pendingRecord.channel,q.pendingRecord)===openingKey(r.channel,r);
  const button=row.querySelector('button');if(!button)continue;
  button.classList.toggle('send-recorded',sent);button.classList.toggle('send-record-pending',!!pending);button.disabled=!!q?.busy;
  button.onclick=()=>pending?retrySendRecord(r.channel):startSingleSend(r.channel,r);
  button.textContent=sent?'✓ Envio registrado':pending?'Salvar registro pendente':'Enviar';button.title=sent?'Envio acionado e registrado. Clique para enviar novamente. Entrega não confirmada.':pending?'A abertura ocorreu, mas o registro ainda não foi salvo. Use Tentar salvar registro novamente.':'Abrir destinatário e registrar envio';
  row.classList.toggle('contact-opened',sent);
 }
};
const sendStyle124=document.createElement('style');sendStyle124.textContent='.send-role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}.send-role{min-width:0}.send-role>h3{font-size:21px;margin:0}.send-channel{border-top:1px solid var(--border);padding-top:12px;margin-top:16px}.send-channel h4{display:flex;align-items:center;gap:6px;margin:0 0 8px}.send-role .recipient-entry{align-items:center}.send-role .recipient-entry label{min-width:0;overflow-wrap:anywhere}.send-role .send-recipient-button{background:white;color:#19415d;border:1px solid #9badbb;min-width:96px}.send-role .send-recipient-button.send-recorded{background:#15803d;color:white;border-color:#15803d}.send-role .send-recipient-button.send-record-pending{background:#fff2c2;color:#704700;border-color:#c58b12}.send-manual{margin:18px 0}.send-manual>summary{cursor:pointer;font-weight:600}.send-role .message-editor{overflow-wrap:anywhere}.send-role input,.send-role textarea{box-sizing:border-box;max-width:100%}@media(max-width:900px){.send-role-grid{grid-template-columns:1fr}}';document.head.append(sendStyle124);
