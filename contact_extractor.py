import editing_activity
import chamber_api
import ai_navigator
import extractor_prompt
"""Integra o motor de contatos fornecido pelo usuário ao banco do JP Minato."""
import atexit,hashlib,json,os,re,secrets,shutil,subprocess,threading,time,queue,sqlite3,functools,urllib.request,urllib.error
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse
DEFAULTS={'concurrency':2,'interval':1.0,'request_timeout':7,'municipality_timeout':240,'max_requests':35,'use_ai':False,'model':'gemini-2.5-flash','provider':'openai','openai_model':'gpt-4.1-mini','reference_year':2026,'ai_steps':8,'ai_pages':10}
def stamp():return datetime.now().astimezone().isoformat(timespec='seconds')
def real(value):return bool(str(value or '').strip()) and not re.match(r'^(não|nao)\s+(identificad|informad|dispon|encontrad)|^sem\s+(site|contato)|^footer_verified',str(value).strip(),re.I)
def website(value):
 value=str(value or '').strip()
 if not real(value):return ''
 if not re.match(r'^https?://',value,re.I):value='https://'+value
 try:
  u=urlparse(value)
  return value if u.scheme in ('http','https') and u.hostname and '.' in u.hostname and not u.username and not u.password else ''
 except ValueError:return ''
def host(value):return (urlparse(value).hostname or '').lower().removeprefix('www.')
class Engine:
 def __init__(self,store):
  self.store=store;self.root=Path(__file__).resolve().parent/'contatos-extrator';self.folder=store.folder/'extrator-contatos';self.lock=threading.RLock();self.process=None;self.port=None;self.token=None;self.signature=None;self.reader=None;self.extra_env={};atexit.register(self.close)
 def close(self):
  with self.lock:
   if self.process and self.process.poll() is None:
    self.process.terminate()
    try:self.process.wait(timeout=3)
    except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=3)
   if self.process:
    if self.reader and self.reader.is_alive():self.reader.join(timeout=1)
    if self.process.stdout:self.process.stdout.close()
   self.process=None;self.port=None
 def available(self):
  node=shutil.which('node');deps=all((self.root/'node_modules'/x).exists() for x in ['express','cheerio','@google/genai'])
  return {'node_available':bool(node),'dependencies_available':deps,'ready':bool(node and deps),'running':bool(self.process and self.process.poll() is None),'installation_script':'INSTALAR_EXTRATOR.bat'}
 def ensure(self,config):
  with self.lock:
   available=self.available()
   if not available['node_available']:raise ValueError('Instale Node.js 22 ou superior e abra o JP Minato novamente.')
   if not available['dependencies_available']:raise ValueError('Execute INSTALAR_EXTRATOR.bat uma vez para instalar o motor de contatos.')
   node=shutil.which('node');version=subprocess.run([node,'-p','process.versions.node'],capture_output=True,text=True,timeout=5,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).stdout.strip()
   if not version or int(version.split('.')[0])<22:raise ValueError('O extrator requer Node.js 22 ou superior.')
   key=self.store.setting('contact_extractor_key','');signature=hashlib.sha256(json.dumps([config,key],sort_keys=True).encode()).hexdigest()
   if self.process and self.process.poll() is None and signature==self.signature:return
   self.close();self.folder.mkdir(parents=True,exist_ok=True)
   for name in ['developer-signatures.json','developer-extraction-rules.json']:
    if not (self.folder/name).exists():shutil.copy2(self.root/name,self.folder/name)
   self.token=secrets.token_hex(32);env=dict(os.environ,JP_ENGINE_TOKEN=self.token,JP_ENGINE_DATA=str(self.folder.resolve()),JP_ENGINE_PORT='0',JP_USE_AI='1' if config['use_ai'] else '0',JP_GEMINI_MODEL=config['model'],JP_REQUEST_TIMEOUT=str(config['request_timeout']),GEMINI_API_KEY=key,**self.extra_env)
   # Não herdar o relaxamento global de TLS do projeto original.
   env.pop('NODE_TLS_REJECT_UNAUTHORIZED',None)
   self.process=subprocess.Popen([node,str(self.root/'engine.cjs')],cwd=self.root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));ready=queue.Queue()
   def drain(process):
    for line in process.stdout:
     if line.startswith('JP_ENGINE_READY '):
      try:ready.put(json.loads(line.split(' ',1)[1])['port'])
      except (ValueError,KeyError):pass
   self.reader=threading.Thread(target=drain,args=(self.process,),daemon=True);self.reader.start()
   try:self.port=ready.get(timeout=12)
   except queue.Empty:self.close();raise ValueError('Não foi possível iniciar o motor. Execute INSTALAR_EXTRATOR.bat e confira Node.js 22+.')
   self.signature=signature
 def call(self,path,body=None,config=None,method=None):
  config=config or settings(self.store);self.ensure(config);raw=json.dumps(body).encode() if body is not None else None
  request=urllib.request.Request('http://127.0.0.1:'+str(self.port)+path,data=raw,headers={'Content-Type':'application/json','X-Engine-Token':self.token},method=method)
  try:
   with urllib.request.urlopen(request,timeout=config['municipality_timeout']+65) as response:data=json.load(response)
  except urllib.error.HTTPError as error:
   try:message=json.load(error).get('error','Erro do motor')
   except Exception:message='Erro do motor HTTP '+str(error.code)
   raise ValueError(message)
  except (urllib.error.URLError,TimeoutError):raise ValueError('O motor não respondeu no prazo. Confira a conexão e tente novamente.')
  if data.get('success') is False:raise ValueError(data.get('error','Falha do extrator'))
  return data

