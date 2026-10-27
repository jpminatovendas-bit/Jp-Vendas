/* Integração da estação. Não altera funções ou estados internos do WhatsApp. */
(()=>{
 const VERSION='4.7.1';
 function phoneWid(value){
  if(!value)return '';
  let full;try{full=String(value._serialized||value.toString())}catch{return ''}
  const server=String(value.server||full.split('@')[1]||'');
  if(server&&server!=='c.us'&&server!=='s.whatsapp.net')return '';
  const number=String(value.user||full.split('@')[0]||'').split(':')[0];
  return /^\d{10,15}$/.test(number)?number:'';
 }
 function identity(){
  const w=window.WPP,result={connected:false,account:'',library_version:String(w?.version||''),reason:'loading',detail:''};
  if(!w){result.reason='library_missing';result.detail='Componente de conexão ainda não carregado.';return result}
  if(!w.isReady){result.detail='Biblioteca ainda carregando. Aguarde com a aba do WhatsApp Web aberta.';return result}
  let stage='autenticação';
  try{
   if(typeof w.conn?.isAuthenticated!=='function')throw Error('Função de autenticação indisponível.');
   if(!w.conn.isAuthenticated()){result.reason='not_authenticated';result.detail='Abra o WhatsApp Web neste perfil do Chrome e conecte pelo QR Code.';return result}
   stage='conexão';
   if(typeof w.conn.isOnline!=='function')throw Error('Função de conexão indisponível.');
   if(!w.conn.isOnline()){result.reason='offline';result.detail='WhatsApp Web sem conexão. Abra sua aba e aguarde reconectar.';return result}
   stage='identificação do número';
   // Uma conta pode usar LID. Priorize o identificador público de telefone (PN).
   const readers=[()=>w.whatsapp?.UserPrefs?.getMaybeMePnUser?.(),()=>w.conn.getMyUserWid?.(),()=>w.conn.getMyUserId?.()];let lastError='';
   for(const reader of readers){try{result.account=phoneWid(reader());if(result.account)break}catch(e){lastError=String(e.message||e)}}
   if(!result.account){result.reason='identity_unavailable';result.detail='WhatsApp conectado, mas o número não pôde ser identificado. Identificador LID não será tratado como telefone.'+(lastError?' Detalhe: '+lastError.slice(0,160):'');return result}
   result.connected=true;result.reason='connected';result.detail='WhatsApp conectado: '+result.account;return result;
  }catch(e){result.reason='library_error';result.detail='Falha na biblioteca durante '+stage+': '+String(e.message||e).slice(0,180)+'. Atualize a extensão e reabra a aba do WhatsApp Web.';return result}
 }
 function valid(expected){const i=identity();return i.connected&&i.account===expected}
 function brazilMobileAlias(requested,returned){
  return /^55\d{2}9\d{8}$/.test(requested)&&/^55\d{2}[6-9]\d{7}$/.test(returned)&&requested.slice(0,4)+requested.slice(5)===returned;
 }
 function serializedWid(value){
  if(!value)return '';
  if(typeof value==='string')return value;
  if(value._serialized)return String(value._serialized);
  if((value.user||value.id)&&value.server)return String(value.user||value.id)+'@'+value.server;
  try{const text=String(value);return text==='[object Object]'?'':text}catch{return ''}
 }
 async function check(number,expected){
  let timer;const before=identity();if(!before.connected||before.account!==expected)return {state:'inconclusive',account_after:before.account,detail:before.detail};
  const timeout=(promise,ms)=>{clearTimeout(timer);return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Consulta excedeu o tempo.')),ms)})])};
  try{
   const query=window.WPP.contact?.queryWidExists;if(typeof query!=='function')throw Error('Consulta de existência indisponível na biblioteca.');
   let value=await timeout(query.call(window.WPP.contact,number+'@c.us'),25000);
   let after=identity();if(!after.connected||after.account!==expected)return {state:'inconclusive',account_after:after.account,detail:after.detail};
   // WA-JS 4.7.1 também retorna null em falhas: não é prova de ausência.
   if(value===null||value===undefined){
    const rawQuery=window.WPP.whatsapp?.functions?.queryWidExists,makeWid=window.WPP.whatsapp?.WidFactory?.createWid;
    if(typeof rawQuery!=='function'||typeof makeWid!=='function')return {state:'inconclusive',account_after:after.account,detail:'A biblioteca não retornou resultado e a consulta direta não está disponível. Ausência de WhatsApp não confirmada.'};
    const raw=await timeout(rawQuery(makeWid(number+'@c.us')),20000);
    after=identity();if(!after.connected||after.account!==expected)return {state:'inconclusive',account_after:after.account,detail:after.detail};
    // The direct query is outside WA-JS's catch-and-return-null wrapper.
    // A thrown error or undefined remains inconclusive; never infer absence from text.
    if(raw===null)return {state:'absent',exists:false,evidence:'raw_query_absent',checked_number:number,requested_number:number,account_after:after.account,detail:'Consulta direta concluída sem conta WhatsApp para o número solicitado.'};
    if(!raw)return {state:'inconclusive',account_after:after.account,detail:'Consulta direta sem resultado explícito.'};
    value=raw;
   }
   const returnedWid=serializedWid(value.wid);let found=phoneWid(value.wid),mappingLid='';
   if(!found&&/^\d{5,30}@lid$/.test(returnedWid)&&typeof window.WPP.contact.getPnLidEntry==='function'){
    const entry=await timeout(window.WPP.contact.getPnLidEntry(returnedWid),10000);
    if(serializedWid(entry?.lid)===returnedWid){found=phoneWid(entry.phoneNumber);mappingLid=returnedWid;}
   }
   after=identity();if(!after.connected||after.account!==expected)return {state:'inconclusive',account_after:after.account,detail:after.detail};
   if(found===number||brazilMobileAlias(number,found))return {state:'confirmed',checked_number:number,canonical_number:found,requested_number:number,evidence:mappingLid?'mapped_lid':found===number?'matching_wid':'canonical_br_mobile',mapping_lid:mappingLid,returned_wid:returnedWid,account_after:after.account};
   return {state:'inconclusive',account_after:after.account,requested_number:number,canonical_number:found,returned_wid:returnedWid,detail:'Solicitado: '+number+'; retorno: '+(returnedWid||'sem identificador')+(found&&found!==returnedWid?'; telefone vinculado: '+found:'')+'. A relação não foi comprovada.'};
  }catch(e){return {state:'inconclusive',account_after:identity().account,detail:String(e.message||e).slice(0,220)}}finally{clearTimeout(timer)}
 }
 async function send(number,message,expected){
  let timer;try{
   if(!valid(expected))return {state:'uncertain',account_after:identity().account};
   const fn=window.WPP.chat?.sendTextMessage;if(typeof fn!=='function')throw Error('Envio indisponível na biblioteca.');
   const r=await Promise.race([fn.call(window.WPP.chat,number+'@c.us',message,{createChat:true,waitForAck:true,markIsRead:false,detectMentioned:false,linkPreview:false}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Envio sem retorno.')),45000)})]);
   const id=typeof r?.id==='string'?r.id:r?.id?._serialized,after=identity();
   if(after.connected&&after.account===expected&&id&&Number.isInteger(r.ack)&&r.ack>=1)return {state:'sent',message_id:id,ack:r.ack,account_after:after.account};
   return {state:'uncertain',account_after:after.account};
  }catch(e){return {state:'uncertain',account_after:identity().account,detail:String(e.message||e).slice(0,220)}}finally{clearTimeout(timer)}
 }
 window.__jpMinatoOffice132=Object.freeze({version:VERSION,build:'1.18.0',identity,check,send});
})();
