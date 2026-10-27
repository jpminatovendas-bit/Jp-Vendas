"""Códigos permanentes e arquivos municipais gerenciados pelo aplicativo."""
import contextvars
import hashlib,json,re,secrets,shutil,threading,zipfile
from pathlib import Path
from datetime import datetime

CODE=re.compile(r'JP-M[0-9]{6,12}',re.I)
EXT={'.jpg','.jpeg','.png','.webp','.bmp','.tif','.tiff'}
def initialize(store):
 with store.lock,store.connect() as db:
  db.execute('CREATE TABLE IF NOT EXISTS municipality_codes (key TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE)')
 ensure_codes(store)
def ensure_codes(store):
 with store.lock,store.connect() as db:
  db.execute('BEGIN IMMEDIATE')
  row=db.execute("SELECT value FROM settings WHERE key='municipal_code_counter'").fetchone();counter=int(json.loads(row[0])) if row else 0
  for (code,) in db.execute('SELECT code FROM municipality_codes'):counter=max(counter,int(code[4:]))
  missing=db.execute('SELECT m.key FROM municipalities m LEFT JOIN municipality_codes c ON c.key=m.key WHERE c.key IS NULL ORDER BY m.key').fetchall()
  for (key,) in missing:
   counter+=1;db.execute('INSERT INTO municipality_codes VALUES (?,?)',(key,f'JP-M{counter:06d}'))
  db.execute("INSERT OR REPLACE INTO settings VALUES ('municipal_code_counter',?)",(json.dumps(counter),))
def safe_relative(value):
 parts=str(value).replace('\\','/').split('/')
 if not parts or any(x in ('','.','..') or ':' in x for x in parts):raise ValueError('Caminho relativo inválido.')
 return Path(*parts)