def settings(store):
 saved=store.setting('contact_extractor_config',{});config={**DEFAULTS,**saved}
 if 'provider' not in saved and saved.get('use_ai') and store.setting('contact_extractor_key',''):config['provider']='gemini'
 return config
def public_config(store):return {'config':settings(store),'key_present':bool(store.setting('contact_extractor_openai_key','') if settings(store)['provider']=='openai' else store.setting('contact_extractor_key','')),'key_present_by_provider':{'openai':bool(store.setting('contact_extractor_openai_key','')),'gemini':bool(store.setting('contact_extractor_key',''))},'engine':store.contact_engine.available(),'jobs':jobs(store),'rules_path':str(store.contact_engine.folder.resolve())}
def save_settings(store,body):
 if any(j['status']=='running' for j in jobs(store)):raise ValueError('Aguarde ou cancele a fila antes de alterar a configuração.')
 config={k:body.get(k,settings(store)[k]) for k in DEFAULTS}
 for key,lo,hi in [('concurrency',1,4),('request_timeout',2,20),('municipality_timeout',30,600),('max_requests',5,100),('ai_steps',2,12),('ai_pages',1,20)]:
  value=int(config[key]);
  if not lo<=value<=hi:raise ValueError('Valor fora do limite: '+key)
  config[key]=value
 config['interval']=float(config['interval'])
 if not 0<=config['interval']<=30:raise ValueError('Intervalo deve ficar entre 0 e 30 segundos.')
 config['reference_year']=int(config['reference_year'])
 if not 2000<=config['reference_year']<=2100:raise ValueError('Ano de referência inválido.')
 if config['provider'] not in ('openai','gemini'):raise ValueError('Provedor inválido.')
 config['openai_model']=str(config['openai_model']).strip()
 if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}',config['openai_model']):raise ValueError('Modelo OpenAI inválido.')
 config['use_ai']=config['use_ai'] is True;config['model']=str(config['model']).strip()
 if not re.fullmatch(r'gemini-[a-zA-Z0-9.\-]{1,80}',config['model']):raise ValueError('Identificador de modelo Gemini inválido.')
 key_setting='contact_extractor_openai_key' if config['provider']=='openai' else 'contact_extractor_key'
 api_key=str(body.get('api_key','')).strip()
 if config['use_ai'] and not api_key and not store.setting(key_setting,''):raise ValueError('Informe a chave do provedor selecionado ou use o modo sem IA.')
 if api_key:store.set_setting(key_setting,api_key)
 if body.get('clear_key'):
  if config['use_ai']:raise ValueError('Desative a IA antes de remover a chave.')
  store.set_setting(key_setting,'')
 store.set_setting('contact_extractor_config',config);return {'ok':True}
