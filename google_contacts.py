"""Agenda Google: OAuth local, identidade persistente e atualização com revisão."""
import base64,csv,hashlib,io,json,os,re,secrets,threading,time,urllib.request,urllib.error,webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler,HTTPServer
from urllib.parse import urlencode,urlparse,parse_qs,quote

FIELDS=('names','phoneNumbers','emailAddresses','urls','userDefined')
MASK=','.join((*FIELDS,'metadata'))
SCOPES='https://www.googleapis.com/auth/contacts openid email'
class Uncertain(ValueError):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None

def secret_path(store):return store.folder/'credenciais'/'google-contatos.dpapi'
def secrets_read(store):
 p=secret_path(store)
 if not p.exists():return {}
 raw=p.read_bytes()
 if os.name=='nt':
  from restoration_ai import protect
  raw=protect(raw,True)
 return json.loads(raw)
def secrets_write(store,value):
 raw=json.dumps(value).encode()
 if os.name=='nt':
  from restoration_ai import protect
  raw=protect(raw)
 p=secret_path(store);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix('.tmp')
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'wb') as f:f.write(raw)
 os.replace(tmp,p)
def stamp():return datetime.now().astimezone().isoformat(timespec='seconds')
def public(store):
 return {**store.setting('google_contacts_status',{}),'configured':secret_path(store).exists(),'oauth':store.setting('google_oauth_status',{}),'history':store.setting('google_sync_history',[])[:100]}
def configure(store,body):
 try:c=body['client']['installed']
 except (KeyError,TypeError):raise ValueError('Envie o JSON OAuth do tipo Aplicativo para computador, com People API habilitada.')
 if not str(c.get('client_id','')).endswith('.apps.googleusercontent.com') or not c.get('client_secret'):raise ValueError('Credencial OAuth inválida.')
 if getattr(store,'google_oauth_running',False):raise ValueError('Finalize a autorização em andamento.')
 secrets_write(store,{'client':{'client_id':c['client_id'],'client_secret':c['client_secret']}})
 store.set_setting('google_contacts_status',{'connected':False});return {'ok':True}
def http_json(url,method='GET',body=None,token=None,form=False):
 headers={'Accept':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 data=None
 if body is not None:
  data=(urlencode(body) if form else json.dumps(body)).encode();headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
 try:
  with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,data=data,headers=headers,method=method),timeout=25) as response:
   raw=response.read(16*1024*1024+1)
   if len(raw)>16*1024*1024:raise Uncertain('Resposta Google excedeu o limite.')
   return json.loads(raw)
 except urllib.error.HTTPError as error:
  if error.code>=500 and method!='GET':raise Uncertain('O Google pode ter gravado. Reconcilie antes de repetir.')
  raise ValueError('Google recusou a operação (HTTP '+str(error.code)+'). Confira autorização, People API e possíveis alterações no contato.')
 except (OSError,TimeoutError,json.JSONDecodeError) as error:
  if method!='GET':raise Uncertain('Resposta de gravação incerta. A próxima prévia verificará o identificador no Google antes de repetir.') from error
  raise ValueError('Google indisponível. Nenhum contato foi alterado nesta consulta.') from error
