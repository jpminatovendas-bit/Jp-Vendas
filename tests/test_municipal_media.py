import unittest,tempfile,sys,json,zipfile,shutil,io
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,municipal_media as m,openpyxl
from test_flow import workbook,image
class Media(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.store=app.Store(self.root/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.code=self.store.item(self.key)['code']
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def folder(self,parent='entrada'):
  path=self.root/parent/(self.code+'_TIJUCAS_SC');path.mkdir(parents=True);return path
 def test_codes_fixed_on_edit_reimport_restart_and_unique(self):
  self.store.save_item(self.key,{'Município':'Nome editado'},{'commercial':'Cliente'});self.store.import_xlsx(workbook());self.assertEqual(self.store.item(self.key)['code'],self.code);new=app.Store(self.store.folder)
  try:self.assertEqual(new.item(self.key)['code'],self.code);self.assertEqual(new.item(self.key)['fields']['Município'],'Nome editado')
  finally:new.contact_engine.close()
  w=openpyxl.Workbook();s=w.active;s.append(['Código Único','Município','UF']);s.append(['RS-NOVA','Outra','RS']);b=io.BytesIO();w.save(b);self.store.import_xlsx(b.getvalue());self.assertNotEqual(self.store.item('RS-NOVA')['code'],self.code)
 def test_copy_owned_identical_reimport_restore_match_and_origin_removed(self):
  f=self.folder();image(f/'JOAO.png');r=m.import_folders(self.store,f.parent);self.assertEqual(r['imported'],1);p=self.store.project(self.key);original=p['pairs'][0]['original'];pid=p['pairs'][0]['id'];self.assertTrue(Path(original).is_relative_to(self.store.folder));r=m.import_folders(self.store,f.parent);self.assertEqual(r['identical'],1);self.assertEqual(self.store.project(self.key)['pairs'][0]['id'],pid)
  restored=self.folder('tratadas');image(restored/'JOAO.png');r=m.import_folders(self.store,restored.parent,'restored');self.assertEqual(r['imported'],1);self.assertTrue(self.store.project(self.key)['pairs'][0]['restored']);shutil.rmtree(f.parent);shutil.rmtree(restored.parent);self.assertTrue(Path(original).is_file())
 def test_zip_manifest_subfolder_missing_images_summary_and_round_trip(self):
  f=self.folder();image(f/'JOAO.png');image(f/'sub'/'MARIA.png');m.import_folders(self.store,f.parent);self.store.project(self.key)
  r=m.export_batch(self.store,[self.key]);path=Path(self.store.files[r['url'].split('/')[-1]]);self.assertEqual(r['photos'],2)
  with zipfile.ZipFile(path) as z:
   names=z.namelist();manifest=next(n for n in names if n.endswith('/manifest.json'));value=json.loads(z.read(manifest));self.assertEqual(value['municipal_code'],self.code);self.assertTrue(manifest.startswith('Fotos_originais_selecionados/'+self.code));z.extractall(self.root/'devolvidas')
  r=m.import_folders(self.store,self.root/'devolvidas','restored');self.assertEqual(r['imported'],2);self.assertTrue(all(p['restored'] for p in self.store.project(self.key)['pairs']))
 def test_replacement_requires_policy_and_keeps_previous_version(self):
  f=self.folder();image(f/'JOAO.png');m.import_folders(self.store,f.parent);p=self.store.project(self.key);owned=Path(p['pairs'][0]['original']);before=m.digest(owned)
  import fitz
  d=fitz.open();d.new_page().get_pixmap().save(f/'JOAO.png');d.close();r=m.import_folders(self.store,f.parent);self.assertEqual(r['conflicts'],1);self.assertEqual(m.digest(owned),before);r=m.import_folders(self.store,f.parent,replace=True);self.assertEqual(r['imported'],1);self.assertNotEqual(m.digest(owned),before);backups=list((self.store.folder/'imagens_municipais'/self.code/'versoes').rglob('JOAO.png'));self.assertEqual(m.digest(backups[0]),before)
 def test_unknown_code_duplicate_folders_and_mismatched_manifest(self):
  f=self.folder();image(f/'JOAO.png');(f/'manifest.json').write_text(json.dumps({'municipal_code':'JP-M999999'}));r=m.import_folders(self.store,f.parent);self.assertEqual(r['imported'],0);self.assertTrue(r['pending']);(f/'manifest.json').unlink();second=f.parent/(self.code+'_OUTRA_SC');image(second/'MARIA.png');r=m.import_folders(self.store,f.parent);self.assertEqual(r['imported'],0);self.assertTrue(r['pending'])
 def test_no_empty_zip_and_safe_upload_paths(self):
  with self.assertRaises(ValueError):m.export_batch(self.store,[self.key])
  with self.assertRaises(ValueError):m.upload(self.store,'a'*24,'../x.png',b'x')
  self.assertFalse(list((self.store.folder/'zips').glob('*.zip')))
 def test_batch_includes_all_selected_cities_beyond_100(self):
  w=openpyxl.Workbook();s=w.active;s.append(['Código Único','Município','UF'])
  for i in range(102):s.append(['RS-'+str(i),'Cidade '+str(i),'RS'])
  b=io.BytesIO();w.save(b);self.store.import_xlsx(b.getvalue());keys=[];shared=self.root/'foto.png';image(shared)
  for x in self.store.items():
   if not x['key'].startswith('RS-'):continue
   keys.append(x['key']);self.store.save_project(x['key'],{'pairs':[{'id':'foto','name':'Pessoa','relative':'Pessoa.png','identity':'PESSOA','original':str(shared),'selected':False}],'dirty':True})
  r=m.export_batch(self.store,keys);self.assertEqual(r['exported'],102);self.assertEqual(r['photos'],102)
