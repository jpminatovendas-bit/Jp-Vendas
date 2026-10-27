import operators131
"""Saudações individuais por estação Chrome local; consulta antes de autorizar envio."""
import hashlib,hmac,json,re,secrets,time
from datetime import datetime,timedelta,timezone
import communication

WORKER_ROUTES={'/api/wa-office-connect','/api/wa-office-worker'}
ACTIVE={'queued','checking','ready','sending'}
TERMINAL={'sent','failed','absent','inconclusive','uncertain','cancelled','expired'}
DEFAULT={'enabled':False,'expected_number':'','daily_limit':30,'greetings':{
 'camara':'{saudacao}! Sou da JP Minato. Falo com a Câmara Municipal de {municipio} / {uf}?',
 'presidente':'{saudacao}, {primeiro_nome}! Sou da JP Minato. Falo com o presidente da Câmara Municipal de {municipio} / {uf}?'}}

def stamp():return datetime.now(timezone(timedelta(hours=-3))).isoformat(timespec='seconds')
def config(store):return {**DEFAULT,**store.setting('wa_sender_config',{})}
def initialize(store):
 store.wa_sender_tickets={}
 with store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS wa_sender_attempts (id TEXT PRIMARY KEY,value TEXT NOT NULL)')
  for ident,value in db.execute('SELECT id,value FROM wa_sender_attempts').fetchall():
   task=json.loads(value)
   if task['state'] in ACTIVE:
    task.update(state='uncertain' if task['state']=='sending' else 'cancelled',error='Servidor reiniciado. Não houve reenvio automático; confira antes de repetir.',finished_at=stamp())
    put(db,task)
 # O Chrome precisa anunciar novamente a conexão após cada reinício.
 store.set_setting('wa_sender_connection',{})
def put(db,task):db.execute('INSERT OR REPLACE INTO wa_sender_attempts VALUES (?,?)',(task['id'],json.dumps(task,ensure_ascii=False)))
def rows(db):return [json.loads(v) for v, in db.execute('SELECT value FROM wa_sender_attempts ORDER BY rowid DESC')]
def get(db,ident):
 row=db.execute('SELECT value FROM wa_sender_attempts WHERE id=?',(ident,)).fetchone()
 if not row:raise ValueError('Solicitação de WhatsApp não encontrada.')
 return json.loads(row[0])
def clean(task):return {k:v for k,v in task.items() if k not in ('claim','permit','station','deadline')}
def expire(db):
 for task in rows(db):
  if task['state'] in ACTIVE and time.time()>task['deadline']:
   task.update(state='uncertain' if task['state']=='sending' else 'expired',error='Tempo esgotado. Confira antes de repetir.' if task['state']=='sending' else 'Solicitação expirada antes do envio. Clique novamente quando a estação estiver conectada.',finished_at=stamp());put(db,task)
def public(store):
 with store.lock,store.connect() as db:
  expire(db);history=rows(db);c=config(store);connection=store.setting('wa_sender_connection',{})
  online=bool(connection.get('connected') and time.time()-connection.get('at',0)<20 and connection.get('account')==c['expected_number'])
  return {'config':c,'connection':{**connection,'connected':online},'today_count':sum(t['created_at'][:10]==stamp()[:10] and t['state'] not in ('cancelled','expired') for t in history),'history':[clean(t) for t in history[:50]],'blocked':store.setting('wa_sender_blocked',{})}
def normalize_account(value):
 """Identificador da própria conta: preserve PN legado sem inventar nono dígito."""
 import app
 try:return app.normalize_phone(value)
 except ValueError as original:
  text=str(value or '').strip()
  if not re.fullmatch(r'[+\d\s().-]+',text):raise original
  number=re.sub(r'\D','',text)
  if len(number)==10:number='55'+number
  valid_ddds={d for values in app.UF_DDD.values() for d in values}
  if len(number)==12 and number.startswith('55') and number[2:4] in valid_ddds and number[4] in '6789':return number
  raise original