def digest(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def background(store,work):
 jid=secrets.token_hex(12)
 with store.job_lock:store.jobs[jid]={'status':'running','percent':0,'message':'Preparando…'}
 def progress(message,percent):
  with store.job_lock:store.jobs[jid].update(message=message,percent=percent)
 def run():
  try:
   result=work(progress)
   with store.job_lock:store.jobs[jid].update(status='done',percent=100,message='Operação concluída.',result=result)
  except Exception as e:
   with store.job_lock:store.jobs[jid].update(status='error',message=str(e))
 context=contextvars.copy_context()
 threading.Thread(target=lambda:context.run(run),daemon=True).start();return {'job':jid}
def export_batch(store,keys,progress=lambda *x:None):
 if not isinstance(keys,list) or not keys:raise ValueError('Marque os municípios que deseja exportar.')
 keys=list(dict.fromkeys(keys));items={x['key']:x for x in store.items()}
 if any(k not in items for k in keys):raise ValueError('Há município não encontrado na seleção.')
 folder=store.folder/'zips';folder.mkdir(exist_ok=True);target=folder/('Originais_selecionados_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+secrets.token_hex(4)+'.zip')
 result={'municipalities':[],'photos':0,'exported':0,'pending':[],'selected':len(keys)}
 import app
 try:
  with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
   for i,key in enumerate(keys):
    item=items[key];fields=item['fields'];progress('ZIP: '+str(i+1)+' de '+str(len(keys))+' — '+fields['Município'],int(i*100/len(keys)))
    pairs=store.project(key)['pairs'];name=item['code']+'_'+app.safe_filename(fields['Município']+'_'+fields['UF']);prefix=Path('Fotos_originais_selecionados')/name;photos=[];issues=[];used=set()
    for pair in pairs:
     try:
      file=Path(pair['original']);rel=safe_relative(pair['relative']);ident=str(rel).casefold()
      if ident in used:raise ValueError('Nome de arquivo repetido: '+str(rel))
      used.add(ident)
      if not file.is_file():raise ValueError('Arquivo ausente: '+str(rel))
      archive.write(file,(prefix/rel).as_posix());photos.append({'id':pair['id'],'nome':pair['name'],'arquivo':rel.as_posix(),'sha256':digest(file)})
     except (ValueError,OSError) as e:issues.append(str(e))
    if not pairs:issues.append('Município sem fotos originais carregadas.')
    manifest={'municipal_code':item['code'],'municipality_key':key,'municipio':fields['Município'],'uf':fields['UF'],'ano':2004,'fotos':photos}
    archive.writestr((prefix/'manifest.json').as_posix(),json.dumps(manifest,ensure_ascii=False,indent=2))
    row={'key':key,'code':item['code'],'municipality':fields['Município'],'uf':fields['UF'],'photos':len(photos),'issues':issues};result['municipalities'].append(row)
    result['photos']+=len(photos);result['exported']+=bool(photos)
    if issues:result['pending'].append(row)
   archive.writestr('Fotos_originais_selecionados/RESUMO.json',json.dumps(result,ensure_ascii=False,indent=2))
  if not result['photos']:raise ValueError('Nenhuma foto disponível. '+ '; '.join(x['municipality']+': '+', '.join(x['issues']) for x in result['pending']))
  with zipfile.ZipFile(target) as z:
   if z.testzip():raise ValueError('Falha ao verificar o ZIP gerado.')
 except Exception:target.unlink(missing_ok=True);raise
 return {**result,'url':'/file/'+store.token_for(target),'filename':target.name}
def upload(store,batch,name,content):
 import fitz
 if not re.fullmatch(r'[a-f0-9]{24}',str(batch)):raise ValueError('Lote inválido.')
 rel=safe_relative(name)
 if rel.suffix.lower() in EXT:
  try:fitz.Pixmap(content)
  except Exception:raise ValueError('Imagem inválida: '+rel.name)
 elif rel.name=='manifest.json':
  if len(content)>1024*1024:raise ValueError('Manifesto muito grande.')
  value=json.loads(content)
  if not isinstance(value,dict):raise ValueError('Manifesto inválido.')
 else:raise ValueError('Importe somente fotos e manifest.json.')
 target=store.folder/'lotes_municipais'/batch/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content);return {'ok':True}
def import_folders(store,path,kind='original',replace=False,progress=lambda *x:None):
 import app
 if kind not in ('original','restored'):raise ValueError('Tipo de imagens inválido.')
 root=Path(path).resolve()
 if not root.is_dir():raise ValueError('Pasta não encontrada.')
 items=store.items();by_code={x['code']:x for x in items};groups={};issues=[];seen_folders={}
 files=[p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in EXT and p.resolve().is_relative_to(root)]
 if not files:raise ValueError('Nenhuma imagem encontrada.')
 for file in files:
  parents=[file.parent,*file.parent.parents];parents=parents[:parents.index(root)+1] if root in parents else []
  chosen=None;item=None;error=None
  for folder in parents:
   code=CODE.search(folder.name);manifest=folder/'manifest.json'
   data={}
   if manifest.is_file():
    try:
     if manifest.stat().st_size>1024*1024:raise ValueError('Manifesto muito grande.')
     data=json.loads(manifest.read_text('utf-8'))
     if not isinstance(data,dict) or data.get('ano',2004)!=2004:raise ValueError('Manifesto/ano inválido.')
    except Exception:error='Manifesto inválido: '+str(folder);break
   mcode=str(data.get('municipal_code','')).upper();fcode=code.group().upper() if code else ''
   if mcode and fcode and mcode!=fcode:error='Código da pasta diverge do manifesto: '+folder.name;break
   if mcode or fcode:
    item=by_code.get(mcode or fcode);chosen=folder
    if not item:error='Código não cadastrado: '+(mcode or fcode)
    elif data.get('municipality_key') and data['municipality_key']!=item['key']:error='Manifesto aponta para outro cadastro: '+folder.name
    break
   matched=[x for x in items if app.norm(folder.name) in (app.norm(x['fields']['Município']+'_'+x['fields']['UF']),app.norm(x['fields']['UF']+'_'+x['fields']['Município'])) or (folder.parent.name.upper()==x['fields']['UF'] and app.norm(folder.name)==app.norm(x['fields']['Município']))]
   if len(matched)==1:item=matched[0];chosen=folder;break
  if error or not item:issues.append({'file':str(file.relative_to(root)),'message':error or 'Pasta sem código municipal ou UF/município inequívoco.'});continue
  key=item['key'];seen_folders.setdefault(key,set()).add(chosen);groups.setdefault(key,[]).append((file,file.relative_to(chosen)))
 result={'kind':kind,'imported':0,'identical':0,'conflicts':0,'municipalities':[],'pending':issues}
 for index,(key,entries) in enumerate(groups.items()):
  item=next(x for x in items if x['key']==key);progress('Importando '+item['fields']['Município'],int(index*100/max(1,len(groups))))
  if len(seen_folders[key])>1:result['pending'].append({'municipality':item['fields']['Município'],'message':'Código repetido em pastas diferentes; não importado.'});continue
  if kind=='restored' and not store.project(key)['pairs']:result['pending'].append({'municipality':item['fields']['Município'],'message':'Importe primeiro as originais.'});continue
  target_root=store.folder/'imagens_municipais'/item['code']/'2004'/kind;target_root.mkdir(parents=True,exist_ok=True);copied=0
  for source,relative in entries:
   if any(re.fullmatch(r'20\d{2}',part) and part!='2004' for part in relative.parts[:-1]):continue
   try:
    rel=safe_relative(relative)
    # Exported folders may have a conventional 2004 level.
    if rel.parts[0]=='2004':rel=Path(*rel.parts[1:])
    import fitz
    fitz.Pixmap(str(source))
    target=target_root/rel;target.parent.mkdir(parents=True,exist_ok=True)
    if target.is_file():
     if digest(source)==digest(target):result['identical']+=1;copied+=1;continue
     if not replace:result['conflicts']+=1;result['pending'].append({'municipality':item['fields']['Município'],'file':str(rel),'message':'Mesmo nome com conteúdo diferente; mantida a imagem existente.'});continue
     backup=store.folder/'imagens_municipais'/item['code']/'versoes'/secrets.token_hex(8)/kind/rel;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
    tmp=target.with_name(target.name+'.'+secrets.token_hex(4)+'.tmp');shutil.copy2(source,tmp);tmp.replace(target);result['imported']+=1;copied+=1
   except Exception as e:result['pending'].append({'municipality':item['fields']['Município'],'file':str(relative),'message':str(e)})
  if copied:
   with store.lock:
    if kind=='original':
     old=store.project(key);old_pairs=old['pairs'];store.load_originals(key,str(target_root));new=store.project(key);identities={x['identity']:x for x in new['pairs']}
     old_map={x['identity']:x for x in old_pairs}
     for pair in new['pairs']:
      if old_map.get(pair['identity'],{}).get('tse_id'):pair['tse_id']=old_map[pair['identity']]['tse_id']
     new['pairs'].extend(x for x in old_pairs if x['identity'] not in identities);store.save_project(key,new)
    else:
     old_pairs={x['id']:x for x in store.project(key)['pairs']};store.load_restored(key,str(target_root));new=store.project(key)
     for pair in new['pairs']:
      prior=old_pairs.get(pair['id'],{})
      if not pair.get('restored') and prior.get('restored') and Path(prior['restored']).is_file():pair['restored']=prior['restored'];pair['problem']=''
     store.save_project(key,new)
   result['municipalities'].append({'key':key,'code':item['code'],'municipality':item['fields']['Município'],'photos':copied})
 return result
