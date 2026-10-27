"""Consulta de existência em gateways configurados; nunca envia mensagens."""
import json,re,secrets,threading,time,urllib.request,urllib.error
from urllib.parse import urlparse,quote
from datetime import datetime
DEFAULT={'provider':'evolution','base_url':'http://127.0.0.1:8080','instance':'','enabled':False,'automatic':False,'batch_size':20,'interval':3,'timeout':20}
SECRETS=('api_key','token','client_token')
def stamp():return datetime.now().astimezone().isoformat(timespec='seconds')
def config(store):return {**DEFAULT,**store.setting('whatsapp_verification_config',{})}
def credentials(store):return store.setting('whatsapp_verification_credentials',{})
def sanitize(store,message):
 message=str(message)
 for value in credentials(store).values():
  if value:message=message.replace(value,'[credencial ocultada]')
 return message[:600]
def public(store):
 c=config(store);secret=credentials(store)
 with store.connect() as db:rows=[json.loads(v) for v, in db.execute('SELECT value FROM whatsapp_checks ORDER BY rowid DESC')]
 counts={s:sum(r['state']==s for r in rows) for s in ('pending','running','confirmed','absent','inconclusive')}
 return {'config':c,'credential_present':{k:bool(secret.get(k)) for k in SECRETS},'connection':store.setting('whatsapp_connection',{'connected':False,'message':'Configure uma instância conectada.'}),'counts':counts,'items':rows[:300],'total':len(rows)}
def save_config(store,body):
 c={k:body.get(k,config(store)[k]) for k in DEFAULT}
 if c['provider'] not in ('evolution','zapi'):raise ValueError('Provedor inválido.')
 c['enabled']=c['enabled'] is True;c['automatic']=c['automatic'] is True;c['instance']=str(c['instance']).strip()
 if c['instance'] and not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}',c['instance']):raise ValueError('Instância inválida.')
 c['base_url']=str(c['base_url']).strip().rstrip('/')
 u=urlparse(c['base_url'])
 if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.query or u.fragment:raise ValueError('URL da API inválida; não inclua credenciais na URL.')
 if c['provider']=='zapi':c['base_url']='https://api.z-api.io'
 for k,lo,hi in [('batch_size',1,100),('interval',1,60),('timeout',5,30)]:
  c[k]=int(c[k])
  if not lo<=c[k]<=hi:raise ValueError('Limite inválido: '+k)
 secret=credentials(store)
 for k in SECRETS:
  if body.get('clear_credentials'):secret[k]=''
  elif body.get(k):
   value=str(body[k]).strip()
   if len(value)>1000 or '\n' in value or '\r' in value:raise ValueError('Credencial inválida.')
   secret[k]=value
 needed=('api_key',) if c['provider']=='evolution' else ('token','client_token')
 if c['enabled'] and (not c['instance'] or not all(secret.get(k) for k in needed)):raise ValueError('Informe instância e credenciais antes de ativar.')
 with store.whatsapp_config_lock:
  store.set_setting('whatsapp_verification_credentials',secret);store.set_setting('whatsapp_verification_config',c)
  store.set_setting('whatsapp_connection',{'connected':False,'message':'Configuração alterada. Clique em Testar conexão.','checked_at':stamp()})
 store.whatsapp_wake.set();return {'ok':True}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def request(store,c,path,body=None):
 secret=credentials(store);headers={'Content-Type':'application/json'}
 if c['provider']=='evolution':headers['apikey']=secret.get('api_key','')
 else:headers['Client-Token']=secret.get('client_token','')
 raw=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request(c['base_url']+path,data=raw,headers=headers)
 try:
  with urllib.request.build_opener(NoRedirect).open(req,timeout=c['timeout']) as response:
   payload=response.read(2*1024*1024+1)
   if len(payload)>2*1024*1024:raise ValueError('Resposta da API muito grande.')
   value=json.loads(payload)
 except urllib.error.HTTPError as e:raise ValueError('Consulta recusada pela API (HTTP '+str(e.code)+').')
 except (urllib.error.URLError,TimeoutError):raise ValueError('API sem conexão ou tempo de consulta excedido.')
 if isinstance(value,dict) and (value.get('success') is False or value.get('error') and 'connected' not in value):raise ValueError('API retornou falha: '+sanitize(store,value.get('error')))
 return value
def prefix(store,c):return '/instances/'+quote(c['instance'],safe='')+'/token/'+quote(credentials(store).get('token',''),safe='')
def connection(store,c):
 if not c['instance']:raise ValueError('Configure a instância de WhatsApp.')
 if c['provider']=='evolution':
  r=request(store,c,'/instance/connectionState/'+quote(c['instance'],safe=''));connected=isinstance(r,dict) and isinstance(r.get('instance'),dict) and r['instance'].get('state')=='open'
 else:
  r=request(store,c,prefix(store,c)+'/status');connected=isinstance(r,dict) and r.get('connected') is True
 result={'connected':connected,'checked_at':stamp(),'message':'Sessão conectada.' if connected else 'Sessão desconectada ou resposta inconclusiva. Pendentes preservados.'};store.set_setting('whatsapp_connection',result)
 if not connected:raise ValueError(result['message'])
 return result