def jobs(store,full=False):
 with store.connect() as db:rows=db.execute('SELECT value FROM contact_jobs ORDER BY rowid DESC LIMIT 12').fetchall()
 out=[]
 for row in rows:
  job=json.loads(row[0]);items=job['items'];counts={state:sum(x['state']==state for x in items) for state in ['pending','running','done','error','candidate','cancelled','interrupted','partial','no_data']};job['counts']=counts;job['total']=len(items)
  if not full:job.pop('items',None)
  out.append(job)
 return out
def job(store,job_id):
 with store.connect() as db:r=db.execute('SELECT value FROM contact_jobs WHERE id=?',(job_id,)).fetchone()
 if not r:raise ValueError('Fila não encontrada.')
 return json.loads(r[0])
def error_message(store,error):
 message=str(error)[:1000];key=store.setting('contact_extractor_key','')
 openai_key=store.setting('contact_extractor_openai_key','')
 if openai_key:message=message.replace(openai_key,'[chave ocultada]')
 return message.replace(key,'[chave ocultada]') if key else message

def retry_database(fn):
 @functools.wraps(fn)
 def wrapped(*args,**kwargs):
  for attempt in range(3):
   try:return fn(*args,**kwargs)
   except sqlite3.OperationalError as error:
    if getattr(error,'sqlite_errorcode',None) not in (sqlite3.SQLITE_BUSY,sqlite3.SQLITE_LOCKED) and 'locked' not in str(error).lower():raise
    if attempt==2:raise
    time.sleep(.15*(attempt+1))
 return wrapped

@retry_database
def update_job(store,job_id,modify):
 with store.lock,store.connect() as db:
  value=json.loads(db.execute('SELECT value FROM contact_jobs WHERE id=?',(job_id,)).fetchone()[0]);modify(value);db.execute('UPDATE contact_jobs SET value=? WHERE id=?',(json.dumps(value,ensure_ascii=False),job_id))
 return value
def initialize(store):
 with store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS contact_jobs (id TEXT PRIMARY KEY,value TEXT NOT NULL)')
  for jid,value in db.execute('SELECT id,value FROM contact_jobs').fetchall():
   j=json.loads(value)
   if j['status']=='error':
    changed=False
    for row in j['items']:
     if row['state'] in ('pending','running'):row.update(state='interrupted',message='Fila interrompida: '+str(j.get('error','Erro anterior.'))[:500]);changed=True
    if changed:db.execute('UPDATE contact_jobs SET value=? WHERE id=?',(json.dumps(j,ensure_ascii=False),jid))
   if j['status']=='running':
    j['status']='interrupted';j['finished_at']=stamp()
    for x in j['items']:
     if x['state'] in ('pending','running'):x['state']='interrupted';x['message']='Aplicativo encerrado durante a fila.'
    db.execute('UPDATE contact_jobs SET value=? WHERE id=?',(json.dumps(j,ensure_ascii=False),jid))
 store.contact_engine=Engine(store);store.contact_cancel={}
 apply_saved_search_results(store)
