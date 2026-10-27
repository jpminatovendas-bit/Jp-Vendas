"""Restauração de retratos por API, com fila local e originais preservados."""
import operators131
import base64,ctypes,hashlib,json,os,re,secrets,threading,time,urllib.request,urllib.error
from pathlib import Path
import fitz
from municipal_media import safe_relative

DEFAULT={'model':'gpt-image-2.5-sunburst','quality':'high','size':'1024x1280','max_photos':50,'timeout':240,'paused':True,'instructions':''}
MODELS=('gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2')
PROMPT='''Restaure e colorize este único retrato institucional usando o original como referência de identidade. Preserve rosto, olhos, nariz, boca, orelhas, idade, expressão, assimetrias, direção do olhar e posição da cabeça. Não afine o rosto nem rejuvenesça. Preserve barba, bigode, cabelo e sinais identificadores reconhecíveis; não crie barba em quem não possui. Remova manchas de papel, oxidação, riscos, retículas, chuvisco e compressão. Não transforme degradação em sardas, pintas ou marcas de pele. Pele natural com transições contínuas e microtextura discreta: sem rabiscos, mosaicos, linhas entrecruzadas, textura vermiculada, pontos artificiais ou pele plástica. Nitidez nos olhos, cabelo, barba e tecido sem halos ou desfoque global. Iluminação suave e uniforme, sem rosto esbranquiçado. Colorize naturalmente; não atribua cores precisas desconhecidas de olhos/cabelos. Fundo branco puro opaco, sem legenda, borda ou nome. Retrato vertical 4:5, centralizado, do meio do tórax para cima, ombros completos, topo da cabeça completo e pequena margem superior. Expanda roupa/fundo quando necessário, sem deformar corpo ou rosto. Uniformize escala aparente e linha dos olhos. Traje institucional da época informada: terno e gravata nos masculinos, conjunto social feminino nos femininos, preservando uniformes especiais reconhecíveis. Evite aparência de pintura. Reconstrua conservadoramente regiões pouco legíveis, priorizando semelhança sobre detalhes inventados.'''

def stamp():return time.strftime('%Y-%m-%dT%H:%M:%S%z')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def config(store):return {**DEFAULT,**store.setting('restoration_ai',{})}
def credential_path(store):return store.folder/'credenciais'/'openai-imagens.dpapi'
def protect(data,decrypt=False):
 class Blob(ctypes.Structure):_fields_=[('size',ctypes.c_ulong),('data',ctypes.POINTER(ctypes.c_ubyte))]
 buf=ctypes.create_string_buffer(data);src=Blob(len(data),ctypes.cast(buf,ctypes.POINTER(ctypes.c_ubyte)));out=Blob()
 fn=ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
 args=(ctypes.byref(src),None,None,None,None,1,ctypes.byref(out))
 if not fn(*args):raise ValueError('Não foi possível acessar a credencial protegida do Windows.')
 try:return ctypes.string_at(out.data,out.size)
 finally:ctypes.windll.kernel32.LocalFree(out.data)
def api_key(store):
 p=credential_path(store)
 if p.exists() and os.name=='nt':return protect(p.read_bytes(),True).decode()
 return os.environ.get('OPENAI_API_KEY','').strip()
def save_key(store,key):
 if os.name!='nt':raise ValueError('Neste sistema configure OPENAI_API_KEY no servidor; o cadastro protegido pela tela está disponível no Windows.')
 data=protect(key.encode());p=credential_path(store);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix('.tmp');tmp.write_bytes(data);os.replace(tmp,p)
