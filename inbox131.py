"""Caixa IMAP central: leitura sem alterar/excluir mensagens no provedor."""
import hashlib,imaplib,json,os,re,secrets,ssl,threading,time
from datetime import datetime
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses,make_msgid
from html.parser import HTMLParser
from pathlib import Path
import municipal_media,operators131,smtp_mail127
DEFAULTS={'host':'','port':993,'username':'','folder':'INBOX','enabled':False,'use_smtp':True,'interval':60}
MAX_BYTES=30*1024*1024
class TextHTML(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.skip+=1
  if tag in ('p','br','div','tr','li'):self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip:self.parts.append(data)
def initialize(store):
 store.inbox_lock=threading.Lock();store.inbox_stop=threading.Event();store.inbox_wake=threading.Event();store.inbox_state_lock=threading.Lock();store.inbox_status={'running':False,'message':'Recebimento ainda não configurado.','last_sync':None}
 with store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS received_mail131 (id TEXT PRIMARY KEY, account TEXT NOT NULL, value TEXT NOT NULL)')
  db.execute('CREATE INDEX IF NOT EXISTS mail_account131 ON received_mail131(account)')
  db.execute('CREATE TABLE IF NOT EXISTS imap_cursor131 (account TEXT PRIMARY KEY, validity TEXT NOT NULL, uid INTEGER NOT NULL)')
def linked_account(store,c):
 c=dict(c)
 if c['use_smtp']:c['username']=str(smtp_mail127.secret_read(store).get('username') or '')
 return c
def credential(store):
 p=store.folder/'credenciais'/'email-imap.dpapi'
 if not p.exists():return linked_account(store,dict(DEFAULTS))
 try:
  raw=p.read_bytes()
  if os.name=='nt':
   from restoration_ai import protect
   raw=protect(raw,True)
  return linked_account(store,{**DEFAULTS,**json.loads(raw)})
 except Exception:raise ValueError('Salve novamente a configuração de recebimento neste usuário do Windows.') from None
def write_credential(store,c):
 raw=json.dumps(c,ensure_ascii=False).encode()
 if os.name=='nt':
  from restoration_ai import protect
  raw=protect(raw)
 p=store.folder/'credenciais'/'email-imap.dpapi';p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name('.imap-'+secrets.token_hex(8))
 try:
  fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'wb') as f:f.write(raw)
  os.replace(tmp,p)
 finally:tmp.unlink(missing_ok=True)
def account(c):return hashlib.sha256((c['host'].lower()+'\n'+c['username'].lower()+'\n'+c['folder']).encode()).hexdigest()[:32]
def connect_config(store,c):
 c=dict(c)
 if c['use_smtp']:
  smtp=smtp_mail127.secret_read(store)
  if not smtp.get('password') or not smtp.get('username'):raise ValueError('Configure primeiro a conta e a senha de envio de e-mail.')
  c['username']=smtp_mail127.email(smtp['username'])
  c['password']=smtp['password']
 if not c.get('password'):raise ValueError('Informe a senha de recebimento ou use a conta SMTP configurada.')
 return c
def public(store):
 error=''
 try:c=credential(store)
 except ValueError as e:c=dict(DEFAULTS);error=str(e)
 with store.inbox_state_lock:state=dict(store.inbox_status)
 values=rows(store,account(c)) if c['username'] else []
 unread=[v for v in values if not v.get('read')]
 counts={}
 for v in unread:
  if v.get('key'):counts[v['key']]=counts.get(v['key'],0)+1
 return {'config':{k:c[k] for k in DEFAULTS},'password_set':bool(c.get('password')),'error':error,'status':state,'unread':len(unread),'by_city':counts,'total':len(values)}
def configure(store,body):
 c={k:body.get(k,v) for k,v in DEFAULTS.items()};c['host']=str(c['host']).strip().lower();c['use_smtp']=c['use_smtp'] is True;c=linked_account(store,c);c['username']=smtp_mail127.email(c['username']);c['folder']=str(c['folder']).strip()
 if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',c['host']) or len(c['host'])>253:raise ValueError('Informe o servidor IMAP, sem http ou porta.')
 if int(c['port'])!=993:raise ValueError('Use IMAP seguro na porta 993 (SSL/TLS).')
 c['port']=993;c['interval']=max(60,min(900,int(c['interval'])))
 if not c['folder'] or len(c['folder'])>120 or any(x in c['folder'] for x in '\r\n"\\'):raise ValueError('Pasta IMAP inválida. Normalmente INBOX.')
 c['enabled']=c['enabled'] is True;c['use_smtp']=c['use_smtp'] is True
 previous=credential(store);password=body.get('password','')
 if not isinstance(password,str) or len(password)>1000 or '\x00' in password:raise ValueError('Senha inválida.')
 if not password and (c['host'],c['username'])==(previous['host'],previous['username']):password=previous.get('password','')
 c['password']='' if c['use_smtp'] else password
 connect_config(store,c)
 if not store.inbox_lock.acquire(blocking=False):raise ValueError('Aguarde a sincronização terminar antes de alterar a conta.')
 try:
  with store.lock:write_credential(store,c)
 finally:store.inbox_lock.release()
 store.inbox_wake.set();return public(store)