def test_connection(store):
 with store.whatsapp_config_lock:
  try:return connection(store,config(store))
  except Exception as e:
   message=sanitize(store,e);store.set_setting('whatsapp_connection',{'connected':False,'checked_at':stamp(),'message':message});raise ValueError(message)
def phone_inventory(store,keys=None):
 import app
 wanted=set(keys) if keys is not None else None;inventory={}
 for item in store.items():
  if wanted is not None and item['key'] not in wanted:continue
  for target,fields in [('camara',['Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)']),('presidente',['Presidente - Telefone / Celular','Presidente - WhatsApp'])]:
   values=[]
   for field in fields:
    raw=str(item['fields'].get(field,'') or '')
    if raw.startswith(('http://','https://')):
     try:
      from whatsapp_links import parse_link
      number=parse_link(raw,app.normalize_phone)['link_number']
      if number:values.append(number)
     except ValueError:pass
    else:values.extend(app.phone_numbers(raw))
   values.extend(n for n in item['local'].get('whatsapp_links',{}).get(target,{}) if n)
   for number in set(values):
    try:normalized=app.normalize_phone(number)
    except ValueError:continue
    status=item['local'].get('phone_status',{}).get(target,{}).get(normalized,{})
    if normalized[2:4] not in item['allowed_ddds'] and not status.get('ddd_exception'):continue
    inventory.setdefault(normalized,[]).append({'key':item['key'],'code':item['code'],'municipality':item['fields']['Município'],'uf':item['fields']['UF'],'target':target,'manual_confirmed':status.get('whatsapp_verified') is True and status.get('verification_method')!='api'})
 return inventory
def enqueue(store,keys=None,manual=False):
 if keys is not None and (not isinstance(keys,list) or not keys):raise ValueError('Escolha municípios para conferir.')
 inventory=phone_inventory(store,keys);added=0;completed=[]
 with store.lock,store.connect() as db:
  for number,refs in inventory.items():
   row=db.execute('SELECT value FROM whatsapp_checks WHERE number=?',(number,)).fetchone();value=json.loads(row[0]) if row else {'number':number,'state':'pending','attempts':0,'next_attempt':0}
   if value['state'] in ('confirmed','absent'):completed.append((number,value,refs));continue
   if any(x['manual_confirmed'] for x in refs):
    value.update(state='confirmed',provider='manual',checked_at=stamp(),message='Confirmação manual preservada.',refs=refs);db.execute('INSERT OR REPLACE INTO whatsapp_checks VALUES (?,?)',(number,json.dumps(value,ensure_ascii=False)));completed.append((number,value,refs));continue
   value['refs']=refs
   if manual and value['state']=='inconclusive':value.update(state='pending',attempts=0,next_attempt=0)
   if not row:added+=1
   db.execute('INSERT OR REPLACE INTO whatsapp_checks VALUES (?,?)',(number,json.dumps(value,ensure_ascii=False)))
 for number,value,refs in completed:propagate(store,number,value,refs)
 store.whatsapp_wake.set();return {'ok':True,'added':added,'numbers':len(inventory)}
def propagate(store,number,value,refs):
 revoked=[]
 # Called outside open write transactions by process(); enqueue may only call for reads.
 with store.lock,store.connect() as db:
  for ref in refs:
   row=db.execute('SELECT local,source,overrides FROM municipalities WHERE key=?',(ref['key'],)).fetchone()
   if not row:continue
   local,source,overrides=map(json.loads,row);actual={**source,**overrides};target=ref['target']
   fields=['Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)'] if target=='camara' else ['Presidente - Telefone / Celular','Presidente - WhatsApp']
   import app
   current=set(n for f in fields for n in app.phone_numbers(actual.get(f,'')))|set(n for n in local.get('whatsapp_links',{}).get(target,{}) if n)
   if number not in current:continue
   statuses=local.setdefault('phone_status',{}).setdefault(target,{})
   previous=statuses.get(number,{})
   if previous.get('whatsapp_verified') is True and previous.get('verification_method')!='api':continue
   if previous.get('whatsapp_verified') is True and value['state']!='confirmed':revoked.append((ref['key'],target))
   statuses[number]={**previous,'whatsapp_verified':value['state']=='confirmed','verification_state':value['state'],'verification_method':'manual-reused' if value.get('provider')=='manual' else 'api','provider':value.get('provider'),'checked_at':value.get('checked_at'),'verification_message':value.get('message','')}
   db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),ref['key']))
 for key,target in revoked:
  import whatsapp_send126
  whatsapp_send126.revoke(store,key,target,number)