def apply_saved_search_results(store):
 with store.connect() as db:
  old_jobs=[json.loads(v) for v, in db.execute('SELECT value FROM contact_jobs')]
 search_keys={row['key'] for j in old_jobs if j.get('mode')=='search' for row in j.get('items',[]) if row.get('state')=='candidate'}
 for item in store.items():
  candidate_value=item['local'].get('extractor',{}).get('candidate')
  if item['key'] not in search_keys or not candidate_value or candidate_value.get('source')=='motor':continue
  edited=item['local'].get('website_manual_at') or (item['local'].get('updated_at') if 'Website Câmara' in item['overrides'] else None)
  try:
   if edited and datetime.fromisoformat(edited).astimezone()>datetime.fromisoformat(candidate_value['timestamp']).astimezone():continue
  except (ValueError,KeyError):continue
  accept_candidate(store,item['key'],candidate_value['id'],automatic=True)
  for j in old_jobs:
   if j.get('mode')!='search':continue
   def revise(job):
    for row in job['items']:
     if row['key']==item['key'] and row['state']=='candidate':row.update(state='done',message='Site encontrado anteriormente e salvo automaticamente.')
   update_job(store,j['id'],revise)

def website_pending(x):
 if not website(x['fields'].get('Website Câmara')):return True
 state=x['local'].get('extractor',{}).get('website_state')
 if state in ('unresolved','candidate','error'):return True
 if state=='valid':return False
 return x['fields'].get('Status Extração') in ('Erro','Pendente') or bool(re.search(r'invalid|inválid|unresolved|não encontrado',str(x['fields'].get('Validação Website','')),re.I))
def invalid_keys(items):return [x['key'] for x in items if website_pending(x)]
@retry_database
def extraction_state(store,key,state,message='',**extra):
 with store.lock,store.connect() as db:
  r=db.execute('SELECT source,local FROM municipalities WHERE key=?',(key,)).fetchone()
  if not r:return
  source,local=map(json.loads,r);state_data=local.setdefault('extractor',{});state_data.update({'state':state,'message':message,'processed_at':stamp(),**extra});source['Status Extração']='Concluído' if state=='done' else 'Erro' if state=='error' else 'Pendente';db.execute('UPDATE municipalities SET source=?,local=? WHERE key=?',(json.dumps(source,ensure_ascii=False),json.dumps(local,ensure_ascii=False),key))
FIELDS={'presidenteNome':'Presidente Atual (Nome)','presidentePartido':'Presidente - Partido','presidenteTelefone':'Presidente - Telefone / Celular','presidenteWhatsapp':'Presidente - WhatsApp','presidenteEmail':'Presidente - Email','presidentePerfilUrl':'Presidente - URL Perfil','presidentePeriodo':'Presidente - Período Mandato','camaraTelefoneSite':'Telefones Coletados no Site','camaraWhatsapp':'WhatsApp(s) da Câmara (Botões/Links)','camaraEmail':'Email Geral da Câmara','camaraEndereco':'Endereço da Câmara','desenvolvedorPlataforma':'Desenvolvedor / Plataforma','mesaDiretoraUrl':'URL Mesa Diretora','contatoUrl':'URL Contato'}
def phone_parts(value):
 result=[]
 for match in re.finditer(r'(?<!\d)(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}(?!\d)',str(value or '')):
  digits=re.sub(r'\D','',match.group())
  if len(digits) in (12,13) and digits.startswith('55'):digits=digits[2:]
  if len(digits) in (10,11):result.append((digits,match.group().strip()))
 return result

def merge_text(old,new,phone=False):
 entries=[str(x).strip() for x in new] if isinstance(new,list) else [str(new).strip()]
 old=str(old or '').strip() if real(old) else ''
 known={k for k,v in phone_parts(old)} if phone else set()
 for entry in entries:
  if not real(entry):continue
  parts=phone_parts(entry) if phone else []
  if parts:
   for key,value in parts:
    if key not in known:old+=(('; ' if old else '')+value);known.add(key)
  elif entry.casefold() not in old.casefold():old+=(('; ' if old else '')+entry)
 return old