def save_config(store,body):
 with store.lock:
  c=config(store)
  for k in ('model','quality','size','instructions'):
   if k in body:c[k]=str(body[k]).strip()
  if c['model'] not in MODELS:raise ValueError('Selecione um modelo de edição de imagens suportado.')
  if c['quality'] not in ('medium','high'):raise ValueError('Qualidade inválida.')
  if c['size'] not in ('1024x1280','1536x1920'):raise ValueError('Dimensões inválidas.')
  c['max_photos']=int(body.get('max_photos',c['max_photos']))
  if not 1<=c['max_photos']<=500:raise ValueError('Limite por lote: 1 a 500 fotos.')
  if len(c['instructions'])>6000:raise ValueError('Instruções adicionais muito longas.')
  key=str(body.get('api_key','')).strip()
  if body.get('clear_key'):credential_path(store).unlink(missing_ok=True)
  if key:
   if len(key)<20 or any(x.isspace() for x in key):raise ValueError('Chave inválida.')
   save_key(store,key)
  store.set_setting('restoration_ai',c)
 return public(store)
class Uncertain(Exception):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None

def request_json(request,timeout):
 try:
  with urllib.request.build_opener(NoRedirect()).open(request,timeout=timeout) as response:
   data=response.read(50*1024*1024+1)
   if len(data)>50*1024*1024:raise Uncertain('Resposta excedeu o limite; cobrança pode ter ocorrido. Confira antes de refazer.')
   return json.loads(data),response.headers.get('x-request-id','')
 except urllib.error.HTTPError as e:
  labels={401:'Chave recusada.',403:'Sem acesso ao modelo.',429:'Limite da conta ou créditos insuficientes.',400:'Parâmetros/imagem recusados. Confira modelo e configuração.'}
  if e.code>=500:raise Uncertain('Falha do provedor. Resultado e cobrança incertos; não será repetido automaticamente.')
  raise ValueError(labels.get(e.code,'API recusou a consulta (HTTP '+str(e.code)+').'))
 except Uncertain:raise
 except Exception:raise Uncertain('Conexão, tempo limite ou resposta inválida. Cobrança pode ter ocorrido; confira antes de refazer.')
def test_connection(store):
 key=api_key(store)
 if not key:raise ValueError('Cadastre sua chave da API da OpenAI.')
 data,_=request_json(urllib.request.Request('https://api.openai.com/v1/models',headers={'Authorization':'Bearer '+key}),30)
 available={x.get('id') for x in data.get('data',[])}
 if config(store)['model'] not in available:raise ValueError('Chave conectada, mas o modelo selecionado não aparece entre os disponíveis para sua conta.')
 return {'ok':True,'message':'Chave conectada e modelo listado. Nenhuma imagem foi gerada; permissões de edição serão verificadas ao restaurar.'}
def edit_image(store,task):
 key=api_key(store)
 if not key:raise ValueError('Chave ausente. Configure Restauração IA.')
 c=task['config'];path=Path(task['original'])
 if path.stat().st_size>25*1024*1024:raise ValueError('Original maior que 25 MB.')
 pix=fitz.Pixmap(str(path))
 if pix.width*pix.height>25000000:raise ValueError('Original excede 25 milhões de pixels.')
 if pix.colorspace is None:raise ValueError('Imagem inválida.')
 if pix.n>4:pix=fitz.Pixmap(fitz.csRGB,pix)
 raw=pix.tobytes('png');boundary='JP'+secrets.token_hex(20)
 palette=['preto com camisa azul-clara e gravata vinho lisa','cinza-escuro com camisa clara e gravata azul listrada','azul-marinho com camisa bege-clara e gravata discreta marrom','marrom com camisa clara e gravata azul lisa','cinza-claro com gravata verde-escura discreta']
 prompt=PROMPT+'\nÉpoca: '+str(task['year'])+'. Variação de cores do traje se apropriada: '+palette[int(task['hash'][:8],16)%len(palette)]+'.\nInstruções adicionais: '+c['instructions']+'\nOrientação deste retrato: '+task.get('extra','')
 parts=[]
 for k,v in {'model':c['model'],'prompt':prompt,'quality':c['quality'],'size':c['size'],'output_format':'png','n':'1','background':'opaque'}.items():parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+v+'\r\n').encode())
 parts.extend([('--'+boundary+'\r\nContent-Disposition: form-data; name="image[]"; filename="original.png"\r\nContent-Type: image/png\r\n\r\n').encode(),raw,b'\r\n',('--'+boundary+'--\r\n').encode()])
 req=urllib.request.Request('https://api.openai.com/v1/images/edits',data=b''.join(parts),headers={'Authorization':'Bearer '+key,'Content-Type':'multipart/form-data; boundary='+boundary})
 data,request_id=request_json(req,c['timeout'])
 try:
  entries=data['data']
  if len(entries)!=1:raise ValueError()
  output=base64.b64decode(entries[0]['b64_json'],validate=True)
  if len(output)>25*1024*1024:raise ValueError()
  pix=fitz.Pixmap(output);dimensions=[pix.width,pix.height];output=pix.tobytes('png')
  fitz.Pixmap(output) # Reject truncated/invalid output before publication.
 except Exception:raise Uncertain('Imagem retornada inválida; não repetir automaticamente. Confira o consumo da conta.')
 usage={k:v for k,v in data.get('usage',{}).items() if isinstance(v,(int,float,dict))}
 return output,{'usage':usage,'request_id':request_id,'dimensions':dimensions}