def configure(store,body):
 import app
 number=normalize_account(body.get('expected_number'));limit=int(body.get('daily_limit',30))
 if not 1<=limit<=30:raise ValueError('Use limite de 1 a 30 tentativas por dia nesta versão.')
 greetings=body.get('greetings',config(store)['greetings'])
 if not isinstance(greetings,dict) or set(greetings)!={'camara','presidente'}:raise ValueError('Configure a saudação da Câmara e do presidente.')
 for text in greetings.values():
  if not isinstance(text,str) or not text.strip() or len(text)>4000:raise ValueError('Saudação deve ter de 1 a 4000 caracteres.')
  if set(re.findall(r'\{([^{}]+)\}',text))-communication.VARIABLES:raise ValueError('Variável desconhecida na saudação.')
 with store.lock:
  with store.connect() as db:
   expire(db)
   if any(t['state']=='sending' for t in rows(db)):raise ValueError('Aguarde o envio atual terminar antes de alterar a estação.')
   for t in rows(db):
    if t['state'] in ACTIVE:t.update(state='cancelled',error='Configuração alterada antes do envio.',finished_at=stamp());put(db,t)
  old=config(store);store.set_setting('wa_sender_config',{'enabled':body.get('enabled') is True,'expected_number':number,'daily_limit':limit,'greetings':{k:v.strip() for k,v in greetings.items()}})
  if old['expected_number']!=number:
   store.set_setting('wa_sender_station',{});store.set_setting('wa_sender_connection',{})
 return public(store)
def local_only(peer):
 if peer not in ('127.0.0.1','::1'):raise ValueError('Conecte a estação pelo navegador do escritório em http://127.0.0.1:8765.')
def pair(store,peer):
 local_only(peer)
 with store.lock:
  if not config(store)['expected_number']:raise ValueError('Cadastre o número do WhatsApp Business primeiro.')
  store.wa_sender_tickets={t:e for t,e in store.wa_sender_tickets.items() if e>time.time()}
  ticket=secrets.token_urlsafe(32);store.wa_sender_tickets[ticket]=time.time()+90
  return {'url':'/whatsapp-escritorio?ticket='+ticket}
def connect(store,body,peer,extension):
 local_only(peer)
 with store.lock:
  expiry=store.wa_sender_tickets.pop(str(body.get('ticket','')),0)
  if expiry<time.time():raise ValueError('Vínculo expirado. Clique em Conectar no escritório novamente.')
  with store.connect() as db:
   expire(db)
   if any(t['state'] in ACTIVE for t in rows(db)):raise ValueError('Aguarde ou cancele a solicitação atual antes de reconectar.')
  token=secrets.token_urlsafe(32);station=secrets.token_hex(12)
  store.set_setting('wa_sender_station',{'hash':hashlib.sha256(token.encode()).hexdigest(),'extension':extension,'id':station})
  store.set_setting('wa_sender_connection',{})
  return {'token':token,'station':station,'expected_number':config(store)['expected_number']}
def authenticate(store,token,peer,extension):
 local_only(peer);s=store.setting('wa_sender_station',{})
 if not token or not s or s.get('extension')!=extension or not hmac.compare_digest(s.get('hash',''),hashlib.sha256(str(token).encode()).hexdigest()):raise ValueError('Estação não autorizada. Reconecte pelo MVP do escritório.')
 return s['id']
def contact(store,key,target,number):
 if target not in ('camara','presidente'):raise ValueError('Escolha Câmara ou presidente.')
 item=store.item(key)
 fields=['Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)'] if target=='camara' else ['Presidente - Telefone / Celular','Presidente - WhatsApp']
 import app
 numbers={n for f in fields for n in app.phone_numbers(item['fields'].get(f,''))}
 for f in fields:
  try:
   value=communication.normalize_recipient('whatsapp',item['fields'].get(f,''))
   if re.fullmatch(r'55\d{10,11}',value):numbers.add(value)
  except ValueError:pass
 numbers.update(item['local'].get('whatsapp_links',{}).get(target,{}))
 if number not in numbers:raise ValueError('Este número não está mais cadastrado para o destinatário escolhido. Atualize o cadastro antes de enviar.')
 if item['local'].get('archived'):raise ValueError('Município arquivado.')
 return item

