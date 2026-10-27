// Teste DOM: npm install --no-save --prefix /tmp/jp-dom linkedom; JP_TEST_DOM=/tmp/jp-dom/node_modules/linkedom node tests/test_send_ui124.cjs
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {parseHTML}=require(process.env.JP_TEST_DOM||'linkedom');
const {document}=parseHTML('<html><head></head><body><div id="send"></div><div id="contactHistory"></div></body></html>');
process.chdir(require('path').resolve(__dirname,'..'));
const html=fs.readFileSync('web/index.html','utf8'),legacy=html.slice(html.indexOf('function renderSendLegacy(){'),html.indexOf('async function loadHistoryLegacy'));
const people=[{target:'camara',value:'5554999991111',label:'Câmara'},{target:'presidente',value:'5554999992222',label:'Presidente'}];
const emails=[{target:'camara',value:'camara@example.org',label:'Câmara'},{target:'presidente',value:'presidente@example.org',label:'Presidente'}];
let history=[],opens=[],opened=[],failRecord=false,blocked=false,records=[];
const item={key:'RS-TESTE',fields:{'Município':'Teste',UF:'RS','Presidente Atual (Nome)':'Maria Silva'},local:{}};
const context=vm.createContext({document,URL,Intl,Date,Map,Set,Uint8Array,crypto:require('crypto').webcrypto,structuredClone,console,
 current:item,project:{pdf_url:'/pdf',pdf:'teste.pdf',dirty:false},db:{items:[item]},$:id=>document.getElementById(id),
 recipients:c=>c==='whatsapp'?people:emails,renderContacts(){},openSettings(){},esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 useful:Boolean,safeURL:x=>x,icon:()=>'',recipientOptions:()=>'',targetOptions:()=>'<option value="camara">Câmara</option><option value="presidente">Presidente</option><option value="outro">Outro</option>',
 dateLabel:x=>x||'',channelLabel:(c,t)=>c+' '+t,notify(){},phoneValues:x=>/^\d+$/.test(x)?[x]:[],rawWhatsAppLink:()=>null,whatsappChoices:()=>[],
 beginWhatsAppReturn:()=>null,cancelWhatsAppReturn(){},whatsAppSendSaved(){},setInterval(){},setTimeout,refresh:async()=>{},window:{open(){if(blocked)return null;const win={location:'',close(){}};opened.push(win);return win}},
 api:async(path,body)=>{if(path.startsWith('/api/history'))return history;if(path.startsWith('/api/contact-openings'))return{items:opens};if(path==='/api/contact-opened'){opens.push(body);return{items:opens}}if(path==='/api/interaction'){if(failRecord)throw Error('Falha simulada');if(!history.some(x=>x.id===body.id)){history.push({...body,active:true});records.push(body)}return{}}throw Error(path)}
});
vm.runInContext(legacy,context);
vm.runInContext(fs.readFileSync('web/communication118.js','utf8'),context);
let update=fs.readFileSync('web/update116.js','utf8');vm.runInContext(update.slice(0,update.indexOf('const googleDialog='))+'\n'+update.slice(update.indexOf('function startSingleSend(')),context);
vm.runInContext(fs.readFileSync('web/send124.js','utf8'),context);
vm.runInContext("messageTemplatesReady=true;messageTemplates={whatsapp_camara:{body:'MENSAGEM CAMARA'},whatsapp_presidente:{body:'MENSAGEM PRESIDENTE'},email_camara:{subject:'ASSUNTO CAMARA',body:'EMAIL CAMARA'},email_presidente:{subject:'ASSUNTO PRESIDENTE',body:'EMAIL PRESIDENTE'}}",context);
const tick=()=>new Promise(r=>setTimeout(r,10));
(async()=>{
 context.renderSend();await tick();
 assert.equal(document.querySelectorAll('.send-role').length,2);assert.equal(document.querySelectorAll('.send-role .send-channel').length,4);
 for(const target of ['camara','presidente'])for(const channel of ['whatsapp','email']){const section=document.querySelector(`[data-send-target="${target}"] [data-send-channel="${channel}"]`);assert.equal(JSON.parse(section.querySelector('[data-recipient]').dataset.recipient).target,target);assert(section.querySelector('#body_'+channel+'_'+target));assert(section.querySelector('input[type="checkbox"]').checked)}
 let b=document.querySelector('[data-send-target="presidente"] [data-send-channel="email"] .send-recipient-button');assert(!b.classList.contains('send-recorded'));b.onclick();await tick();assert.equal(records.at(-1).target,'presidente');assert(opened.at(-1).location.includes('ASSUNTO%20PRESIDENTE'));assert(b.classList.contains('send-recorded'));
 context.renderSend();await tick();assert(document.querySelector('[data-send-target="presidente"] [data-send-channel="email"] .send-recipient-button').classList.contains('send-recorded'));
 history[0].active=false;await context.loadHistory();assert(!document.querySelector('[data-send-target="presidente"] [data-send-channel="email"] .send-recipient-button').classList.contains('send-recorded'));
 context.startSendQueue('whatsapp','camara');await tick();assert.equal(records.at(-1).target,'camara');assert.equal(vm.runInContext("sendQueues.get(current.key+':whatsapp').entries.length",context),1);assert(opened.at(-1).location.toString().includes('MENSAGEM+CAMARA'));
 failRecord=true;b=document.querySelector('[data-send-target="presidente"] [data-send-channel="whatsapp"] .send-recipient-button');b.onclick();await tick();assert(!b.classList.contains('send-recorded'));assert(b.classList.contains('send-record-pending'));const n=opened.length;failRecord=false;await context.retrySendRecord('whatsapp');assert.equal(opened.length,n);assert(b.classList.contains('send-recorded'));
 blocked=true;const nRecords=records.length;context.startSingleSend('email',emails[0]);await tick();assert.equal(records.length,nRecords);
 console.log('OK: quatro seções; identidade/modelos corretos; seleção padrão; envio individual; lote isolado; cor persistente/reversível; falha de gravação/repetição sem reabertura; popup bloqueado sem registro.');
})().catch(e=>{console.error(e);process.exitCode=1});