def initialize(store):
 store.restoration_stop=threading.Event();store.restoration_wake=threading.Event();store.restoration_thread=None
 with store.lock,store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS restoration_tasks(id TEXT PRIMARY KEY,value TEXT NOT NULL)')
  rows=[(i,json.loads(v)) for i,v in db.execute('SELECT id,value FROM restoration_tasks')]
  broken={t.get('batch','legacy') for _,t in rows if t['state']=='running'}
  for task_id,t in rows:
   if t['state']=='running':t.update(state='uncertain',message='Programa interrompido durante consulta. Retirado da fila; confira cobrança antes de refazer.')
   elif t['state']=='pending' and t.get('batch','legacy') in broken:t.update(state='interrupted',message='Lote interrompido. Retirado da fila; não será retomado automaticamente.')
   else:continue
   db.execute('UPDATE restoration_tasks SET value=? WHERE id=?',(json.dumps(t,ensure_ascii=False),task_id))
 c=config(store)
 if not c['paused']:c['paused']=True;store.set_setting('restoration_ai',c)
def tasks(store):
 with store.connect() as db:return [json.loads(v) for v, in db.execute('SELECT value FROM restoration_tasks ORDER BY rowid DESC')]
def write_task(store,t):
 with store.lock,store.connect() as db:db.execute('INSERT OR REPLACE INTO restoration_tasks VALUES (?,?)',(t['id'],json.dumps(t,ensure_ascii=False)))
def public(store):
 c=config(store);rows=tasks(store);counts={s:sum(('cancelled' if x.get('cancel_requested') else x['state'])==s for x in rows) for s in ('pending','running','done','error','uncertain','conflict','cancelled','interrupted')}
 groups={}
 for t in reversed(rows):
  group=groups.setdefault((t.get('batch','legacy'),t['key']),{'batch':t.get('batch','legacy'),'key':t['key'],'municipality':t['municipality'],'uf':t.get('uf',''),'code':t['code'],'counts':{},'total':0,'current_photo':None})
  group['total']+=1;state='cancelled' if t.get('cancel_requested') else t['state'];group['counts'][state]=group['counts'].get(state,0)+1
  if state=='running':group['current_photo']=t['name']
 active_group=store.setting('restoration_active_group',{})
 for g in groups.values():
  n=g['counts'];is_current=g['batch']==active_group.get('batch') and g['key']==active_group.get('key');g['state']='running' if n.get('running') or (is_current and n.get('pending') and not c['paused']) else 'paused' if n.get('pending') and c['paused'] else 'pending' if n.get('pending') else 'done' if n.get('done')==g['total'] else 'partial'
 clean=[{k:v for k,v in t.items() if k not in ('original','hash','previous','config')} for t in rows]
 cache=getattr(store,'restoration_output_tokens',{});store.restoration_output_tokens=cache
 for t in clean:
  if t.get('output') and Path(t['output']).is_file():
   cache.setdefault(t['output'],store.token_for(t['output']) if t['output'] not in cache else cache[t['output']]);t['output_url']='/file/'+cache[t['output']]
 active=[t for t in clean if t['state'] in ('pending','running') and not t.get('cancel_requested')]
 history=[t for t in clean if t not in active]
 return {'config':c,'key_present':bool(credential_path(store).exists() or os.environ.get('OPENAI_API_KEY','')),'counts':counts,'items':clean[:300],'active':active,'history':history[:300],'groups':list(groups.values()),'total':len(rows)}