def parse_results(data,numbers,provider):
 rows=data if isinstance(data,list) else data.get('numbers') if isinstance(data,dict) else None
 if not isinstance(rows,list):raise ValueError('Resposta inesperada: lista de resultados ausente.')
 result={}
 for row in rows:
  if not isinstance(row,dict):continue
  number=str(row.get('inputPhone') if provider=='zapi' else row.get('number') or '')
  if number not in numbers:continue
  if number in result:result[number]=None;continue
  result[number]=row if type(row.get('exists')) is bool and not row.get('error') and not row.get('reason') else None
 return result
def process_pending(store):
 c=config(store)
 if not c['enabled']:return 0
 with store.whatsapp_config_lock:
  c=config(store)
  if not c['enabled']:return 0
  with store.connect() as db:values=[json.loads(v) for v, in db.execute('SELECT value FROM whatsapp_checks')]
  ready=[v for v in values if v['state'] in ('pending','inconclusive') and v.get('attempts',0)<3 and v.get('next_attempt',0)<=time.time()][:c['batch_size']]
  if not ready:return 0
  numbers=[v['number'] for v in ready]
  try:
   connection(store,c)
   refs=phone_inventory(store)
   for v in ready:v['state']='running';persist(store,v)
   body={'numbers':numbers} if c['provider']=='evolution' else {'phones':numbers}
   path='/chat/whatsappNumbers/'+quote(c['instance'],safe='') if c['provider']=='evolution' else prefix(store,c)+'/phone-exists-batch'
   data=request(store,c,path,body);results=parse_results(data,numbers,c['provider']);connection(store,c) # disconnect during lookup must remain inconclusive
   for v in ready:
    result=results.get(v['number']);v.update(provider=c['provider'],checked_at=stamp(),attempts=v.get('attempts',0)+1)
    if result is None:v.update(state='inconclusive',message='Telefone ausente ou resultado inconclusivo na resposta.',next_attempt=time.time()+60*(2**v['attempts']))
    else:v.update(state='confirmed' if result['exists'] else 'absent',message='Conta encontrada na consulta.' if result['exists'] else 'Conta não encontrada na consulta.',returned_number=result.get('outputPhone') or result.get('number'),next_attempt=0)
    persist(store,v)
    if v['state'] in ('confirmed','absent'):propagate(store,v['number'],v,refs.get(v['number'],[]))
  except Exception as error:
   message=sanitize(store,error);store.set_setting('whatsapp_connection',{'connected':False,'message':message,'checked_at':stamp()})
   for v in ready:
    if v['state'] in ('confirmed','absent'):continue
    v.update(state='inconclusive',message=message,attempts=v.get('attempts',0)+1,next_attempt=time.time()+60*(2**min(3,v.get('attempts',0)+1)));persist(store,v)
 return len(ready)
def persist(store,value):
 with store.lock,store.connect() as db:db.execute('INSERT OR REPLACE INTO whatsapp_checks VALUES (?,?)',(value['number'],json.dumps(value,ensure_ascii=False)))
def reset(store,number):
 import app
 number=app.normalize_phone(number)
 with store.lock,store.connect() as db:
  row=db.execute('SELECT value FROM whatsapp_checks WHERE number=?',(number,)).fetchone()
  if not row:raise ValueError('Número ainda não está na fila.')
  value=json.loads(row[0]);value.update(state='pending',attempts=0,next_attempt=0);db.execute('UPDATE whatsapp_checks SET value=? WHERE number=?',(json.dumps(value,ensure_ascii=False),number))
 store.whatsapp_wake.set();return {'ok':True}
def initialize(store):
 with store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS whatsapp_checks (number TEXT PRIMARY KEY,value TEXT NOT NULL)')
  for number,value in db.execute('SELECT number,value FROM whatsapp_checks'):
   v=json.loads(value)
   if v['state']=='running':v.update(state='pending',message='Retomada após reinício.');db.execute('UPDATE whatsapp_checks SET value=? WHERE number=?',(json.dumps(v,ensure_ascii=False),number))
 store.whatsapp_stop=threading.Event();store.whatsapp_wake=threading.Event();store.whatsapp_config_lock=threading.RLock()
 def loop():
  last_scan=0
  while not store.whatsapp_stop.is_set():
   try:
    c=config(store)
    if c['enabled']:
     if c['automatic'] and time.time()-last_scan>30:enqueue(store);last_scan=time.time()
     process_pending(store)
   except Exception as e:
    try:store.set_setting('whatsapp_connection',{'connected':False,'message':sanitize(store,e),'checked_at':stamp()})
    except Exception:pass
   store.whatsapp_wake.wait(config(store)['interval']);store.whatsapp_wake.clear()
 # Start only for the actual application, not for incidental Store copies/tests.
 store.whatsapp_worker=None
 def start_worker():
  if store.whatsapp_worker and store.whatsapp_worker.is_alive():return
  store.whatsapp_worker=threading.Thread(target=loop,daemon=True);store.whatsapp_worker.start()
 store.start_whatsapp_worker=start_worker
