"""Envio SMTP autenticado com snapshot do PDF e resultado persistente por tentativa."""
import hashlib,json,os,re,secrets,smtplib,ssl,threading
from pathlib import Path
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr,formatdate,make_msgid
import data_storage,municipal_media,operators131

DEFAULTS={'host':'smtp.uni5.net','port':465,'security':'ssl','username':'','from_name':'JP Minato'}
TERMINAL={'accepted','failed','uncertain'}
def stamp():return datetime.now().astimezone().isoformat(timespec='seconds')
def initialize(store):
 store.smtp_send_lock=threading.Lock()
 with store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS smtp_attempts (id TEXT PRIMARY KEY, value TEXT NOT NULL)')
  for ident,value in db.execute('SELECT id,value FROM smtp_attempts').fetchall():
   item=json.loads(value)
   if item['state'] in ('queued','sending'):
    item.update(state='uncertain' if item['state']=='sending' else 'failed',finished_at=stamp(),error='Programa interrompido. Confira o resultado antes de reenviar.' if item['state']=='sending' else 'Programa interrompido antes de iniciar o envio.')
    db.execute('UPDATE smtp_attempts SET value=? WHERE id=?',(json.dumps(item,ensure_ascii=False),ident))
def secret_path(store):return store.folder/'credenciais'/'email-smtp.dpapi'
def secret_read(store):
 p=secret_path(store)
 if not p.exists():return {}
 try:
  raw=p.read_bytes()
  if os.name=='nt':
   from restoration_ai import protect
   raw=protect(raw,True)
  return json.loads(raw)
 except Exception:raise ValueError('Não foi possível abrir a credencial SMTP. Informe e salve novamente a senha neste usuário do Windows.') from None
def secret_write(store,value):
 raw=json.dumps(value,ensure_ascii=False).encode('utf-8')
 if os.name=='nt':
  from restoration_ai import protect
  raw=protect(raw)
 p=secret_path(store);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name('.smtp-'+secrets.token_hex(8)+'.tmp')
 try:
  fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'wb') as f:f.write(raw)
  os.replace(tmp,p)
 finally:tmp.unlink(missing_ok=True)
def email(value):
 text=str(value or '').strip()
 if len(text)>254 or not re.fullmatch(r'[^\s@?&#;,<>]+@[^\s@?&#;,<>]+\.[^\s@?&#;,<>]+',text):raise ValueError('Informe um e-mail válido.')
 return text
def public_attempt(value):
 return {k:value.get(k) for k in ('id','key','target','recipient','subject','pdf_name','pdf_sha256','state','created_at','finished_at','message_id','from_email','error','operator')}
def lookup(store,ident):
 with store.connect() as db:row=db.execute('SELECT value FROM smtp_attempts WHERE id=?',(ident,)).fetchone()
 if not row:raise ValueError('Tentativa de e-mail não encontrada.')
 return json.loads(row[0])
def public(store):
 with store.lock:
  credential_error=''
  try:saved=secret_read(store)
  except ValueError as e:saved={};credential_error=str(e)
  config={**DEFAULTS,**{k:saved[k] for k in DEFAULTS if k in saved}}
  with store.connect() as db:history=[public_attempt(json.loads(r[0])) for r in db.execute('SELECT value FROM smtp_attempts ORDER BY rowid DESC LIMIT 30')]
  return {'config':config,'configured':bool(saved.get('password') and saved.get('username')),'password_set':bool(saved.get('password')),'history':history,'credential_error':credential_error}