def apply_result(store,key,data):
 if not website(data.get('origemDados') or data.get('websiteUsado')):raise ValueError('Nenhuma página atual acessível. Os contatos anteriores foram preservados.')
 with store.lock,store.connect() as db:
  row=db.execute('SELECT source,overrides,local FROM municipalities WHERE key=?',(key,)).fetchone()
  if not row:raise ValueError('Município removido.')
  source,overrides,local=map(json.loads,row);changed=[]
  if data.get('coletaProtocolo')=='2026-v1' and data.get('presidentWrite',True):
   presidential={f:data.get(k) or '' for k,f in FIELDS.items() if k.startswith('presidente')}
   old={f:{**source,**overrides}.get(f,'') for f in presidential}
   chamber_values={kind:set() for kind in ('email','phone')}
   for f in ('Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)','Email Geral da Câmara'):
    kind='email' if 'Email' in f else 'phone'
    for v in chamber_api.values({**source,**overrides}.get(f,'')):
     identity=chamber_api.identity(kind,v)
     if identity:chamber_values[kind].add(identity)
   for incoming,f in [('presidenteTelefone','Presidente - Telefone / Celular'),('presidenteWhatsapp','Presidente - WhatsApp'),('presidenteEmail','Presidente - Email')]:
    kind='email' if 'Email' in f else 'phone';kept=[]
    for value in chamber_api.values(presidential[f]):
     if value and chamber_api.identity(kind,value) in chamber_values[kind]:
      if chamber_api.DUPLICATE not in data['observacoes']:data['observacoes'].append(chamber_api.DUPLICATE)
     elif value:kept.append(value)
    presidential[f]='; '.join(kept);data[incoming]=presidential[f] or None
   data['notas']='; '.join(data['observacoes'])
   if old!=presidential and any(old.values()):local.setdefault('president_extraction_history',[]).append({'timestamp':stamp(),'previous':old,'year':data['anoReferencia']})
   allowed_numbers={chamber_api.phone(v) for f in ('Presidente - Telefone / Celular','Presidente - WhatsApp') for v in chamber_api.values(presidential[f]) if chamber_api.phone(v)}
   for container in ('phone_status','whatsapp_links'):
    if container in local:local[container]['presidente']={n:v for n,v in local[container].get('presidente',{}).items() if n in allowed_numbers}
   for f,value in presidential.items():
    if {**source,**overrides}.get(f,'')!=value:changed.append(f)
    source[f]=value;overrides.pop(f,None)
   local['presidency_validation']={'confirmed':data['presidenciaConfirmada'],'mode':data.get('presidenciaModo','confirmed' if data['presidenciaConfirmada'] else 'pending'),'year':data['anoReferencia'],'evidence':data.get('presidenciaEvidencia'),'observacoes':data['observacoes'],'checked_at':stamp(),'decision':data.get('presidenciaDiagnostico')}

  for incoming,field in FIELDS.items():
   if data.get('coletaProtocolo')=='2026-v1' and incoming.startswith('presidente'):continue
   value=data.get(incoming)
   if value is None:continue
   text='; '.join(str(x) for x in value) if isinstance(value,list) else str(value)
   if not real(text):continue
   if field=='Presidente - Email':
    text=editing_activity.extracted_email(value)
    if not text:continue
    overrides.pop(field,None)
   elif any(term in field for term in ['Telefone','WhatsApp','Email']):text=merge_text(source.get(field,''),value,phone='Email' not in field)
   text=text[:5000]
   if source.get(field)!=text:source[field]=text;changed.append(field)
  state=local.setdefault('extractor',{});state.update({'state':'done','processed_at':stamp(),'message':str(data.get('notas',''))[:2000],'ai_used':bool(data.get('aiUsed')),'ai_message':str(data.get('aiMessage',''))[:300],'confidence':data.get('confianca',''),'origin':data.get('origemDados'),'visited':data.get('network',{}).get('visited',[])[:100],'network_failures':data.get('network',{}).get('failures',[])[:10],'changed_fields':changed,'preserved_fields':[f for f in changed if f in overrides],'website_state':'valid'})
  navigation=data.get('navigation')
  if navigation:
   terminal={'complete':'done','partial':'partial','no_data':'no_data','error':'error'}.get(navigation['status'],'partial')
   state.update(state=terminal,navigation=navigation,message=navigation.get('stop_reason',''),website_state='valid' if state['visited'] else 'error')
  source['Status Extração']=('Concluído' if state['state']=='done' else 'Erro' if state['state']=='error' else 'Pendente');source['Nível de Confiança']=data.get('confianca','');source['Notas da Extração']=str(data.get('notas',''))[:5000];source['Fonte / Páginas Analisadas']='; '.join(data.get('network',{}).get('visited',[]) or [data.get('origemDados','')]);source['Data da Extração']=stamp();source['Mensagem de Erro']=str(data.get('aiMessage','')) if navigation else '';source['Validação Website']='Site acessível no momento da extração' if state['visited'] else 'Site não lido nesta execução'
  if data.get('mesaDiretora'):source['Mesa Diretora Completa']=json.dumps(data['mesaDiretora'],ensure_ascii=False)
  db.execute('UPDATE municipalities SET source=?,overrides=?,local=? WHERE key=?',(json.dumps(source,ensure_ascii=False),json.dumps(overrides,ensure_ascii=False),json.dumps(local,ensure_ascii=False),key))
 return {'changed_fields':changed,'preserved_fields':[f for f in changed if f in overrides]}