def preview(store,body):
 keys=list(dict.fromkeys(body.get('keys',[])));photo_id=body.get('photo_id');redo=bool(body.get('redo'));result=[];pending=[];skipped=0
 if not keys:raise ValueError('Selecione municípios.')
 for key in keys:
  item=store.item(key);p=store.project(key)
  for pair in p.get('pairs',[]):
   if photo_id and pair['id']!=photo_id:continue
   if pair.get('selected',True) is False and not photo_id:continue
   if pair.get('restored') and Path(pair['restored']).is_file() and not redo:skipped+=1;continue
   path=Path(pair.get('original',''))
   if not path.is_file():pending.append(item['fields']['Município']+' · '+pair.get('name','')+': original ausente');continue
   result.append({'key':key,'municipality':item['fields']['Município'],'uf':item['fields']['UF'],'code':item['code'],'year':p.get('year',2004),'photo_id':pair['id'],'name':pair.get('name',''),'relative':pair.get('relative',path.name),'original':str(path),'hash':sha(path),'previous':pair.get('restored'),'extra':str(body.get('extra',''))[:3000]})
 return {'photos':len(result),'municipalities':len(set(t['key'] for t in result)),'skipped':skipped,'pending':pending,'tasks':result}
def enqueue(store,body):
 if not api_key(store):raise ValueError('Cadastre a chave da API em Restauração IA.')
 with store.lock:
  c=config(store);p=preview(store,body)
  if p['photos']>c['max_photos']:raise ValueError('Lote excede o limite de '+str(c['max_photos'])+' fotos. Selecione menos municípios ou ajuste o limite.')
  existing=tasks(store);created=0;batch=secrets.token_hex(12)
  if c['paused'] and any(x['state']=='pending' for x in existing):raise ValueError('Há uma fila pausada. Continue ou cancele os pendentes antes de iniciar outro lote.')
  for t in p['tasks']:
   if any(x['key']==t['key'] and x['photo_id']==t['photo_id'] and x['state'] in ('pending','running') for x in existing):continue
   # An uncertain call requires explicit redo, never an implicit retry.
   if not body.get('redo') and any(x['key']==t['key'] and x['photo_id']==t['photo_id'] and x['hash']==t['hash'] and x['state']=='uncertain' for x in existing):p['pending'].append(t['municipality']+' · '+t['name']+': consulta incerta; use Refazer após conferir consumo.');continue
   t.update(operator=operators131.actor(),batch=batch,id=secrets.token_hex(16),state='pending',created_at=stamp(),message='Na fila',config=c.copy());write_task(store,t);existing.append(t);created+=1
  if created:c['paused']=False;store.set_setting('restoration_ai',c);store.restoration_wake.set()
 return {'created':created,'photos':p['photos'],'skipped':p['skipped'],'pending':p['pending']}