def prepare(store,key,body):
 number=communication.normalize_recipient('whatsapp',body.get('recipient'));target=body.get('target');ident=body.get('id');message=body.get('message')
 if not re.fullmatch(r'55\d{10,11}',number):raise ValueError('O envio exige um número com DDD; este link não revela o número.')
 if not re.fullmatch(r'[a-f0-9]{24}',str(ident)):raise ValueError('Identificador de envio inválido.')
 if not isinstance(message,str) or not message.strip() or len(message)>4000 or re.search(r'\{[^{}]+\}',message):raise ValueError('Confira a saudação e suas variáveis antes de enviar.')
 message=message.strip()
 with store.lock,store.connect() as db:
  previous=db.execute('SELECT value FROM wa_sender_attempts WHERE id=?',(ident,)).fetchone()
  if previous:
   t=json.loads(previous[0])
   if (t['key'],t['target'],t['recipient'],t['message'])!=(key,target,number,message):raise ValueError('Solicitação repetida com dados diferentes.')
   return clean(t)
  c=config(store);connection=store.setting('wa_sender_connection',{});expire(db)
  if not c['enabled']:raise ValueError('Ative o envio de saudações em WhatsApp do escritório.')
  if not connection.get('connected') or time.time()-connection.get('at',0)>20 or connection.get('account')!=c['expected_number']:raise ValueError('Estação do escritório desconectada. Mantenha Chrome, WhatsApp Web e painel da estação abertos.')
  if number==c['expected_number']:raise ValueError('O destinatário é o próprio número da estação. Use outro contato para o teste.')
  if number in store.setting('wa_sender_blocked',{}):raise ValueError('Número marcado como Não contatar.')
  item=contact(store,key,target,number);values=rows(db)
  if any(t['state'] in ACTIVE for t in values):raise ValueError('Aguarde a solicitação atual terminar. Esta versão envia um contato por clique.')
  if sum(t['created_at'][:10]==stamp()[:10] and t['state'] not in ('cancelled','expired') for t in values)>=c['daily_limit']:raise ValueError('Limite diário de tentativas atingido. Confira o histórico.')
  recent=next((t for t in values if t['recipient']==number and t['state'] in ('sent','uncertain') and time.time()-datetime.fromisoformat(t['created_at']).timestamp()<7*86400),None)
  if recent and body.get('allow_repeat') is not True:return {'requires_repeat':True,'previous':clean(recent)}
  task={'id':ident,'key':key,'target':target,'recipient':number,'message':message,'municipality':item['fields']['Município'],'uf':item['fields']['UF'],'president_name':item['fields'].get('Presidente Atual (Nome)','') if target=='presidente' else '', 'operator':operators131.actor(),'state':'queued','created_at':stamp(),'deadline':time.time()+120,'account':c['expected_number'],'error':''}
  put(db,task);return clean(task)
def change_block(store,body):
 number=communication.normalize_recipient('whatsapp',body.get('recipient'))
 if not re.fullmatch(r'55\d{10,11}',number):raise ValueError('Informe número com DDD.')
 with store.lock:
  blocked=store.setting('wa_sender_blocked',{})
  if body.get('blocked') is True:blocked[number]={'at':stamp()}
  else:blocked.pop(number,None)
  store.set_setting('wa_sender_blocked',blocked)
  if body.get('blocked') is True:
   with store.connect() as db:
    for t in rows(db):
     if t['recipient']==number and t['state'] in ('queued','checking','ready'):t.update(state='cancelled',error='Contato bloqueado antes do envio.',finished_at=stamp());put(db,t)
 return public(store)
def cancel(store,ident):
 with store.lock,store.connect() as db:
  expire(db);t=get(db,ident)
  if t['state']=='sending':raise ValueError('A transmissão já começou. Aguarde o resultado; não é possível garantir cancelamento.')
  if t['state'] in ACTIVE:t.update(state='cancelled',error='Cancelado antes do envio.',finished_at=stamp());put(db,t)
  return clean(t)
def lookup(store,ident):
 with store.lock,store.connect() as db:expire(db);return clean(get(db,ident))