def configure(store,body):
 config={k:body.get(k,v) for k,v in DEFAULTS.items()}
 config['host']=str(config['host']).strip().lower()
 if len(config['host'])>253 or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',config['host']):raise ValueError('Informe somente o nome do servidor SMTP, sem http ou porta.')
 try:config['port']=int(config['port'])
 except (TypeError,ValueError):raise ValueError('Porta SMTP inválida.')
 if (config['port'],config['security']) not in ((465,'ssl'),(587,'starttls')):raise ValueError('Use 465 com SSL/TLS ou 587 com STARTTLS.')
 config['username']=email(config['username']);config['from_name']=str(config['from_name']).strip()
 if not config['from_name'] or len(config['from_name'])>120 or any(c in config['from_name'] for c in '\r\n'):raise ValueError('Nome do remetente inválido.')
 password=body.get('password','')
 if not isinstance(password,str) or len(password)>1000 or '\x00' in password:raise ValueError('Senha inválida.')
 with store.lock:
  try:previous=secret_read(store)
  except ValueError:
   if not password:raise
   previous={}
  if not password:
   if any(previous.get(k)!=config[k] for k in ('host','username')):raise ValueError('Informe a senha ao cadastrar ou trocar o servidor/remetente.')
   password=previous.get('password','')
  if not password:raise ValueError('Informe a senha da caixa de e-mail.')
  secret_write(store,{**config,'password':password})
 return public(store)
def open_client(config):
 context=ssl.create_default_context()
 client=None
 try:
  if config['security']=='ssl':client=smtplib.SMTP_SSL(config['host'],config['port'],timeout=25,context=context)
  else:
   client=smtplib.SMTP(config['host'],config['port'],timeout=25);client.ehlo();client.starttls(context=context);client.ehlo()
  client.login(config['username'],config['password']);return client
 except Exception:
  if client:
   try:client.close()
   except Exception:pass
  raise
def close_client(client):
 try:client.quit()
 except Exception:
  try:client.close()
  except Exception:pass
def error_message(error):
 if isinstance(error,smtplib.SMTPAuthenticationError):return 'Servidor recusou a autenticação. Confira o e-mail completo e a senha da caixa.'
 if isinstance(error,ssl.SSLError):return 'Não foi possível validar a conexão segura. Confira o servidor e a configuração SSL/TLS.'
 if isinstance(error,smtplib.SMTPRecipientsRefused):return 'Servidor recusou o destinatário. Confira o endereço de e-mail.'
 if isinstance(error,smtplib.SMTPResponseException):return 'Servidor recusou a operação SMTP (código '+str(error.smtp_code)+'). Confira remetente, destinatário e limites da conta.'
 if isinstance(error,ValueError):return str(error)
 return 'Não foi possível concluir a comunicação com o servidor SMTP. Confira servidor, porta e conexão.'
def test_connection(store):
 with store.lock:config=secret_read(store)
 if not config.get('password'):raise ValueError('Salve primeiro a configuração SMTP.')
 def work(progress):
  progress('Testando conexão segura e autenticação, sem enviar mensagem…',20)
  try:client=open_client(config)
  except Exception as e:return {'ok':False,'message':error_message(e)}
  close_client(client);return {'ok':True,'message':'Conexão e autenticação aprovadas. Nenhum e-mail foi enviado.'}
 return municipal_media.background(store,work)
def persist(store,item):
 with store.lock,store.connect() as db:db.execute('UPDATE smtp_attempts SET value=? WHERE id=?',(json.dumps(item,ensure_ascii=False),item['id']))