def candidate(store,key,result):
 url=website(result.get('resolvedUrl'))
 if not url:raise ValueError('O motor não retornou endereço válido.')
 value={'url':url,'source':result.get('source','motor'),'message':result.get('message','Confira o endereço encontrado.'),'timestamp':stamp(),'id':secrets.token_hex(12),'query':result.get('queryUsed','')}
 extraction_state(store,key,'candidate',value['message'],website_state='candidate',candidate=value);return value

def accept_candidate(store,key,candidate_id,automatic=False):
 with store.lock,store.connect() as db:
  row=db.execute('SELECT source,overrides,local FROM municipalities WHERE key=?',(key,)).fetchone()
  if not row:raise ValueError('Município não encontrado.')
  source,overrides,local=map(json.loads,row);value=local.get('extractor',{}).get('candidate')
  if not value or value['id']!=candidate_id:raise ValueError('O endereço sugerido mudou. Atualize o painel.')
  # Aceitação explícita do usuário é uma correção manual e prevalece nas importações.
  previous={**source,**overrides}.get('Website Câmara','');source.setdefault('Website Câmara','');overrides['Website Câmara']=value['url'];
  if not automatic and previous!=value['url']:editing_activity.mark(local)
  local.setdefault('site_changes',[]).append({'previous':previous,'url':value['url'],'source':value.get('source'),'timestamp':stamp(),'method':'automatic' if automatic else 'manual'})
  local['extractor'].update({'website_state':'valid','state':'done','message':'Site encontrado e salvo automaticamente.' if automatic else 'Site conferido e aceito manualmente.','accepted_site':{**value,'method':'automatic' if automatic else 'manual'}});local['extractor'].pop('candidate',None)
  db.execute('UPDATE municipalities SET source=?,overrides=?,local=? WHERE key=?',(json.dumps(source,ensure_ascii=False),json.dumps(overrides,ensure_ascii=False),json.dumps(local,ensure_ascii=False),key))
 return {'ok':True}