def control(store,body):
 with store.lock:
  if body.get('action') in ('cancel','interrupt'):
   for t in tasks(store):
    if t['state']=='pending':t.update(state='interrupted' if body['action']=='interrupt' else 'cancelled',message='Retirado da fila antes da consulta');write_task(store,t)
    elif t['state']=='running':t.update(cancel_requested=True,message='Retirado da fila ativa. A chamada enviada pode terminar e cobrar.');write_task(store,t)
  elif body.get('action') not in ('pause','resume'):raise ValueError('Ação inválida.')
  c=config(store);c['paused']=body['action']!='resume'
  if not c['paused'] and not api_key(store):raise ValueError('Configure a chave antes de continuar.')
  store.set_setting('restoration_ai',c);store.restoration_wake.set()
 return public(store)
def process_one(store):
 with store.lock:
  if config(store)['paused'] or getattr(store,'storage_busy',False):return False
  pending=[t for t in reversed(tasks(store)) if t['state']=='pending' and not t.get('cancel_requested')]
  active=store.setting('restoration_active_group',{})
  t=next((t for t in pending if t.get('batch','legacy')==active.get('batch') and t['key']==active.get('key')),None) or next(iter(pending),None)
  if not t:return False
  store.set_setting('restoration_active_group',{'batch':t.get('batch','legacy'),'key':t['key']})
  t.update(state='running',message='Restaurando; você pode continuar trabalhando.');write_task(store,t)
 try:
  if not Path(t['original']).is_file() or sha(t['original'])!=t['hash']:raise ValueError('Original mudou ou não está disponível.')
  output,info=edit_image(store,t)
  relative=safe_relative(t['relative']).with_suffix('.png');dest=store.folder/'imagens_municipais'/t['code']/str(t['year'])/'restored-ia'/t['id']/relative
  dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_suffix('.tmp');tmp.write_bytes(output);os.replace(tmp,dest)
  t.update(output=str(dest),**info)
  with store.lock:
   latest=next(x for x in tasks(store) if x['id']==t['id'])
   if latest.get('cancel_requested'):
    t.update(cancel_requested=True,state='cancelled',message='Resultado guardado no histórico; não associado porque o trabalho foi retirado.',finished_at=stamp());write_task(store,t);return True
   p=store.project(t['key']);pair=next((x for x in p.get('pairs',[]) if x['id']==t['photo_id']),None)
   if not pair or pair.get('restored')!=t['previous'] or not Path(pair['original']).is_file() or sha(pair['original'])!=t['hash']:
    t.update(state='conflict',message='Resultado guardado, mas o par mudou. Não substituído.');write_task(store,t);return True
   history=pair.setdefault('restoration_versions',[])
   if pair.get('restored'):history.append(pair['restored'])
   pair['restored']=str(dest);pair['ai_restoration']={'task':t['id'],'model':t['config']['model'],'at':stamp(),'dimensions':info['dimensions']};pair['approved']=False
   p.setdefault('restored_files',[]).append({'path':str(dest),'relative':str(relative),'name':pair.get('name','')});p['dirty']=True
   store.save_project(t['key'],p);operators131.audit(store,'Foto restaurada por IA',t['key'],{'task':t['id']},t.get('operator'));t.update(state='done',message='Tratada associada. Confira antes de gerar o PDF.',finished_at=stamp());write_task(store,t)
 except Exception as e:
  message=str(e)
  try:key=api_key(store)
  except Exception:key=''
  if key:message=message.replace(key,'[credencial]')
  latest=next((x for x in tasks(store) if x['id']==t['id']),{})
  t.update(cancel_requested=bool(latest.get('cancel_requested')),state='uncertain' if isinstance(e,Uncertain) else 'error',message=message[:400],finished_at=stamp());write_task(store,t)
  c=config(store);c['paused']=True;store.set_setting('restoration_ai',c)
 return True
def start_worker(store):
 if store.restoration_thread and store.restoration_thread.is_alive():return
 def loop():
  while not store.restoration_stop.is_set():
   if not process_one(store):store.restoration_wake.wait(1);store.restoration_wake.clear()
 store.restoration_thread=threading.Thread(target=loop,daemon=True);store.restoration_thread.start()
