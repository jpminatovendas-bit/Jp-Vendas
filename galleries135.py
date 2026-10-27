"""Avaliação visual de galerias e planejamento de visitas, independente das rotas comerciais."""
import copy,datetime,hashlib,io,json,re,secrets
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
import operators131,capture_routes

CONDITIONS={'nao_verificada','renovar','conservada','sem_galeria'}
PROBABILITIES={'nao_avaliada','alta','media','baixa'}
def stamp():return datetime.datetime.now().astimezone().isoformat(timespec='seconds')
def empty():return {'revision':0,'condition':'nao_verificada','probability':'nao_avaliada','notes':'','evidence':[]}
def url(value):
 text=str(value or '').strip();u=urlparse(text)
 if len(text)>4000 or u.scheme not in ('http','https') or not u.hostname or u.username or u.password:raise ValueError('Informe um link completo http ou https, sem usuário ou senha.')
 return text
def raw(store,key):return copy.deepcopy(store.item(key)['local'].get('gallery_assessment') or empty())
def public(store,key,value=None):
 result=copy.deepcopy(value if value is not None else raw(store,key))
 for e in result.get('evidence',[]):
  if e.get('relative_path'):
   p=(store.folder/e['relative_path']).resolve()
   if not p.is_relative_to(store.folder.resolve()):raise ValueError('Arquivo de galeria fora da pasta de dados.')
   e['preview_url']='/file/'+store.token_for(p) if p.is_file() else '';e['missing']=not p.is_file()
  elif e.get('kind')=='image':e['preview_url']=e.get('url','')
 return result
def mutate(store,key,change,action):
 with store.lock,store.connect() as db:
  db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT local FROM municipalities WHERE key=?',(key,)).fetchone()
  if not row:raise ValueError('Município não encontrado.')
  local=json.loads(row[0]);value=copy.deepcopy(local.get('gallery_assessment') or empty());change(value)
  value.update(revision=value['revision']+1,updated_at=stamp(),updated_by=operators131.actor())
  local['gallery_assessment']=value
  db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),key))
 operators131.audit(store,action,key,{'revision':value['revision']})
 return public(store,key,value)
def save(store,body):
 key=body.get('key');condition=body.get('condition');probability=body.get('probability');notes=body.get('notes','')
 if condition not in CONDITIONS or probability not in PROBABILITIES:raise ValueError('Escolha condição da galeria e prioridade válidas.')
 if not isinstance(notes,str) or len(notes)>6000:raise ValueError('Observações: limite de 6.000 caracteres.')
 conditions=body.get('conditions',[])
 if not isinstance(conditions,list) or len(conditions)>30 or any(not isinstance(c,str) or not c.strip() or len(c)>120 for c in conditions):raise ValueError('Informe até 30 condições, com até 120 caracteres cada.')
 website=url(body['website']) if body.get('website') else ''
 def change(v):
  if body.get('revision')!=v['revision']:raise ValueError('A avaliação mudou em outra aba ou recebeu uma captura. Atualize a avaliação e preserve suas anotações antes de salvar novamente.')
  v.update(condition=condition,probability=probability,notes=notes.strip())
  if 'conditions' in body:v['conditions']=list(dict.fromkeys(c.strip() for c in conditions))
  if 'website' in body:v['website']=website
  if body.get('opened'):v['opened_at']=v.get('opened_at') or stamp();v['opened_by']=v.get('opened_by') or operators131.actor()
 return mutate(store,key,change,'Avaliação de galeria salva')
def add(store,key,evidence):
 evidence={**evidence,'id':secrets.token_hex(12),'saved_at':stamp(),'saved_by':operators131.actor()}
 def change(v):
  if len(v['evidence'])>=40:raise ValueError('Limite de 40 referências por município. Remova uma antes de adicionar.')
  comparable=evidence.get('url') or evidence.get('relative_path')
  if any((e.get('url') or e.get('relative_path'))==comparable and e['kind']==evidence['kind'] for e in v['evidence']):raise ValueError('Esta referência já está salva nesta Câmara.')
  v['evidence'].append(evidence)
 return mutate(store,key,change,'Referência da galeria adicionada')
def link(store,body):
 kind=body.get('kind','link')
 if kind not in ('link','image'):raise ValueError('Tipo de referência inválido.')
 return add(store,body.get('key'),{'kind':kind,'url':url(body.get('url')),'source_url':url(body['source_url']) if body.get('source_url') else '', 'title':str(body.get('title',''))[:250]})
def capture(store,token,body):
 b=capture_routes.check(store,token,body,'contacts');key=b['key'];kind=body.get('kind')
 if kind not in ('image','link'):raise ValueError('Captura de galeria inválida.')
 value=link(store,{'key':key,'kind':kind,'url':body.get('value'),'source_url':body.get('url'),'title':body.get('title','')})
 item=store.item(key)
 return {'ok':True,'municipality':item['fields']['Município'],'uf':item['fields']['UF'],'assessment':value}