def phone_check(db,task,state):
 row=db.execute('SELECT local FROM municipalities WHERE key=?',(task['key'],)).fetchone()
 if not row:return
 local=json.loads(row[0]);status=local.setdefault('phone_status',{}).setdefault(task['target'],{}).setdefault(task['recipient'],{})
 status['last_automatic_check']={'state':state,'checked_at':stamp(),'provider':'whatsapp_web_sender'}
 if state in ('confirmed','absent'):status.update(whatsapp_verified=state=='confirmed',verification_state=state,canonical_number=task.get('delivery_number',task['recipient']),verification_method='api',provider='whatsapp_web_sender',checked_at=stamp(),verification_message='Número encontrado no WhatsApp.' if state=='confirmed' else 'Consulta explícita não encontrou conta para este número.')
 db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),task['key']))
def accepted(db,task,body):
 message_id=body.get('message_id');ack=body.get('ack')
 if not isinstance(message_id,str) or not 1<=len(message_id)<=300 or type(ack) is not int or ack<1:raise ValueError('Falta confirmação do WhatsApp para registrar o envio.')
 timestamp=stamp();notes='Saudação (somente texto) enviada pelo WhatsApp do escritório. ID '+message_id+'. Entrega e leitura não verificadas.'
 db.execute('INSERT INTO interactions VALUES (?,?,?,?,?,?,?,?,?,?)',(task['id'],task['key'],timestamp,'sent','whatsapp',task['target'],task['recipient'],None,None,notes+(' · Destino WhatsApp retornado pela consulta: '+task['delivery_number'] if task.get('delivery_number') and task['delivery_number']!=task['recipient'] else '')+(' · Operador: '+task['operator'] if task.get('operator') else '')))
 db.execute("INSERT INTO whatsapp_send_checks VALUES (?,'confirmed')",(task['id'],))
 row=db.execute('SELECT local FROM municipalities WHERE key=?',(task['key'],)).fetchone();local=json.loads(row[0])
 local.setdefault('interaction_previous',{'last_contact':local.get('last_contact'),'commercial':local.get('commercial')});local['last_contact']=timestamp[:10];local['updated_at']=timestamp
 if local.get('commercial','Não contatado')=='Não contatado':local['commercial']='Contatado'
 db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),task['key']))
 task.update(state='sent',message_id=message_id,ack=ack,finished_at=timestamp)
def canonical_mobile_alias(requested,returned):
 return bool(re.fullmatch(r'55\d{2}9\d{8}',requested or '') and re.fullmatch(r'55\d{2}[6-9]\d{7}',returned or '') and requested[:4]+requested[5:]==returned)
def verified_destination(task,body):
 requested=task['recipient'];canonical=str(body.get('canonical_number') or requested);evidence=body.get('evidence')
 if body.get('checked_number')!=requested:return None
 if evidence=='matching_wid':return requested if canonical==requested else None
 if body.get('requested_number')!=requested:return None
 if not (canonical==requested or canonical_mobile_alias(requested,canonical)):return None
 if evidence=='canonical_br_mobile' and canonical!=requested and body.get('returned_wid') in (canonical+'@c.us',canonical+'@s.whatsapp.net'):return canonical
 if evidence=='mapped_lid' and re.fullmatch(r'\d{5,30}@lid',str(body.get('mapping_lid',''))) and body.get('mapping_lid')==body.get('returned_wid'):return canonical
 return None