def start(store,keys,mode,label):
 if mode not in ('extract','search'):raise ValueError('Modo de extração inválido.')
 if not isinstance(keys,list) or not keys:raise ValueError('Escolha pelo menos um município.')
 keys=list(dict.fromkeys(keys));items={x['key']:x for x in store.items()}
 if any(k not in items for k in keys):raise ValueError('Há município inexistente na seleção.')
 with store.lock:
  if any(j['status']=='running' for j in jobs(store)):raise ValueError('Há uma fila em andamento. Aguarde ou cancele antes de iniciar outra.')
  config=settings(store);store.contact_engine.ensure(config);jid=secrets.token_hex(12);event=threading.Event();store.contact_cancel[jid]=event
  value={'id':jid,'mode':mode,'label':str(label)[:200],'created_at':stamp(),'status':'running','cancel_requested':False,'items':[{'key':k,'name':items[k]['fields']['Município'],'uf':items[k]['fields']['UF'],'state':'pending','message':''} for k in keys]}
  with store.connect() as db:db.execute('INSERT INTO contact_jobs VALUES (?,?)',(jid,json.dumps(value,ensure_ascii=False)))
 def execute(key):
  if event.wait(config['interval']):return {'state':'cancelled','message':'Cancelado antes de iniciar.'}
  update_job(store,jid,lambda j:next(x for x in j['items'] if x['key']==key).update(state='running'))
  try:
   item=store.item(key);f=item['fields'];original=website(f.get('Website Câmara'));body={'municipio':f['Município'],'uf':f['UF'],'website':original,'telefoneOriginal':f.get('Telefone Planilha Original',''),'maxRequests':config['max_requests'],'deadlineSeconds':config['municipality_timeout'],'referenceYear':config['reference_year'],'evidenceOnly':config['provider']=='openai' or not config['use_ai']}
   if mode=='search':
    result=store.contact_engine.call('/api/validate-url',{**body,'forceGoogleSearch':False},config)['data']
    if not result.get('valid'):raise ValueError(result.get('message','Site não localizado.'))
    if result.get('source')=='existing_verified' and original and host(original)==host(result['resolvedUrl']):extraction_state(store,key,'done',result.get('message','Site ativo.'),website_state='valid');return {'state':'done','message':'Site atual validado.'}
    latest=store.item(key)
    if latest['local'].get('website_manual_at')!=item['local'].get('website_manual_at') and latest['fields'].get('Website Câmara')!=f.get('Website Câmara'):
     extraction_state(store,key,'done','Edição recente do site preservada.',website_state='valid');return {'state':'done','message':'Edição recente do site preservada.'}
    suggestion=candidate(store,key,result);accept_candidate(store,key,suggestion['id'],automatic=True);return {'state':'done','message':'Site encontrado e salvo: '+suggestion['url']}
   if config['provider']=='openai' and config['use_ai']:
    def progress(message,navigation):
     extraction_state(store,key,'running',message,navigation=navigation,ai_used=bool(navigation.get('responses')),ai_message='')
     update_job(store,jid,lambda j:next(x for x in j['items'] if x['key']==key).update(message=message))
    result=ai_navigator.collect_site(store,item,config,event,progress)
    if event.is_set():return {'state':'cancelled','message':'Cancelado. Nenhum resultado desta execução foi aplicado.'}
    summary=apply_result(store,key,result);nav=result['navigation'];accepted=result.get('presidenciaAceita',False)
    personal=bool(result.get('presidenteTelefone') or result.get('presidenteEmail') or result.get('presidenteWhatsapp'))
    message=f"{len(summary['changed_fields'])} campos atualizados · {nav['api_calls']} chamadas IA · {len(nav['pages'])} páginas tentadas. "
    message+=('Presidente identificado'+(' com contato próprio. ' if personal else '; contato próprio não encontrado. ')) if accepted else 'Presidente não identificado/aceito. '
    message+=nav['stop_reason']
    return {'state':{'complete':'done','partial':'partial','no_data':'no_data','error':'error'}.get(nav['status'],'partial'),'message':message[:1500]}
   result=store.contact_engine.call('/api/extract-single',body,config)['data'];resolved=website(result.get('origemDados') or result.get('websiteUsado'))
   if not resolved:raise ValueError('Não foi possível acessar páginas atuais. Use Buscar sites inválidos no Google.')
   if not original or host(original)!=host(resolved):suggestion=candidate(store,key,{'resolvedUrl':resolved,'source':'motor','message':'O motor encontrou outro site. Confira o município antes de atualizar contatos.'});return {'state':'candidate','message':suggestion['url']}
   result=chamber_api.collect(store,item,result,config)
   summary=apply_result(store,key,result);return {'state':'done','message':str(len(summary['changed_fields']))+' campos atualizados; '+str(len(summary['preserved_fields']))+' correções manuais preservadas.'+(' IA indisponível: usadas regras do site.' if config['use_ai'] and not result.get('aiUsed') else '')}
  except ai_navigator.Cancelled:
   extraction_state(store,key,'cancelled','Cancelado. Nenhum resultado desta execução foi aplicado.')
   return {'state':'cancelled','message':'Cancelado. Nenhum resultado desta execução foi aplicado.'}
  except Exception as error:
   message=error_message(store,error)
   extraction_state(store,key,'error',message,website_state='error');return {'state':'error','message':message}
 def worker():
  try:
   with ThreadPoolExecutor(max_workers=config['concurrency']) as pool:
    remaining=iter(keys);active={}
    for _ in range(config['concurrency']):
     key=next(remaining,None)
     if key is not None:active[pool.submit(execute,key)]=key
    while active:
     future=next(as_completed(active));key=active.pop(future)
     try:result=future.result()
     except Exception as error:result={'state':'error','message':error_message(store,error)}
     update_job(store,jid,lambda j:next(x for x in j['items'] if x['key']==key).update(**result))
     if not event.is_set():
      nxt=next(remaining,None)
      if nxt is not None:active[pool.submit(execute,nxt)]=nxt
    def finish(j):
     j.update(status='cancelled' if event.is_set() else 'done',finished_at=stamp())
     if event.is_set():
      for x in j['items']:
       if x['state']=='pending':x.update(state='cancelled',message='Cancelado antes de iniciar.')
    update_job(store,jid,finish)
  except Exception as error:
   message=error_message(store,error)
   def failed(j):
    j.update(status='error',error=message,finished_at=stamp())
    for row in j['items']:
     if row['state'] in ('pending','running'):row.update(state='interrupted',message='Fila interrompida: '+message)
   update_job(store,jid,failed)
  finally:store.contact_cancel.pop(jid,None)
 threading.Thread(target=worker,daemon=True).start();return {'job':jid,'total':len(keys)}
