import unittest,tempfile,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,contact_extractor as c
from test_flow import workbook
class Sites(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def old(self):
  c.candidate(self.store,self.key,{'resolvedUrl':'https://novo.camara.org','source':'google_search'})
  with self.store.connect() as db:db.execute('INSERT INTO contact_jobs VALUES (?,?)',('old',json.dumps({'id':'old','mode':'search','status':'done','items':[{'key':self.key,'state':'candidate'}]})))
 def test_previous_search_result_saved_without_query_and_other_fields_kept(self):
  self.store.save_item(self.key,{'Presidente Atual (Nome)':'Presidente conferido'},{'commercial':'Cliente'});self.old();c.apply_saved_search_results(self.store);x=self.store.item(self.key);self.assertEqual(x['fields']['Website Câmara'],'https://novo.camara.org');self.assertEqual(x['fields']['Presidente Atual (Nome)'],'Presidente conferido');self.assertEqual(x['local']['commercial'],'Cliente');self.assertEqual(c.job(self.store,'old')['items'][0]['state'],'done')
 def test_later_manual_website_edit_not_replaced_by_old_suggestion(self):
  self.old();self.store.save_item(self.key,{'Website Câmara':'https://manual.camara.org'},{})
  with self.store.connect() as db:
   row=db.execute('SELECT local FROM municipalities WHERE key=?',(self.key,)).fetchone();local=json.loads(row[0]);local['website_manual_at']='2099-01-01T00:00:00-03:00';db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local),self.key))
  c.apply_saved_search_results(self.store);self.assertEqual(self.store.item(self.key)['fields']['Website Câmara'],'https://manual.camara.org')