def generate_pdf_for_email(store,key):
 project=store.project(key)
 pairs=[p for p in project.get('pairs',[]) if p.get('selected',True)]
 issues=[]
 if not project.get('crest') or not Path(project['crest']).is_file():issues.append('Cadastre ou envie novamente o brasão do município em Criar PDF.')
 if not pairs:issues.append('Importe as fotos originais e selecione ao menos um vereador em Criar PDF.')
 missing_originals=[str(p.get('name') or 'Sem nome') for p in pairs if not p.get('original') or not Path(p['original']).is_file()]
 missing_restored=[str(p.get('name') or 'Sem nome') for p in pairs if not p.get('restored') or not Path(p['restored']).is_file()]
 def names(values):return ', '.join(values[:5])+(' e mais '+str(len(values)-5) if len(values)>5 else '')
 if missing_originals:issues.append('Fotos originais ausentes: '+names(missing_originals)+'. Importe novamente esses arquivos em Criar PDF.')
 if missing_restored:issues.append('Fotos tratadas ausentes: '+names(missing_restored)+'. Importe e associe as tratadas aos vereadores em Criar PDF.')
 if issues:raise ValueError('E-mail não enviado. Ajuste em Criar PDF e clique em Enviar com PDF novamente:\n- '+'\n- '.join(issues))
 try:store.pdf(key,draft=False)
 except Exception as error:raise ValueError('E-mail não enviado: não foi possível gerar o catálogo atualizado. Abra Criar PDF e confira as imagens, os nomes e o modelo. Detalhe: '+str(error)) from error

def prepare(store,key,body):
 ident=body.get('id','')
 if not re.fullmatch(r'[a-f0-9]{24}',ident):raise ValueError('Identificador de envio inválido.')
 recipient=email(body.get('recipient'));target=body.get('target')
 if target not in ('camara','presidente','outro'):raise ValueError('Destinatário inválido.')
 subject=body.get('subject');message=body.get('message')
 if not isinstance(subject,str) or not subject.strip() or len(subject)>300 or '\r' in subject or '\n' in subject:raise ValueError('Assunto inválido.')
 if not isinstance(message,str) or not message.strip() or len(message)>10000:raise ValueError('Mensagem vazia ou muito longa.')
 store.item(key)
 with store.lock:
  with store.connect() as db:old=db.execute('SELECT value FROM smtp_attempts WHERE id=?',(ident,)).fetchone()
  if old:
   item=json.loads(old[0])
   if (item['key'],item['target'],item['recipient'],item['subject'],item['message'])!=(key,target,recipient,subject,message):raise ValueError('Tentativa de envio em conflito. Reabra o envio antes de continuar.')
   return public_attempt(item)
  config=secret_read(store)
  if not config.get('password'):raise ValueError('Configure o e-mail SMTP antes de enviar.')
  automatic=body.get('generate_pdf') is True
  if automatic:generate_pdf_for_email(store,key)
  project=store.project(key);pdf=Path(project.get('pdf') or '')
  if not project.get('pdf') or project.get('dirty') or (project.get('catalogue_version')!=1 or project.get('layout_version')!='1.33.1') or not pdf.is_file():raise ValueError('Gere o PDF final atualizado deste município antes de enviar.')
  if not automatic and body.get('expected_pdf') and body['expected_pdf']!=project['pdf']:raise ValueError('O PDF mudou. Reabra a tela de envio para conferir o arquivo.')
  if pdf.stat().st_size>18*1024*1024:raise ValueError('PDF maior que 18 MB. Reduza o arquivo antes de enviar por e-mail.')
  with pdf.open('rb') as source:
   if source.read(5)!=b'%PDF-':raise ValueError('O arquivo final não é um PDF válido.')
  digest=data_storage.digest(pdf);snapshot=store.folder/'envios_email'/'anexos'/digest/pdf.name;data_storage.atomic_copy(pdf,snapshot,digest)
  item={'id':ident,'key':key,'target':target,'recipient':recipient,'subject':subject,'message':message,'pdf_path':str(snapshot),'pdf_name':pdf.name,'pdf_sha256':digest,'from_email':config['username'],'from_name':config['from_name'],'operator':operators131.actor(),'state':'queued','created_at':stamp(),'message_id':make_msgid(idstring=ident,domain=config['username'].split('@')[1]),'error':''}
  with store.connect() as db:
   if db.execute('SELECT 1 FROM interactions WHERE id=?',(ident,)).fetchone():raise ValueError('Identificador já utilizado em outro registro.')
   db.execute('INSERT INTO smtp_attempts VALUES (?,?)',(ident,json.dumps(item,ensure_ascii=False)))
  municipal_media.background(store,lambda progress:deliver(store,ident,config,progress))
  return public_attempt(item)
