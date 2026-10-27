import io,json,shutil,tempfile,unittest,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,data_storage as ds,restoration_ai as ai
from test_flow import workbook,image

class CentralStorage(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.store=app.Store(self.root/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.orig=self.root/'externas'/'originais';self.rest=self.root/'externas'/'tratadas';image(self.orig/'Pessoa.png');image(self.rest/'Pessoa.png')
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def imported(self):self.store.load_originals(self.key,str(self.orig));self.store.load_restored(self.key,str(self.rest));return self.store.project(self.key)
 def legacy(self):
  p=self.imported();p['original_folder']=str(self.orig);p['restored_folder']=str(self.rest)
  p['pairs'][0].update(original=str(self.orig/'Pessoa.png'),path=str(self.orig/'Pessoa.png'),restored=str(self.rest/'Pessoa.png'));p['restored_files'][0]['path']=str(self.rest/'Pessoa.png')
  crest=self.root/'externas'/'brasao.png';image(crest);old=self.root/'externas'/'brasao-antigo.png';image(old);p.update(crest=str(crest),crest_versions=[str(old)])
  pdf=self.root/'externas'/'catalogo.pdf';doc=app.fitz.open();doc.new_page();doc.save(pdf);doc.close();p.update(pdf=str(pdf),dirty=False,catalogue_version=1);self.store.save_project(self.key,p);self.store.set_setting('catalogue',{'path':str(pdf),'filename':'Catalogo institucional.pdf'})
  return p
 def test_originals_and_restored_imported_by_path_are_copied(self):
  p=self.imported();pair=p['pairs'][0]
  for kind,source in [('original',self.orig/'Pessoa.png'),('restored',self.rest/'Pessoa.png')]:
   self.assertTrue(ds.inside(self.store,pair[kind]));self.assertEqual(Path(pair[kind]).read_bytes(),source.read_bytes());self.assertTrue(source.is_file())
  self.assertEqual(ds.status(self.store)['external'],0)
 def test_source_can_disappear_after_import_and_pdf_still_works(self):
  p=self.imported();raw=(self.orig/'Pessoa.png').read_bytes();self.store.crest(self.key,raw,'crest.png');shutil.rmtree(self.root/'externas')
  self.assertEqual(self.store.item(self.key)['stage'],'Pronto para PDF');r=self.store.pdf(self.key);self.assertTrue(r['pages']>0);self.assertEqual(ds.status(self.store)['missing'],0)
 def test_identical_reimport_reuses_paths_and_pair_identity(self):
  p=self.imported();new=self.imported();self.assertEqual(p['pairs'][0]['id'],new['pairs'][0]['id']);self.assertEqual(p['pairs'][0]['original'],new['pairs'][0]['original']);self.assertEqual(p['pairs'][0]['restored'],new['pairs'][0]['restored'])
 def test_new_content_does_not_overwrite_previous_copy(self):
  p=self.imported();old=Path(p['pairs'][0]['original']);content=old.read_bytes();other=self.orig/'Pessoa.png';pix=app.fitz.Pixmap(app.fitz.csRGB,app.fitz.IRect(0,0,20,30),False);pix.clear_with(255);other.write_bytes(pix.tobytes('png'));self.store.load_originals(self.key,str(self.orig));new=self.store.project(self.key)
  self.assertNotEqual(str(old),new['pairs'][0]['original']);self.assertEqual(old.read_bytes(),content);self.assertEqual(p['pairs'][0]['id'],new['pairs'][0]['id'])
 def test_copy_failure_does_not_replace_saved_project(self):
  self.imported();before=self.store.project(self.key);extra=self.root/'different';image(extra/'Outra.png')
  with patch.object(ds.shutil,'copy2',side_effect=OSError('Sem espaço em disco')):
   with self.assertRaises(OSError):self.store.load_originals(self.key,str(extra))
  self.assertEqual(self.store.project(self.key),before)
 def test_migration_collects_legacy_photos_crests_pdf_models_and_history(self):
  old=self.legacy();self.store.record_interaction(self.key,{'id':'a'*24,'kind':'sent','channel':'email','target':'camara','recipient':'c@example.org','attach_pdf':True});result=ds.migrate(self.store);self.assertFalse(result['pending']);p=self.store.project(self.key)
  for _,path in ds.project_files(p):self.assertTrue(ds.inside(self.store,path));self.assertTrue(Path(path).is_file())
  self.assertFalse(p['dirty']);self.assertEqual(p['pairs'][0]['id'],old['pairs'][0]['id']);self.assertTrue(Path(old['crest']).exists());self.assertTrue(ds.inside(self.store,self.store.setting('catalogue')['path']))
  for name in ('capa.pdf','modelo.pdf','restante.pdf'):self.assertTrue(ds.template(self.store,name).is_file())
  with self.store.connect() as db:path=db.execute('SELECT pdf_path FROM interactions').fetchone()[0]
  self.assertTrue(ds.inside(self.store,path));shutil.rmtree(self.root/'externas');self.assertEqual(ds.status(self.store)['external'],0);self.assertEqual(ds.status(self.store)['missing'],0);self.assertFalse(ds.status(self.store)['busy'])
 def test_missing_file_remains_linked_and_is_reported(self):
  old=self.legacy();Path(old['pairs'][0]['restored']).unlink();result=ds.migrate(self.store);self.assertTrue(result['pending']);self.assertEqual(self.store.project(self.key)['pairs'][0]['restored'],old['pairs'][0]['restored']);self.assertGreater(ds.status(self.store)['missing'],0)
 def test_second_migration_is_idempotent(self):
  self.legacy();ds.migrate(self.store);before=self.store.project(self.key);result=ds.migrate(self.store);self.assertEqual(result['projects'],0);self.assertEqual(result['copied'],0);self.assertFalse(result['pending']);self.assertEqual(self.store.project(self.key),before)
 def test_concurrent_edit_is_preserved_and_requests_another_pass(self):
  old=self.legacy();original=ds.atomic_copy;edited=[]
  def copy_and_edit(*args,**kw):
   result=original(*args,**kw)
   if not edited:
    p=self.store.project(self.key);p['pairs'][0]['name']='Nome editado durante coleta';self.store.save_project(self.key,p);edited.append(True)
   return result
  with patch.object(ds,'atomic_copy',side_effect=copy_and_edit):result=ds.migrate(self.store)
  self.assertEqual(self.store.project(self.key)['pairs'][0]['name'],'Nome editado durante coleta');self.assertTrue(any('alterado durante' in x['message'] for x in result['pending']));self.assertEqual(self.store.project(self.key)['pairs'][0]['original'],old['pairs'][0]['original'])
 def test_restoration_queue_paths_are_collected_without_querying_api(self):
  self.legacy()
  with patch.object(ai,'api_key',return_value='TEST'):ai.enqueue(self.store,{'keys':[self.key],'redo':True})
  ds.migrate(self.store);task=ai.tasks(self.store)[0];self.assertTrue(ds.inside(self.store,task['original']));self.assertTrue(ds.inside(self.store,task['previous']));self.assertEqual(task['original'],self.store.project(self.key)['pairs'][0]['original'])
 def test_running_restoration_blocks_collection(self):
  self.legacy()
  with patch.object(ai,'api_key',return_value='TEST'):ai.enqueue(self.store,{'keys':[self.key],'redo':True})
  task=ai.tasks(self.store)[0];task['state']='running';ai.write_task(self.store,task)
  with self.assertRaisesRegex(ValueError,'restauração atual'):ds.migrate(self.store)
  self.assertFalse(getattr(self.store,'storage_busy',False))
 def test_concurrent_project_edit_does_not_retarget_queued_restoration(self):
  self.legacy()
  with patch.object(ai,'api_key',return_value='TEST'):ai.enqueue(self.store,{'keys':[self.key],'redo':True})
  old=ai.tasks(self.store)[0];original=ds.atomic_copy;edited=[]
  def copy_and_edit(*args,**kw):
   result=original(*args,**kw)
   if not edited:
    p=self.store.project(self.key);p['period']='Alterado durante coleta';self.store.save_project(self.key,p);edited.append(True)
   return result
  with patch.object(ds,'atomic_copy',side_effect=copy_and_edit):report=ds.migrate(self.store)
  current=ai.tasks(self.store)[0];self.assertEqual(current['original'],old['original']);self.assertEqual(current['previous'],old['previous']);self.assertTrue(any('alterado durante' in p['message'] for p in report['pending']))
 def test_copying_data_folder_prefers_local_copy_even_if_old_still_exists(self):
  old=self.imported();clone=self.root/'outra-maquina'/'dados';shutil.copytree(self.store.folder,clone);store=app.Store(clone)
  try:
   path=store.project(self.key)['pairs'][0]['original'];self.assertTrue(Path(path).is_relative_to(clone));self.assertNotEqual(path,old['pairs'][0]['original']);self.assertTrue(Path(old['pairs'][0]['original']).is_file())
  finally:store.contact_engine.close()
 def test_source_trace_is_kept_but_not_an_external_dependency(self):
  self.imported();p=self.store.project(self.key);self.assertEqual(p['import_sources']['original'],str(self.orig));result=ds.migrate(self.store);self.assertFalse(result['pending']);self.assertEqual(ds.status(self.store)['external'],0);self.assertEqual(self.store.project(self.key)['import_sources']['original'],str(self.orig))
