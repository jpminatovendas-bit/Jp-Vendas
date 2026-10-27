import json,sys,tempfile,unittest,shutil,sqlite3
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store,normalize_phone,phone_numbers,ROOT
from test_flow import workbook
class NumbersMap(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
 def tearDown(self):self.temp.cleanup()
 def test_normalization_fixed_mobile_and_ddd55(self):
  self.assertEqual(normalize_phone('+55 (48) 99999-1234'),'5548999991234')
  self.assertEqual(normalize_phone('(55) 3333-1234'),'555533331234')
  self.assertEqual(normalize_phone('+55 55 99999-1234'),'5555999991234')
  self.assertEqual(phone_numbers('(48) 99999-1234; +55 48 99999-1234; (48) 3333-1234'),['5548999991234','554833331234'])
 def test_reject_malformed_numbers(self):
  for n in ['1234','(10) 99999-1234','(48) 88888-1234','(48) 9999-1234','48888888888','48999991234;48999995678','abc48999991234']:
   with self.assertRaises(ValueError,msg=n):normalize_phone(n)
 def test_add_preserves_contacts_and_commercial(self):
  before=self.store.item(self.key);self.store.save_item(self.key,{}, {'commercial':'Cliente'})
  self.store.add_phone(self.key,{'target':'camara','number':'(48) 99999-4321'})
  item=self.store.item(self.key);self.assertIn(before['fields']['Telefone Planilha Original'],item['fields']['Telefone Planilha Original'])
  for f in ['Telefone Planilha Original','WhatsApp(s) da Câmara (Botões/Links)']:self.assertIn('5548999994321',phone_numbers(item['fields'][f]))
  self.assertEqual(item['local']['commercial'],'Cliente');self.assertFalse(self.store.interaction_history(self.key))
  self.assertFalse(item['local']['phone_status']['camara']['5548999994321']['whatsapp_verified']);self.assertNotIn('last_contact',item['local'])
 def test_repeat_and_manual_confirmation(self):
  payload={'target':'presidente','number':'48999994321'}
  self.store.add_phone(self.key,payload);first=self.store.item(self.key)['fields']
  self.store.add_phone(self.key,{**payload,'number':'+55 (48) 99999-4321','whatsapp_verified':True})
  item=self.store.item(self.key);self.assertEqual(first,item['fields']);self.assertTrue(item['local']['phone_status']['presidente']['5548999994321']['whatsapp_verified'])
 def test_ddd_exception(self):
  payload={'target':'camara','number':'(54) 3333-1234'}
  self.assertTrue(self.store.check_phone(self.key,payload['number'])['ddd_warning'])
  with self.assertRaises(ValueError):self.store.add_phone(self.key,payload)
  self.store.add_phone(self.key,{**payload,'confirm_ddd':True});status=self.store.item(self.key)['local']['phone_status']['camara']['555433331234']
  self.assertTrue(status['ddd_exception']);self.assertFalse(status['whatsapp_verified'])
 def test_map_497_valid_seats(self):
  data=json.loads((ROOT/'assets/maps/RS.json').read_text());self.assertEqual(len(data['features']),497)
  self.assertEqual(len({f['properties']['code'] for f in data['features']}),497)
  for f in data['features']:
   p=f['properties'];self.assertTrue(p['code'].startswith('43'));self.assertTrue(-34<p['lat']<-27);self.assertTrue(-58<p['lon']<-49);self.assertIn(f['geometry']['type'],['Polygon','MultiPolygon'])
  self.assertTrue((ROOT/'web/vendor/leaflet.js').is_file())
 def test_uploaded_database_preserved(self):
  source=ROOT.parent/'upload/empresa.sqlite'
  if not source.exists():self.skipTest('Banco real disponível na verificação local.')
  folder=Path(self.temp.name)/'migration';folder.mkdir();shutil.copy2(source,folder/'empresa.sqlite')
  with sqlite3.connect(source) as db:before={name:db.execute('SELECT * FROM '+name).fetchall() for name in ['municipalities','projects','settings','interactions']}
  migrated=Store(folder);items=migrated.items();self.assertEqual(len(items),792);self.assertEqual(sum(x['fields']['UF']=='RS' for x in items),497)
  self.assertEqual(len(migrated.setting('tse_states')['RS']['candidates']),4584);self.assertTrue(all(x['pdf_send_count']==0 for x in items))
  with migrated.connect() as db:
   for name,rows in before.items():self.assertEqual(rows,[r for r in db.execute('SELECT * FROM '+name).fetchall() if name!='settings' or r[0]!='municipal_code_counter'])
   self.assertEqual(db.execute('SELECT COUNT(*) FROM municipality_codes').fetchone()[0],792)
  self.assertFalse(migrated.catalogue_info()['available'])
 def test_managed_paths_relocated_without_db_rewrite(self):
  folder=self.store.folder;photos=folder/'tse/RS/eleitos/CIDADE/2004';photos.mkdir(parents=True)
  image=photos/'PESSOA.jpg';image.write_bytes(b'test')
  old=r'C:\Users\User\Desktop\antigo\dados\tse\RS\eleitos\CIDADE\2004\PESSOA.jpg'
  self.store.save_project(self.key,{'pairs':[{'original':old,'selected':True}], 'dirty':True})
  self.store.set_setting('roots',{'RS':{'original':r'C:\antigo\dados\tse\RS\eleitos'}})
  self.assertEqual(self.store.project(self.key)['pairs'][0]['original'],str(image.resolve()))
  self.assertEqual(self.store.root_settings()['RS']['original'],str((folder/'tse/RS/eleitos').resolve()))
  with self.store.connect() as db:raw=json.loads(db.execute('SELECT value FROM projects WHERE key=?',(self.key,)).fetchone()[0])
  self.assertEqual(raw['pairs'][0]['original'],old)
  self.assertEqual(self.store.relocate_paths(r'C:\dados\..\secret'),r'C:\dados\..\secret')
 def test_missing_catalogue_does_not_hide_data(self):
  self.store.set_setting('catalogue',{'path':r'C:\old\dados\modelos\missing.pdf','filename':'meu.pdf'})
  result=self.store.catalogue_info();self.assertFalse(result['available']);self.assertIn('cadastros',result['warning'])
  self.assertEqual(len(self.store.items()),1)
 def test_pdf_send_summary_is_distinct_from_message(self):
  self.store.add_phone(self.key,{'target':'presidente','number':'48999991234','whatsapp_verified':True})
  from datetime import datetime
  with self.store.connect() as db:
   values=[('a'*24,self.key,datetime.now().isoformat(),'sent','email','camara','c@example.com',None,None,''),('b'*24,self.key,datetime.now().isoformat(),'sent','whatsapp','presidente','5548999991234','path.pdf','envio.pdf','')]
   db.executemany('INSERT INTO interactions VALUES (?,?,?,?,?,?,?,?,?,?)',values)
  item=self.store.item(self.key);self.assertEqual(item['send_count'],2);self.assertEqual(item['pdf_send_count'],1)
  self.assertEqual(item['last_pdf_send']['pdf_name'],'envio.pdf');self.assertEqual(item['last_pdf_send']['target'],'presidente')