def authorize(store):
 with store.lock:
  if getattr(store,'google_oauth_running',False):raise ValueError('Já há uma autorização em andamento no computador do escritório.')
  secret=secrets_read(store)
  if not secret.get('client'):raise ValueError('Cadastre primeiro o JSON OAuth para computador.')
  state=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(64)
  challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
  class Callback(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    q=parse_qs(urlparse(self.path).query)
    if urlparse(self.path).path!='/oauth' or q.get('state')!=[state]:self.send_error(400);return
    self.server.result=q;self.send_response(200);self.send_header('Content-Type','text/plain; charset=utf-8');self.end_headers();self.wfile.write('Autorização recebida. Pode fechar esta aba e voltar ao JP Minato.'.encode())
  server=HTTPServer(('127.0.0.1',0),Callback);store.google_oauth_running=True;server.timeout=1;redirect='http://127.0.0.1:'+str(server.server_port)+'/oauth'
  url='https://accounts.google.com/o/oauth2/v2/auth?'+urlencode({'client_id':secret['client']['client_id'],'redirect_uri':redirect,'response_type':'code','scope':SCOPES,'access_type':'offline','prompt':'consent select_account','state':state,'code_challenge':challenge,'code_challenge_method':'S256'})
  store.set_setting('google_oauth_status',{'state':'waiting','message':'Autorize no navegador do escritório. Prazo: 5 minutos.'})
 def run():
  try:
   end=time.time()+300
   while not hasattr(server,'result') and time.time()<end:server.handle_request()
   q=getattr(server,'result',{})
   if not q.get('code'):raise ValueError('Autorização cancelada ou expirada. Tente novamente.')
   tokens=http_json('https://oauth2.googleapis.com/token','POST',{'client_id':secret['client']['client_id'],'client_secret':secret['client']['client_secret'],'redirect_uri':redirect,'code':q['code'][0],'grant_type':'authorization_code','code_verifier':verifier},form=True)
   who=http_json('https://openidconnect.googleapis.com/v1/userinfo',token=tokens['access_token'])
   if not who.get('sub') or not who.get('email'):raise ValueError('Não foi possível identificar a conta Google.')
   secret.update(tokens=tokens,expires=time.time()+int(tokens.get('expires_in',3600))-60,account=who['sub'],email=who['email']);secrets_write(store,secret)
   store.set_setting('google_contacts_status',{'connected':True,'account':who['sub'],'email':who['email'],'connected_at':stamp()});store.set_setting('google_oauth_status',{'state':'connected','message':'Conta autorizada.'})
  except Exception as error:store.set_setting('google_oauth_status',{'state':'error','message':str(error)})
  finally:server.server_close();store.google_oauth_running=False
 threading.Thread(target=run,daemon=True).start();webbrowser.open(url);return {'ok':True,'message':'O navegador do escritório foi aberto para autorizar a conta.'}
def access_token(store):
 secret=secrets_read(store)
 if not secret.get('account') or not secret.get('tokens'):raise ValueError('Conecte sua conta Google no computador do escritório.')
 if time.time()>=secret.get('expires',0):
  tokens=http_json('https://oauth2.googleapis.com/token','POST',{'client_id':secret['client']['client_id'],'client_secret':secret['client']['client_secret'],'refresh_token':secret['tokens'].get('refresh_token',''),'grant_type':'refresh_token'},form=True)
  secret['tokens'].update(tokens);secret['expires']=time.time()+int(tokens.get('expires_in',3600))-60;secrets_write(store,secret)
 return secret['tokens']['access_token'],secret['account']
def people(store,path,method='GET',body=None,account=None):
 token,current=access_token(store)
 if account is not None and account!=current:raise ValueError('A conta Google foi alterada. Faça uma nova prévia.')
 return http_json('https://people.googleapis.com/v1/'+path,method,body,token)
def connections(store,account=None):
 result=[];page=''
 while True:
  data=people(store,'people/me/connections?'+urlencode({'personFields':MASK,'pageSize':1000,'pageToken':page,'sources':'READ_SOURCE_TYPE_CONTACT'}),account=account)
  result.extend(data.get('connections',[]));page=data.get('nextPageToken')
  if not page:return result
def clean(person):
 def entry(field,value):
  if field=='names':return {'givenName':value.get('givenName',value.get('displayName','')),'familyName':value.get('familyName',''),**{k:value[k] for k in ('middleName','honorificPrefix','honorificSuffix','phoneticFamilyName','phoneticGivenName','phoneticMiddleName','phoneticHonorificPrefix','phoneticHonorificSuffix','unstructuredName') if k in value}}
  return {k:value[k] for k in ('value','type','key') if k in value}
 return {f:[entry(f,v) for v in person.get(f,[])] for f in FIELDS}
def identities(store,keys):
 import app
 if not isinstance(keys,list) or not keys:raise ValueError('Selecione municípios ou use os filtros atuais.')
 result=[]
 for key in dict.fromkeys(keys):
  item=store.item(key);f=item['fields'];code=item['code'];base='CM '+str(f['Município'])+' '+str(f['UF'])
  for target in ('camara','presidente'):
   name=str(f.get('Presidente Atual (Nome)','')).strip() if target=='presidente' else ''
   if target=='presidente' and not app.useful(name):continue
   identity=code+':camara'
   if target=='presidente':
    with store.lock,store.connect() as db:
     local=json.loads(db.execute('SELECT local FROM municipalities WHERE key=?',(key,)).fetchone()[0])
     if not local.get('president_contact_id'):
      local['president_contact_id']=secrets.token_hex(12);db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),key))
     identity=code+':presidente:'+local['president_contact_id']
   fields=['Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)'] if target=='camara' else ['Presidente - Telefone / Celular','Presidente - WhatsApp']
   phones=set(n for field in fields for n in app.phone_numbers(f.get(field,'')))
   phones.update(n for n in item['local'].get('whatsapp_links',{}).get(target,{}) if n)
   emailfield='Email Geral da Câmara' if target=='camara' else 'Presidente - Email'
   emails=sorted(set(x.lower() for x in re.findall(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',str(f.get(emailfield,'')),re.I)))
   site=str(f.get('Website Câmara' if target=='camara' else 'Presidente - URL Perfil','') or '')
   full=base+(' '+name+' '+str(datetime.now().year) if target=='presidente' else '')
   person={'names':[{'givenName':full}],'phoneNumbers':[{'value':'+'+n,'type':'work'} for n in sorted(phones)],'emailAddresses':[{'value':v,'type':'work'} for v in emails],'urls':[{'value':site,'type':'work'}] if site.startswith(('https://','http://')) else [],'userDefined':[{'key':'JP Minato ID','value':identity}]}
   result.append({'identity':identity,'key':key,'target':target,'name':full,'person':person})
 return result
def new_president(store,key):
 with store.lock,store.connect() as db:
  row=db.execute('SELECT local,source,overrides FROM municipalities WHERE key=?',(key,)).fetchone()
  if not row:raise ValueError('Município não encontrado.')
  local,source,overrides=map(json.loads,row);actual={**source,**overrides}
  personal=('Presidente Atual (Nome)','Presidente - Partido','Presidente - Período Mandato','Presidente - Telefone / Celular','Presidente - WhatsApp','Presidente - Email','Presidente - URL Perfil')
  local.setdefault('president_contact_history',[]).append({'id':local.get('president_contact_id'),'name':actual.get('Presidente Atual (Nome)'),'fields':{f:actual.get(f,'') for f in personal},'timestamp':stamp()})
  for field in personal:source.setdefault(field,'');overrides[field]=''
  local['president_contact_id']=secrets.token_hex(12)
  local.get('phone_status',{}).pop('presidente',None);local.get('whatsapp_links',{}).pop('presidente',None)
  __import__('editing_activity').mark(local)
  db.execute('UPDATE municipalities SET local=?,source=?,overrides=? WHERE key=?',(json.dumps(local,ensure_ascii=False),json.dumps(source,ensure_ascii=False),json.dumps(overrides,ensure_ascii=False),key))
 return {'ok':True}
def csv_export(store,keys):
 records=identities(store,keys);out=io.StringIO(newline='');maxphones=max([len(r['person']['phoneNumbers']) for r in records]+[1]);maxemails=max([len(r['person']['emailAddresses']) for r in records]+[1])
 headers=['Name','Given Name','Notes','Website 1 - Type','Website 1 - Value']
 for label,count in [('Phone',maxphones),('E-mail',maxemails)]:
  for n in range(1,count+1):headers += [f'{label} {n} - Type',f'{label} {n} - Value']
 writer=csv.DictWriter(out,headers);writer.writeheader()
 for r in records:
  p=r['person'];row={'Name':r['name'],'Given Name':r['name'],'Notes':'JP Minato ID: '+r['identity']}
  if p['urls']:row.update({'Website 1 - Type':'Work','Website 1 - Value':p['urls'][0]['value']})
  for field,label in [('phoneNumbers','Phone'),('emailAddresses','E-mail')]:
   for i,v in enumerate(p[field],1):row[f'{label} {i} - Type']='Work';row[f'{label} {i} - Value']=v['value']
  writer.writerow(row)
 return ('\ufeff'+out.getvalue()).encode('utf-8')
def marker(person):return [x.get('value') for x in person.get('userDefined',[]) if x.get('key')=='JP Minato ID']
def signatures(person):
 import app
 return set('p:'+n for v in person.get('phoneNumbers',[]) for n in app.phone_numbers(v.get('value','')))|set('e:'+v.get('value','').lower() for v in person.get('emailAddresses',[]))
def merged(desired,remote,mapping):
 current=clean(remote);desired=clean(desired);oldlocal=mapping.get('local',{});oldremote=mapping.get('remote',{});result={};conflicts=[]
 for field in FIELDS:
  d=desired[field];r=current[field];bl=oldlocal.get(field,[]);br=oldremote.get(field,[])
  if not mapping:result[field]=d if field=='names' else r+[v for v in d if v not in r];continue
  if d==bl:result[field]=r
  elif r==br:result[field]=d
  elif d==r:result[field]=r
  elif field!='names' and all(v in r for v in br):result[field]=[v for v in r if v not in br]+d
  else:conflicts.append(field);result[field]=r
 return result,conflicts
def mappings(store):return store.setting('google_contact_mappings',{})
def prepare(store,keys,progress=lambda *args:None):
 _,account=access_token(store);records=identities(store,keys);allcontacts=connections(store,account);maps=mappings(store).get(account,{})
 plans=[]
 for i,r in enumerate(records):
  progress('Conferindo agenda: '+str(i+1)+' / '+str(len(records)),int((i+1)*100/max(1,len(records))))
  mapping=maps.get(r['identity'],{});matches=[p for p in allcontacts if r['identity'] in marker(p)]
  if mapping.get('resourceName'):matches=[p for p in allcontacts if p.get('resourceName')==mapping['resourceName']] or matches
  entry={**r,'state':'create','candidates':[]}
  if len(matches)>1:entry.update(state='conflict',message='Identificador duplicado no Google. Revise na agenda.')
  elif matches:
   remote=matches[0];value,conflicts=merged(r['person'],remote,mapping)
   entry.update(resourceName=remote['resourceName'],etag=remote.get('etag'),state='conflict' if conflicts else 'unchanged' if value==clean(remote) else 'update',message='Alterações manuais em conflito: '+', '.join(conflicts) if conflicts else '')
  else:
   candidates=[p for p in allcontacts if signatures(p)&signatures(r['person'])]
   if candidates:entry.update(state='conflict',message='Telefone/e-mail já existe. Escolha o contato correto ou mantenha separado.',candidates=[{'resourceName':p['resourceName'],'name':p.get('names',[{}])[0].get('displayName',p['resourceName'])} for p in candidates])
   elif mapping.get('uncertain'):entry.update(state='conflict',message='Criação anterior incerta, ainda sem identificador visível no Google. Aguarde e confira a agenda antes de liberar nova criação.')
   elif mapping.get('resourceName'):entry.update(state='conflict',message='Contato vinculado removido ou indisponível no Google. Revise antes de recriar.')
  plans.append(entry)
 token=secrets.token_hex(24);preview={'id':token,'account':account,'created_at':time.time(),'keys':keys,'items':plans}
 store.set_setting('google_contacts_preview',preview)
 return {'id':token,'items':plans,'counts':{s:sum(x['state']==s for x in plans) for s in ('create','update','unchanged','conflict')}}
def save_mapping(store,account,identity,value):
 with store.lock:
  maps=mappings(store);maps.setdefault(account,{})[identity]=value;store.set_setting('google_contact_mappings',maps)
def apply(store,body,progress=lambda *args:None):
 preview=store.setting('google_contacts_preview',{});_,account=access_token(store)
 if preview.get('id')!=body.get('preview') or preview.get('account')!=account or time.time()-preview.get('created_at',0)>1800:raise ValueError('Prévia expirada. Confira a agenda novamente.')
 lock=getattr(store,'google_sync_lock',None)
 if lock is None:store.google_sync_lock=threading.Lock();lock=store.google_sync_lock
 if not lock.acquire(False):raise ValueError('Sincronização já está em andamento.')
 try:
  desired={r['identity']:r for r in identities(store,preview['keys'])};results=[]
  # Nova consulta reconcilia criações cujo retorno se perdeu.
  allcontacts=connections(store,account)
  for i,r in enumerate(preview['items']):
   progress('Salvando agenda: '+str(i+1)+' / '+str(len(preview['items'])),int((i+1)*100/max(1,len(preview['items']))))
   result={'identity':r['identity'],'name':r['name'],'timestamp':stamp(),'state':'error'}
   try:
    if desired.get(r['identity'],{}).get('person')!=r['person']:raise ValueError('Cadastro mudou depois da prévia. Faça nova conferência.')
    choice=body.get('choices',{}).get(r['identity']);resource=r.get('resourceName')
    if r['state']=='conflict':
     if not choice:result.update(state='conflict',message=r.get('message'));results.append(result);continue
     if choice=='separate' and r.get('candidates'):resource=None
     elif any(c['resourceName']==choice for c in r.get('candidates',[])):resource=choice
     else:raise ValueError('Conflito exige revisão manual na agenda e nova prévia.')
    matches=[p for p in allcontacts if r['identity'] in marker(p)]
    if len(matches)>1:raise ValueError('Identificador duplicado no Google.')
    if matches:resource=matches[0]['resourceName']
    mapping=mappings(store).get(account,{}).get(r['identity'],{})
    if resource:
     remote=people(store,quote(resource,safe='/')+'?'+urlencode({'personFields':MASK,'sources':'READ_SOURCE_TYPE_CONTACT'}),account=account)
     value,conflicts=merged(r['person'],remote,mapping)
     if conflicts:raise ValueError('Mudança manual no Google. Campos em conflito: '+', '.join(conflicts))
     # Etag da prévia não pode autorizar sobrescrita de uma mudança posterior.
     if r.get('etag') and r['etag']!=remote.get('etag') and value!=clean(remote):raise ValueError('Contato mudou no Google após a prévia. Confira novamente.')
     changed=[f for f in FIELDS if value[f]!=clean(remote)[f]]
     if changed:
      payload={**value,'resourceName':resource,'metadata':remote.get('metadata',{}),'etag':remote.get('etag')}
      saved=people(store,quote(resource,safe='/')+':updateContact?'+urlencode({'updatePersonFields':','.join(changed),'personFields':MASK}),'PATCH',payload,account=account);state='updated'
     else:saved=remote;state='unchanged'
    else:
     if mapping.get('uncertain'):raise ValueError('Criação incerta ainda não reconciliada. Não será repetida automaticamente.')
     save_mapping(store,account,r['identity'],{**mapping,'uncertain':True,'attempt_at':stamp()})
     saved=people(store,'people:createContact?'+urlencode({'personFields':MASK}),'POST',r['person'],account=account);state='created'
    if not saved.get('resourceName'):raise Uncertain('Google não devolveu o identificador do contato. Reconcilie na próxima prévia.')
    save_mapping(store,account,r['identity'],{'resourceName':saved['resourceName'],'local':clean(r['person']),'remote':clean(saved),'updated_at':stamp(),'numbers':[n for v in saved.get('phoneNumbers',[]) for n in __import__('app').phone_numbers(v.get('value',''))]})
    result.update(state=state,resourceName=saved['resourceName'])
   except Exception as error:result.update(state='uncertain' if isinstance(error,Uncertain) else 'error',message=str(error))
   results.append(result)
  store.set_setting('google_sync_history',list(reversed(results))+store.setting('google_sync_history',[])[:400])
  store.set_setting('google_contacts_last_sync',stamp())
  return {'items':results,'counts':{s:sum(x['state']==s for x in results) for s in ('created','updated','unchanged','conflict','error','uncertain')}}
 finally:lock.release()
def number_synced(store,ref,number):
 status=store.setting('google_contacts_status',{});account=status.get('account')
 if not status.get('connected'):return False
 ids=identities(store,[ref['key']]);identity=next((r['identity'] for r in ids if r['target']==ref['target']),None)
 return number in mappings(store).get(account,{}).get(identity,{}).get('numbers',[])