def photo(store,key,content):
 store.item(key)
 if not content or len(content)>20*1024*1024:raise ValueError('Envie foto JPG, PNG ou WebP de até 20 MB.')
 try:
  with Image.open(io.BytesIO(content)) as pic:
   fmt=pic.format
   if fmt not in ('JPEG','PNG','WEBP') or pic.width*pic.height>60_000_000:raise ValueError('Formato ou dimensão de foto inválida.')
   pic.verify()
 except Exception as error:raise ValueError('Não foi possível ler a foto. Use JPG, PNG ou WebP de até 60 milhões de pixels.') from error
 suffix={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}[fmt];digest=hashlib.sha256(content).hexdigest();relative=Path('galerias_atuais')/(digest+suffix);p=store.folder/relative;p.parent.mkdir(exist_ok=True)
 if not p.exists():p.write_bytes(content)
 return add(store,key,{'kind':'image','relative_path':relative.as_posix(),'title':'Foto enviada da galeria atual','source_url':''})
def remove(store,body):
 def change(v):
  ident=body.get('evidence_id');old=v['evidence'];v['evidence']=[e for e in old if e['id']!=ident]
  if len(v['evidence'])==len(old):raise ValueError('Referência já removida. Atualize a avaliação.')
 return mutate(store,body.get('key'),change,'Referência da galeria removida')
def routes(store):return store.setting('gallery_visit_routes',[])
def visit_save(store,body):
 keys=body.get('keys');name=str(body.get('name','')).strip();owner=body.get('owner') or '';date=body.get('date') or '';status=body.get('status','planejada')
 if not name or len(name)>150:raise ValueError('Informe o nome da rota de visitas (até 150 caracteres).')
 if not isinstance(keys,list) or not keys or any(not isinstance(k,str) for k in keys) or len(keys)!=len(set(keys)):raise ValueError('Escolha os municípios da visita, sem repetições.')
 if owner and owner not in operators131.NAMES:raise ValueError('Responsável inválido.')
 if status not in ('planejada','em_andamento','concluida'):raise ValueError('Situação da visita inválida.')
 if date:
  if not isinstance(date,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):raise ValueError('Data da visita inválida.')
  try:datetime.date.fromisoformat(date)
  except ValueError:raise ValueError('Data da visita inválida.')
 with store.lock,store.connect() as db:
  db.execute('BEGIN IMMEDIATE');items={k for k, in db.execute('SELECT key FROM municipalities')}
  if any(k not in items for k in keys):raise ValueError('Há um município removido na seleção. Atualize o mapa.')
  source_route=body.get('source_route_id') or ''
  if source_route and not db.execute('SELECT 1 FROM commercial_routes WHERE id=?',(source_route,)).fetchone():raise ValueError('A rota comercial de origem foi removida. Atualize o mapa.')
  row=db.execute("SELECT value FROM settings WHERE key='gallery_visit_routes'").fetchone();allroutes=json.loads(row[0]) if row else [];old=next((r for r in allroutes if r['id']==body.get('id')),None)
  if body.get('id') and not old:raise ValueError('Rota de visitas não encontrada.')
  if old and body.get('revision')!=old['revision']:raise ValueError('A rota de visitas mudou. Abra novamente antes de salvar.')
  route={'id':old['id'] if old else secrets.token_hex(12),'name':name,'owner':owner,'date':date,'status':status,'keys':keys,'source_route_id':body.get('source_route_id') or '', 'created_at':old['created_at'] if old else stamp(),'updated_at':stamp(),'updated_by':operators131.actor(),'revision':old['revision']+1 if old else 1}
  allroutes=[route if r['id']==route['id'] else r for r in allroutes] if old else allroutes+[route]
  db.execute("INSERT OR REPLACE INTO settings VALUES('gallery_visit_routes',?)",(json.dumps(allroutes,ensure_ascii=False),))
 operators131.audit(store,'Rota de visitas salva',None,{'id':route['id'],'cities':len(keys)})
 return {'route':route,'routes':allroutes}
def visit_remove(store,body):
 with store.lock,store.connect() as db:
  db.execute('BEGIN IMMEDIATE');row=db.execute("SELECT value FROM settings WHERE key='gallery_visit_routes'").fetchone();allroutes=json.loads(row[0]) if row else [];old=next((r for r in allroutes if r['id']==body.get('id')),None)
  if not old or old['revision']!=body.get('revision'):raise ValueError('A rota mudou ou foi removida. Atualize antes de remover.')
  allroutes=[r for r in allroutes if r['id']!=old['id']];db.execute("INSERT OR REPLACE INTO settings VALUES('gallery_visit_routes',?)",(json.dumps(allroutes,ensure_ascii=False),))
 operators131.audit(store,'Rota de visitas removida',None,{'id':body.get('id')})
 return {'routes':allroutes}