def resume(store,jid):
 previous=job(store,jid)
 if previous['status']=='running':raise ValueError('A fila ainda está em andamento.')
 keys=[row['key'] for row in previous['items'] if row['state'] in ('pending','running','interrupted','cancelled')]
 if not keys:raise ValueError('Nenhum município não processado nesta fila.')
 return start(store,keys,previous['mode'],'Retomada · '+previous['label'])

def cancel(store,jid):
 event=store.contact_cancel.get(jid)
 if not event:raise ValueError('Esta fila não está em andamento.')
 event.set();update_job(store,jid,lambda j:j.update(cancel_requested=True));return {'ok':True,'message':'Pendentes cancelados; requisições já iniciadas terminam no limite configurado.'}

def rules(store):
 store.contact_engine.folder.mkdir(parents=True,exist_ok=True);result={}
 for name in ['developer-signatures.json','developer-extraction-rules.json']:
  path=store.contact_engine.folder/name
  if not path.exists():shutil.copy2(store.contact_engine.root/name,path)
  result[name]=json.loads(path.read_text('utf-8'))
 return result

def save_rules(store,body):
 if any(j['status']=='running' for j in jobs(store)):raise ValueError('Aguarde a fila antes de alterar regras.')
 current=rules(store)
 for name in current:
  value=body.get(name,current[name])
  if not isinstance(value,list) or len(value)>300 or any(not isinstance(x,dict) for x in value):raise ValueError('As regras devem ser uma lista de objetos (até 300).')
  if any(not str(x.get('id','')).strip() or not str(x.get('developer','')).strip() for x in value):raise ValueError('Cada regra precisa de id e developer.')
  if len({x['id'] for x in value})!=len(value):raise ValueError('Há identificadores repetidos nas regras.')
  current[name]=value
 for name,value in current.items():
  target=store.contact_engine.folder/name;temp=target.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8');temp.replace(target)
 return {'ok':True}
