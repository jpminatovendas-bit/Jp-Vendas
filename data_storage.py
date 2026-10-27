"""Acervo gerenciado dentro de dados; cópias verificadas, sem remover a origem."""
import copy,hashlib,json,os,secrets,shutil,threading,time
from pathlib import Path

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as source:
  for chunk in iter(lambda:source.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def inside(store,path):
 try:return Path(path).resolve().is_relative_to(store.folder.resolve())
 except (OSError,ValueError):return False
def atomic_copy(source,target,expected=None):
 source=Path(source);target=Path(target);expected=expected or digest(source)
 if target.is_file():
  if digest(target)==expected:return False
  raise ValueError('Uma cópia gerenciada tem conteúdo diferente: '+str(target))
 target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_name('.'+target.name+'.'+secrets.token_hex(8)+'.tmp')
 try:
  shutil.copy2(source,temporary)
  if digest(temporary)!=expected:raise ValueError('O arquivo mudou durante a cópia. Tente importar novamente: '+source.name)
  os.replace(temporary,target)
 finally:temporary.unlink(missing_ok=True)
 return True
def folder_import(store,key,folder,kind):
 """Snapshot por conteúdo: reimportação idêntica reutiliza o lote sem sobrescrever."""
 files=store.scan_images(folder)
 if inside(store,folder) and all(inside(store,f['path']) for f in files):return Path(folder),files
 manifest=[]
 for f in files:manifest.append((f['relative'].replace('\\','/'),digest(f['path'])))
 fingerprint=hashlib.sha256(json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
 item=store.item(key);year=str(store.project(key).get('year',2004))
 if not year.isdigit() or len(year)!=4:year='2004'
 target=store.folder/'imagens_municipais'/item['code']/year/(kind+'-importadas')/fingerprint[:20]
 result=[]
 for f,(relative,expected) in zip(files,manifest):
  parts=Path(relative).parts
  if any(p in ('..','.') or ':' in p for p in parts):raise ValueError('Caminho de foto inválido.')
  path=target.joinpath(*parts)
  if not inside(store,path):raise ValueError('Destino de importação fora da pasta dados.')
  atomic_copy(f['path'],path,expected);result.append({**f,'path':str(path.resolve())})
 return target.resolve(),result
def copy_file(store,path,category,code='comum'):
 path=Path(path)
 if inside(store,path):
  if not path.is_file():raise FileNotFoundError('Arquivo ausente: '+str(path))
  return str(path.resolve()),False
 if not path.is_file():raise FileNotFoundError('Arquivo ausente: '+str(path))
 h=digest(path);dest=store.folder/category/code/h[:20]/path.name
 if not inside(store,dest):raise ValueError('Destino gerenciado fora de dados.')
 copied=atomic_copy(path,dest,h);return str(dest.resolve()),copied
def template(store,name):
 import app
 target=store.folder/'modelos'/'bases'/name
 if not inside(store,target):raise ValueError('Modelo fora de dados.')
 if not target.is_file():atomic_copy(app.ROOT/'assets'/name,target)
 return target
def replace_paths(value,mapping,field=''):
 if isinstance(value,dict):return {k:v if k in ('import_sources','crest_source','tse_records','captures') else replace_paths(v,mapping,k) for k,v in value.items()}
 if isinstance(value,list):return [replace_paths(v,mapping,field) for v in value]
 return mapping.get(value,value) if isinstance(value,str) and field in FILE_FIELDS|PATH_LISTS|{'original_folder','restored_folder'} else value
FILE_FIELDS={'original','restored','path','crest','pdf','output','previous'}
PATH_LISTS={'crest_versions'}
def project_files(value,field=''):
 if isinstance(value,dict):
  for k,v in value.items():
   if k not in ('import_sources','crest_source','tse_records','captures'):yield from project_files(v,k)
 elif isinstance(value,list):
  for v in value:yield from project_files(v,field)
 elif isinstance(value,str) and value and (field in FILE_FIELDS or field in PATH_LISTS) and not value.startswith(('http://','https://','data:','blob:')):yield field,value
def status(store):
 with store.connect() as db:records=db.execute('SELECT key,value FROM projects').fetchall()
 paths=set()
 for key,value in records:
  p=store.relocate_paths(json.loads(value))
  paths.update(path for _,path in project_files(p))
  paths.update(p[field] for field in ('original_folder','restored_folder') if p.get(field))
 with store.connect() as db:
  paths.update(store.relocate_paths(p) for p, in db.execute('SELECT pdf_path FROM interactions WHERE pdf_path IS NOT NULL'))
  for value, in db.execute('SELECT value FROM restoration_tasks'):paths.update(p for _,p in project_files(store.relocate_paths(json.loads(value))))
 saved=store.setting('catalogue',{})
 if saved.get('path'):paths.add(saved['path'])
 external=sum(not inside(store,p) for p in paths);missing=sum(not Path(p).exists() for p in paths)
 last=store.relocate_paths(store.setting('storage_last_report',{}))
 if last.get('report_file') and Path(last['report_file']).is_file():last['report_url']='/file/'+store.token_for(last['report_file'])
 return {'folder':str(store.folder.resolve()),'external':external,'missing':missing,'busy':getattr(store,'storage_busy',False),'last':last}
def migrate(store,progress=lambda *args:None):
 import restoration_ai
 with store.lock:
  if getattr(store,'storage_busy',False):raise ValueError('A centralização já está em andamento.')
  if any(t['state']=='running' for t in restoration_ai.tasks(store)):raise ValueError('Espere a restauração atual terminar antes de reunir o acervo.')
  store.storage_busy=True
 report={'copied':0,'projects':0,'pending':[],'started_at':time.strftime('%Y-%m-%dT%H:%M:%S%z')};all_mapping={};skipped_keys=set()
 try:
  with store.connect() as db:records=db.execute('SELECT key,value FROM projects').fetchall()
  for index,(key,snapshot) in enumerate(records):
   p=store.relocate_paths(json.loads(snapshot));mapping={};code=store.item(key)['code']
   progress('Reunindo arquivos: '+str(index+1)+' / '+str(len(records))+' · '+store.item(key)['fields']['Município'],int(index*90/max(1,len(records))))
   # Inclui fotos importadas que ainda não foram associadas a um par.
   for kind,field in [('original','original_folder'),('restored','restored_folder')]:
    source=p.get(field)
    if not source or inside(store,source):continue
    try:
     old=store.scan_images(Path(source));target,files=folder_import(store,key,Path(source),kind);mapping[source]=str(target)
     for a,b in zip(old,files):mapping[a['path']]=b['path']
     report['copied']+=sum(a['path']!=b['path'] for a,b in zip(old,files))
    except Exception as error:report['pending'].append({'key':key,'path':source,'message':str(error)})
   for field,source in set(project_files(p)):
    if source in mapping:continue
    try:
     category='brasoes' if field in ('crest','crest_versions') else 'pdfs' if field=='pdf' else 'imagens_municipais'
     mapped,copied=copy_file(store,source,category,code);mapping[source]=mapped;report['copied']+=int(copied)
    except Exception as error:report['pending'].append({'key':key,'path':source,'message':str(error)})
   updated=replace_paths(p,mapping)
   if updated!=json.loads(snapshot):
    with store.lock,store.connect() as db:
     current=db.execute('SELECT value FROM projects WHERE key=?',(key,)).fetchone()
     if not current or current[0]!=snapshot:
      skipped_keys.add(key)
      report['pending'].append({'key':key,'message':'Cadastro alterado durante a centralização. Os vínculos foram preservados; execute novamente.'});continue
     db.execute('UPDATE projects SET value=? WHERE key=?',(json.dumps(updated,ensure_ascii=False),key))
    report['projects']+=1
   all_mapping.update(mapping)
  # PDF padrão, modelos, histórico de PDFs e arquivos de tarefas da IA.
  progress('Conferindo modelos, histórico e restaurações…',92)
  with store.connect() as db:row=db.execute("SELECT value FROM settings WHERE key='catalogue'").fetchone()
  if row:
   snapshot=row[0];saved=store.relocate_paths(json.loads(snapshot));source=saved.get('path')
   if source:
    try:
     mapped,copied=copy_file(store,source,'modelos');saved['path']=mapped;report['copied']+=int(copied)
     with store.lock,store.connect() as db:db.execute("UPDATE settings SET value=? WHERE key='catalogue' AND value=?",(json.dumps(saved,ensure_ascii=False),snapshot))
    except Exception as error:report['pending'].append({'path':source,'message':str(error)})
  for name in ('capa.pdf','modelo.pdf','restante.pdf'):
   try:template(store,name)
   except Exception as error:report['pending'].append({'path':name,'message':str(error)})
  with store.connect() as db:
   history=db.execute('SELECT id,pdf_path FROM interactions WHERE pdf_path IS NOT NULL').fetchall();tasks=db.execute('SELECT id,value FROM restoration_tasks').fetchall()
  for event,source in history:
   try:
    resolved=store.relocate_paths(source);mapped,copied=copy_file(store,all_mapping.get(resolved,resolved),'pdfs','historico');report['copied']+=int(copied)
    with store.lock,store.connect() as db:db.execute('UPDATE interactions SET pdf_path=? WHERE id=? AND pdf_path=?',(mapped,event,source))
   except Exception as error:report['pending'].append({'path':source,'message':str(error)})
  for task_id,snapshot in tasks:
   task=store.relocate_paths(json.loads(snapshot));mapping=dict(all_mapping)
   if task.get('key') in skipped_keys:continue
   for field,source in set(project_files(task)):
    if source in mapping:continue
    try:mapped,copied=copy_file(store,source,'imagens_municipais','historico-ia');mapping[source]=mapped;report['copied']+=int(copied)
    except Exception as error:report['pending'].append({'path':source,'message':str(error)})
   updated=replace_paths(task,mapping)
   with store.lock,store.connect() as db:db.execute('UPDATE restoration_tasks SET value=? WHERE id=? AND value=?',(json.dumps(updated,ensure_ascii=False),task_id,snapshot))
  report['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%S%z')
  path=store.folder/'relatorios'/('centralizacao_'+secrets.token_hex(8)+'.json');path.parent.mkdir(parents=True,exist_ok=True);report['report_file']=str(path);path.write_text(json.dumps(report,ensure_ascii=False,indent=2));store.set_setting('storage_last_report',report);report['report_url']='/file/'+store.token_for(path)
  progress('Conferência concluída. Veja as pendências antes de remover qualquer origem.',100)
  return {**report,'status':{**status(store),'busy':False}}
 finally:
  with store.lock:store.storage_busy=False
  store.restoration_wake.set()