def worker(store,token,body,peer,extension):
 revoke=None
 with store.lock:
  station=authenticate(store,token,peer,extension);action=body.get('action');c=config(store);account=str(body.get('account',''))
  online=body.get('connected') is True and account==c['expected_number']
  if action=='pause':
   store.set_setting('wa_sender_connection',{'connected':False,'account':account,'at':time.time(),'message':'Estação pausada.'})
   with store.connect() as db:
    for t in rows(db):
     if t['state'] in ('queued','checking','ready'):t.update(state='cancelled',error='Estação pausada antes do envio.',finished_at=stamp());put(db,t)
   return {'message':'Estação pausada. Transmissão já iniciada, se houver, continua aguardando resultado.'}
  if action=='poll':
   store.set_setting('wa_sender_connection',{'connected':online,'account':account,'at':time.time(),'message':'Conectado ao número configurado.' if online else ('Conta conectada '+account+' diferente da configurada '+c['expected_number']+'.' if body.get('connected') and account else str(body.get('detail') or 'WhatsApp desconectado ou conta diferente da configurada.')[:350])})
   with store.connect() as db:
    expire(db);values=rows(db)
    if not online or not c['enabled'] or any(t['state'] in ('checking','ready','sending') for t in values):return {'task':None,'enabled':c['enabled']}
    t=next((t for t in reversed(values) if t['state']=='queued'),None)
    if not t:return {'task':None,'enabled':c['enabled']}
    t.update(state='checking',station=station,claim=secrets.token_urlsafe(24),deadline=time.time()+60);put(db,t)
    return {'task':{**clean(t),'claim':t['claim']},'enabled':True}
  with store.connect() as db:
   expire(db);t=get(db,body.get('id'))
   if t['station']!=station or not hmac.compare_digest(t.get('claim',''),str(body.get('claim',''))):raise ValueError('Solicitação pertence a outra estação ou tentativa.')
   if action=='result' and t['state']=='sent':return {'task':clean(t)}
   if t['state'] not in ACTIVE and not (action=='result' and t['state']=='uncertain'):return {'task':clean(t),'send':False}
   if action=='abandon':
    t.update(state='uncertain' if t['state']=='sending' else 'inconclusive',error='Estação interrompida. Confira a conversa antes de repetir.' if t['state']=='sending' else 'Consulta interrompida antes do envio.',finished_at=stamp());put(db,t);return {'task':clean(t)}
   if action=='check':
    if t['state']=='ready':return {'task':clean(t)}
    if t['state']!='checking':raise ValueError('Consulta fora de ordem.')
    state=body.get('state')
    valid=online and body.get('account_after')==t['account'] and account==t['account']
    destination=verified_destination(t,body) if valid and state=='confirmed' else None
    absent=valid and state=='absent' and body.get('evidence')=='raw_query_absent' and body.get('exists') is False and body.get('checked_number')==t['recipient'] and body.get('requested_number')==t['recipient']
    if absent:state='absent'
    elif not destination:state='inconclusive'
    else:
     state='confirmed';t['delivery_number']=destination;t['query_evidence']={k:body.get(k) for k in ('evidence','requested_number','canonical_number','mapping_lid','returned_wid')}
    phone_check(db,t,state);t['verification_state']=state
    if state=='confirmed':t.update(state='ready',deadline=time.time()+30)
    else:
     t.update(state=state,error='Número não cadastrado no WhatsApp.' if state=='absent' else 'Não foi possível confirmar o número. Nenhuma mensagem enviada. '+str(body.get('detail') or 'A consulta não comprovou a existência ou ausência do número.')[:220],finished_at=stamp())
     if state=='absent':revoke=(t['key'],t['target'],t['recipient'])
    put(db,t);result={'task':clean(t)}
   elif action=='authorize':
    if t['state']!='ready':return {'task':clean(t),'send':False}
    allowed=online and account==t['account'] and c['enabled'] and t['recipient'] not in store.setting('wa_sender_blocked',{})
    try:
     item=contact(store,t['key'],t['target'],t['recipient'])
     if t['target']=='presidente' and item['fields'].get('Presidente Atual (Nome)','')!=t['president_name']:allowed=False
    except ValueError:allowed=False
    if not allowed:t.update(state='cancelled',error='Conta, cadastro ou autorização mudou antes do envio.',finished_at=stamp());put(db,t);return {'task':clean(t),'send':False}
    t.update(state='sending',permit=secrets.token_urlsafe(24),deadline=time.time()+75);put(db,t)
    return {'task':clean(t),'send':True,'permit':t['permit']}
   elif action=='result':
    if t['state'] not in ('sending','uncertain'):raise ValueError('Envio não autorizado.')
    if not hmac.compare_digest(t.get('permit',''),str(body.get('permit',''))):raise ValueError('Autorização de envio inválida.')
    if body.get('state')=='sent' and online and body.get('account_after')==t['account']:accepted(db,t,body)
    else:t.update(state='uncertain',error='Resultado do envio não confirmado. Confira a conversa antes de repetir.',finished_at=stamp())
    put(db,t);result={'task':clean(t)}
   else:raise ValueError('Ação da estação inválida.')
 if revoke:
  import whatsapp_send126
  whatsapp_send126.revoke(store,*revoke)
 if action=='result' and t.get('state')=='sent':operators131.audit(store,'Saudação WhatsApp enviada',t['key'],{'id':t['id'],'recipient':t['recipient']},t.get('operator'))
 return result