def mime_message(item):
 message=EmailMessage();message['From']=formataddr((item['from_name'],item['from_email']));message['To']=item['recipient'];message['Subject']=item['subject'];message['Date']=formatdate(localtime=True);message['Message-ID']=item['message_id']
 if item.get('in_reply_to'):message['In-Reply-To']=item['in_reply_to']
 if item.get('references'):message['References']=item['references']
 message.set_content(item['message'])
 if item.get('pdf_path'):
  raw=Path(item['pdf_path']).read_bytes()
  if hashlib.sha256(raw).hexdigest()!=item['pdf_sha256']:raise ValueError('O PDF da tentativa foi alterado. Prepare um novo envio.')
  message.add_attachment(raw,maintype='application',subtype='pdf',filename=item['pdf_name'])
 return message
def accept(store,item):
 item.update(state='accepted',finished_at=stamp(),error='')
 if not item.get('key'):
  persist(store,item);return
 with store.lock,store.connect() as db:
  local=json.loads(db.execute('SELECT local FROM municipalities WHERE key=?',(item['key'],)).fetchone()[0]);timestamp=item['finished_at']
  notes='Aceito pelo servidor SMTP. Entrega e leitura não confirmadas. Message-ID: '+item['message_id']
  prior=db.execute('SELECT municipality_key,channel,target,recipient FROM interactions WHERE id=?',(item['id'],)).fetchone()
  if prior and prior!=(item['key'],'email',item['target'],item['recipient']):raise ValueError('Identificador de registro em conflito após envio.')
  db.execute('INSERT OR IGNORE INTO interactions VALUES (?,?,?,?,?,?,?,?,?,?)',(item['id'],item['key'],timestamp,'sent','email',item['target'],item['recipient'],item['pdf_path'],item['pdf_name'],notes))
  if item.get('pdf_sha256'):db.execute('INSERT OR IGNORE INTO interaction_files VALUES (?,?)',(item['id'],item['pdf_sha256']))
  local.setdefault('interaction_previous',{'last_contact':local.get('last_contact'),'commercial':local.get('commercial')});local['last_contact']=timestamp[:10];local['updated_at']=timestamp
  if local.get('commercial','Não contatado')=='Não contatado':local['commercial']='Contatado'
  db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),item['key']))
  db.execute('UPDATE smtp_attempts SET value=? WHERE id=?',(json.dumps(item,ensure_ascii=False),item['id']))
def deliver(store,ident,config,progress=lambda *args:None):
 with store.smtp_send_lock:
  item=lookup(store,ident)
  if item['state']!='queued':return public_attempt(item)
  item['state']='sending';persist(store,item);client=None;transmitting=False;accepted=False
  try:
   message=mime_message(item);progress('Conectando ao servidor de e-mail…',20);client=open_client(config)
   progress('Enviando mensagem e PDF…',60);transmitting=True
   refused=client.send_message(message,from_addr=item['from_email'],to_addrs=[item['recipient']])
   if refused:raise smtplib.SMTPRecipientsRefused(refused)
   accepted=True;accept(store,item);operators131.audit(store,"E-mail aceito pelo SMTP",item["key"],{"id":ident,"recipient":item["recipient"]},item.get("operator"))
  except Exception as e:
   definite=isinstance(e,(smtplib.SMTPResponseException,smtplib.SMTPRecipientsRefused))
   item.update(state='uncertain' if accepted or transmitting and not definite else 'failed',finished_at=stamp(),error='Resultado incerto. Não reenviar automaticamente; confira com o provedor/destinatário.' if accepted or transmitting and not definite else error_message(e))
   persist(store,item)
  finally:
   if client:close_client(client)
  return public_attempt(item)