def rows(store,acc):
 with store.connect() as db:return [json.loads(v) for v, in db.execute("SELECT json_remove(value,'$.body','$.attachments','$.raw_path') FROM received_mail131 WHERE account=? ORDER BY rowid DESC",(acc,))]
def lookup(store,ident):
 c=credential(store)
 with store.connect() as db:r=db.execute('SELECT value FROM received_mail131 WHERE id=? AND account=?',(ident,account(c))).fetchone()
 if not r:raise ValueError('E-mail não encontrado nesta conta.')
 return json.loads(r[0])
def persist(store,v):
 with store.lock,store.connect() as db:db.execute('INSERT INTO received_mail131 VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',(v['id'],v['account'],json.dumps(v,ensure_ascii=False)))
def emails(value):return {a.strip().lower() for _,a in getaddresses([str(value or '')]) if '@' in a}
def resolve(store,v):
 refs=set(re.findall(r'<[^<>\s]+>',v.get('references','')))
 with store.connect() as db:
  attempts=[json.loads(x) for x, in db.execute('SELECT value FROM smtp_attempts')]
  cities=db.execute('SELECT key,source,overrides FROM municipalities').fetchall()
  previous=[json.loads(x) for x, in db.execute("SELECT json_remove(value,'$.body','$.attachments','$.raw_path') FROM received_mail131 WHERE account=?",(v.get('account'),))]
 matches={(x['key'],x.get('target','outro')) for x in attempts if x.get('key') and x.get('message_id') in refs and x.get('state')=='accepted'}
 matches.update((x['key'],x.get('target','outro')) for x in previous if x.get('key') and x.get('message_id') in refs)
 if len(matches)==1:return (*next(iter(matches)),'conversa')
 if len(matches)>1:return None,None,'Conversa vinculada a mais de um cadastro; conferir.'
 matches=set();senders=set(v.get('senders',[]))
 for key,s,o in cities:
  f={**json.loads(s),**json.loads(o)}
  for target,field in [('camara','Email Geral da Câmara'),('presidente','Presidente - Email')]:
   found={x.lower() for x in re.findall(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',str(f.get(field,'')),re.I)}
   if found&senders:matches.add((key,target))
 if len(matches)==1:return (*next(iter(matches)),'remetente único')
 return None,None,'Remetente compartilhado; conferir.' if matches else 'Remetente ainda sem vínculo.'
def ingest(store,c,raw,uid,validity,oversized=False):
 msg=BytesParser(policy=policy.default).parsebytes(raw);acc=account(c);ident=hashlib.sha256(acc.encode()+raw).hexdigest()[:40]
 with store.connect() as db:
  if db.execute('SELECT 1 FROM received_mail131 WHERE id=?',(ident,)).fetchone():return False
 folder=store.folder/'emails_recebidos'/acc;folder.mkdir(parents=True,exist_ok=True);dest=folder/(ident+'.eml');tmp=folder/(ident+'.tmp');tmp.write_bytes(raw);os.replace(tmp,dest)
 texts=[];html=[];attachments=[]
 for i,part in enumerate(msg.walk()):
  if part.is_multipart():continue
  filename=part.get_filename();disp=part.get_content_disposition()
  if filename or disp=='attachment':
   payload=part.get_payload(decode=True) or b'';attachments.append({'index':i,'name':str(filename or 'anexo')[:200],'size':len(payload)})
  elif part.get_content_type() in ('text/plain','text/html'):
   try:value=part.get_content()
   except Exception:value=(part.get_payload(decode=True) or b'').decode('utf-8','replace')
   (texts if part.get_content_type()=='text/plain' else html).append(str(value))
 body='\n'.join(texts)
 if not body and html:
  parser=TextHTML();parser.feed('\n'.join(html));body=''.join(parser.parts)
 if oversized:body='Mensagem maior que 30 MB. Somente os cabeçalhos foram importados; consulte o conteúdo e anexos no webmail.'
 v={'id':ident,'account':acc,'uid':uid,'validity':validity,'message_id':str(msg.get('Message-ID','')),'references':' '.join(str(msg.get(h,'')) for h in ('In-Reply-To','References')),'from':str(msg.get('From','')),'senders':sorted(emails(msg.get('From'))),'to':str(msg.get('To','')),'subject':str(msg.get('Subject','(sem assunto)')),'date':str(msg.get('Date','')),'received_at':operators131.stamp(),'body':body[:500000],'attachments':attachments,'read':False,'raw_path':str(dest),'oversized':oversized,'key':None,'target':None}
 v['key'],v['target'],v['link_reason']=resolve(store,v);persist(store,v);return True
def client(c):
 im=imaplib.IMAP4_SSL(c['host'],993,ssl_context=ssl.create_default_context(),timeout=20)
 try:
  im.login(c['username'],c['password'])
  status,_=im.select('"'+c['folder']+'"',readonly=True)
  if status!='OK':raise ValueError('Não foi possível abrir a pasta IMAP informada.')
  return im
 except Exception:
  try:im.logout()
  except Exception:pass
  raise
def error_message(e):
 if isinstance(e,ValueError):return str(e)
 if isinstance(e,imaplib.IMAP4.error):return 'Servidor recusou o acesso IMAP. Confira servidor, e-mail, senha e pasta.'
 return 'Falha na conexão segura IMAP. Confira servidor, certificado e conexão; tente sincronizar novamente.'
def sync(store,test=False):
 if not store.inbox_lock.acquire(blocking=False):return {'busy':True}
 im=None
 try:
  c=connect_config(store,credential(store))
  if not c['host']:raise ValueError('Configure o recebimento IMAP primeiro.')
  with store.inbox_state_lock:store.inbox_status.update(running=True,message='Testando IMAP…' if test else 'Sincronizando a caixa de entrada…')
  im=client(c)
  if test:
   with store.inbox_state_lock:store.inbox_status['message']='Conexão IMAP aprovada. Nenhuma mensagem foi alterada.'
   return {'ok':True,'message':'Conexão IMAP aprovada. Nenhuma mensagem foi alterada.'}
  validity=str((im.response('UIDVALIDITY')[1] or [b'0'])[0].decode());acc=account(c)
  with store.connect() as db:old=db.execute('SELECT validity,uid FROM imap_cursor131 WHERE account=?',(acc,)).fetchone()
  cursor=old[1] if old and old[0]==validity else 0
  status,data=im.uid('search',None,'UID',str(cursor+1)+':*')
  if status!='OK':raise ValueError('Não foi possível listar os e-mails recebidos.')
  uids=sorted({int(x) for x in (data[0] or b'').split() if int(x)>cursor});new=0
  for uid in uids[:100]:
   if store.inbox_stop.is_set():break
   status,meta=im.uid('fetch',str(uid),'(RFC822.SIZE)')
   m=re.search(rb'RFC822.SIZE (\d+)',b' '.join(x for x in meta if isinstance(x,bytes)))
   if status!='OK' or not m:raise ValueError('Falha ao consultar o tamanho de uma mensagem. A sincronização poderá ser retomada.')
   oversized=int(m[1])>MAX_BYTES
   status,data=im.uid('fetch',str(uid),'(BODY.PEEK[HEADER])' if oversized else '(BODY.PEEK[])')
   raw=next((x[1] for x in data if isinstance(x,tuple)),None)
   if status!='OK' or raw is None:raise ValueError('Falha ao ler uma mensagem. A sincronização poderá ser retomada.')
   new+=ingest(store,c,raw,uid,validity,oversized)
   with store.connect() as db:db.execute('INSERT INTO imap_cursor131 VALUES (?,?,?) ON CONFLICT(account) DO UPDATE SET validity=excluded.validity,uid=excluded.uid',(acc,validity,uid))
  message=str(new)+' e-mail(s) novo(s).'+(' Continuaremos os próximos 100 na próxima sincronização.' if len(uids)>100 else '')
  with store.inbox_state_lock:store.inbox_status.update(last_sync=operators131.stamp(),message=message)
  return {'ok':True,'new':new,'remaining':max(0,len(uids)-100),'message':message}
 except Exception as e:
  message=error_message(e)
  with store.inbox_state_lock:store.inbox_status['message']=message
  return {'ok':False,'message':message}
 finally:
  if im:
   try:im.logout()
   except Exception:pass
  with store.inbox_state_lock:store.inbox_status['running']=False
  store.inbox_lock.release()
def start_worker(store):
 def loop():
  while not store.inbox_stop.is_set():
   try:
    c=credential(store)
    if c['enabled']:sync(store)
    delay=c['interval']
   except Exception:delay=60
   store.inbox_wake.wait(delay);store.inbox_wake.clear()
 threading.Thread(target=loop,daemon=True).start()
def listing(store,query):
 c=credential(store);values=rows(store,account(c));key=query.get('key',[''])[0];search=query.get('search',[''])[0].strip().casefold();unread=query.get('unread',[''])[0]=='1'
 values=[v for v in values if (not key or v.get('key')==key) and (not unread or not v.get('read')) and (not search or search in (v['subject']+' '+v['from']).casefold())]
 offset=max(0,int(query.get('offset',['0'])[0]));return {'total':len(values),'items':[{k:v.get(k) for k in ('id','key','target','subject','from','date','received_at','read','link_reason','oversized')} for v in values[offset:offset+50]]}
def change(store,body):
 with store.lock:
  v=lookup(store,body['id'])
  if 'read' in body:v['read']=body['read'] is True
  if 'key' in body:
   key=body['key'] or None;target=body.get('target') or None
   if key:
    store.item(key)
    if target not in ('camara','presidente','outro'):raise ValueError('Escolha o tipo de destinatário.')
   v.update(key=key,target=target if key else None,link_reason='Associação manual',linked_by=operators131.actor())
  persist(store,v)
 operators131.audit(store,'E-mail: leitura/vínculo',v.get('key'),{'id':v['id']});return {'ok':True}
def detail(store,ident):
 v=lookup(store,ident);result={k:value for k,value in v.items() if k not in ('raw_path','account')}
 ids=set(re.findall(r'<[^<>\s]+>',v.get('references','')));ids.add(v.get('message_id'))
 related=[x for x in rows(store,v['account']) if x['id']!=v['id'] and (x.get('message_id') in ids or v.get('message_id') and v['message_id'] in x.get('references',''))]
 result['related']=[{k:x.get(k) for k in ('id','subject','from','date','received_at')} for x in related[:100]]
 with store.connect() as db:sent=[json.loads(x) for x, in db.execute('SELECT value FROM smtp_attempts ORDER BY rowid DESC')]
 result['replies']=[{k:x.get(k) for k in ('id','recipient','message','state','created_at','operator')} for x in sent if x.get('reply_mail_id')==v['id'] and x.get('from_email','').lower()==credential(store)['username'].lower()][:100]
 return result
def attachment(store,ident,index):
 v=lookup(store,ident);c=credential(store);path=store.folder/'emails_recebidos'/account(c)/(v['id']+'.eml')
 msg=BytesParser(policy=policy.default).parsebytes(path.read_bytes());part=next((p for i,p in enumerate(msg.walk()) if i==int(index) and any(a['index']==i for a in v['attachments'])),None)
 if part is None:raise ValueError('Anexo não encontrado.')
 return part.get_payload(decode=True) or b'',str(part.get_filename() or 'anexo')
def reply(store,body):
 v=lookup(store,body['mail_id']);ident=body.get('id','');message=body.get('message','');recipient=smtp_mail127.email(body.get('recipient'))
 if recipient.lower() not in v['senders']:raise ValueError('Escolha um remetente desta mensagem para responder.')
 if not re.fullmatch(r'[a-f0-9]{24}',ident) or not isinstance(message,str) or not message.strip() or len(message)>10000:raise ValueError('Identificador ou texto de resposta inválido.')
 with store.lock:
  with store.connect() as db:old=db.execute('SELECT value FROM smtp_attempts WHERE id=?',(ident,)).fetchone()
  if old:
   x=json.loads(old[0])
   if (x.get('reply_mail_id'),x.get('recipient'),x.get('message'))!=(v['id'],recipient,message):raise ValueError('Identificador de resposta já utilizado.')
   return smtp_mail127.public_attempt(x)
  c=smtp_mail127.secret_read(store)
  if not c.get('password'):raise ValueError('Configure primeiro o envio SMTP.')
  item={'id':ident,'key':v.get('key'),'target':v.get('target') or 'outro','recipient':recipient,'subject':('' if v['subject'].lower().startswith('re:') else 'Re: ')+v['subject'][:280],'message':message,'pdf_path':None,'pdf_name':None,'pdf_sha256':None,'from_email':c['username'],'from_name':c['from_name'],'state':'queued','created_at':operators131.stamp(),'message_id':make_msgid(),'in_reply_to':v['message_id'],'references':v['references']+' '+v['message_id'],'reply_mail_id':v['id'],'operator':operators131.actor(),'error':''}
  with store.connect() as db:db.execute('INSERT INTO smtp_attempts VALUES (?,?)',(ident,json.dumps(item,ensure_ascii=False)))
  municipal_media.background(store,lambda progress:smtp_mail127.deliver(store,ident,c,progress));return smtp_mail127.public_attempt(item)
