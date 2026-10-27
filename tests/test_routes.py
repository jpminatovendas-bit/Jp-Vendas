import json, tempfile, unittest, sys, io
from pathlib import Path
import openpyxl
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store
class Routes(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'dados')
  w=openpyxl.Workbook();s=w.active;s.append(['Código Único','Município','UF','Presidente - Partido','Presidente - Período Mandato'])
  for key,city,uf in [('RS-A','Erechim','RS'),('RS-B','Aratiba','RS'),('RS-C','Barão','RS'),('SC-D','Tijucas','SC')]:s.append([key,city,uf,'P1','2025–2026'])
  b=io.BytesIO();w.save(b);self.store.import_xlsx(b.getvalue())
 def tearDown(self):self.temp.cleanup()
 def save(self,keys,**kw):return self.store.save_route({'center':{'lat':-27.6,'lon':-52.2,'label':'Erechim'},'radius':50,'keys':keys,**kw})
 def test_persistence_names_and_no_activity(self):
  r=self.save(['RS-A'])['route'];r2=self.save(['RS-B'])['route'];self.assertNotEqual(r['id'],r2['id']);self.assertNotEqual(r['name'],r2['name'])
  reopened=Store(self.store.folder);self.assertEqual(len(reopened.routes()),2);self.assertEqual(reopened.routes()[0]['keys'],['RS-A']);self.assertFalse(reopened.item('RS-A')['contacted']);self.assertFalse(reopened.interaction_history('RS-A'))
 def test_exclude_overlap_and_explicit_manual(self):
  self.save(['RS-A']);r=self.save(['RS-A','RS-B']);self.assertEqual(r['excluded_keys'],['RS-A']);self.assertEqual(r['route']['keys'],['RS-B'])
  r=self.save(['RS-A','RS-C'],manual_keys=['RS-A'])['route'];self.assertEqual(r['keys'],['RS-A','RS-C']);self.assertEqual(r['manual_keys'],['RS-A'])
 def test_edit_ignores_self_but_rechecks_other_route(self):
  r=self.save(['RS-A'])['route'];self.save(['RS-B']);r=self.save(['RS-A','RS-B','RS-C'],id=r['id'],revision=r['revision'])['route'];self.assertEqual(r['keys'],['RS-A','RS-C']);self.assertEqual(r['revision'],2)
 def test_existing_roster_survives_manual_sharing_elsewhere(self):
  original=self.save(['RS-A'])['route'];self.save(['RS-A','RS-B'],manual_keys=['RS-A'])
  saved=self.save(['RS-A','RS-C'],id=original['id'],revision=original['revision'])
  self.assertEqual(saved['route']['keys'],['RS-A','RS-C']);self.assertFalse(saved['excluded_keys'])
 def test_conflict_does_not_overwrite(self):
  r=self.save(['RS-A'])['route'];self.save(['RS-A','RS-B'],id=r['id'],revision=r['revision'])
  with self.assertRaises(ValueError):self.save(['RS-C'],id=r['id'],revision=r['revision'])
  with self.assertRaises(ValueError):self.store.delete_route({'id':r['id'],'revision':r['revision']})
  self.assertEqual(self.store.routes()[0]['keys'],['RS-A','RS-B'])
 def test_remove_preserves_city_and_other_membership(self):
  r=self.save(['RS-A'])['route'];self.save(['RS-A','RS-B'],manual_keys=['RS-A']);self.store.save_item('RS-A',{}, {'sector':'Sul','commercial':'Cliente'})
  self.store.delete_route({'id':r['id'],'revision':r['revision']});self.assertEqual(len(self.store.routes()),1);self.assertIn('RS-A',self.store.routes()[0]['keys']);self.assertEqual(self.store.item('RS-A')['local']['commercial'],'Cliente')
 def test_revalidation_and_invalid_inputs(self):
  self.save(['RS-A'])
  with self.assertRaises(ValueError):self.save(['RS-A'])
  for keys,kwargs in [(['missing'],{}),(['SC-D'],{}),([],{}),(['RS-B'],{'radius':float('nan')}),(['RS-B'],{'radius':0})]:
   with self.assertRaises(ValueError):self.save(keys,**kwargs)
  self.assertEqual(len(self.store.routes()),1)
 def test_rename_keeps_membership_and_preserves_advanced(self):
  r=self.save(['RS-A'])['route'];self.store.save_item('RS-A',{'Município':'Erechim novo','Presidente - Partido':'P2'},{'ddd':'54','sector':'Oeste','commercial':'Interessado'})
  self.assertEqual(self.store.routes()[0]['keys'],['RS-A']);self.assertEqual(self.store.item('RS-A')['fields']['Presidente - Período Mandato'],'2025–2026');self.assertEqual(self.store.item('RS-A')['local']['sector'],'Oeste')
if __name__=='__main__':unittest.main()

class RouteIdentity(unittest.TestCase):
 setUp=Routes.setUp
 tearDown=Routes.tearDown
 save=Routes.save
 def test_identity_migration_colors_and_never_reuse_deleted_number(self):
  a=self.save(['RS-A'])['route'];b=self.save(['RS-B'])['route'];self.assertEqual((a['number'],b['number']),(1,2));self.assertNotEqual(a['color'],b['color'])
  updated=self.save(['RS-A','RS-C'],id=a['id'],revision=a['revision'])['route'];self.assertEqual((updated['number'],updated['color']),(a['number'],a['color']))
  self.store.delete_route({'id':b['id'],'revision':b['revision']});c=self.save(['RS-B'])['route'];self.assertEqual(c['number'],3)
  with self.store.connect() as db:
   legacy={'name':'Antiga','keys':['RS-B'],'manual_keys':[],'center':{'lat':-27,'lon':-52,'label':'Centro'},'radius':30,'created_at':'2026-10-11T12:00:00-03:00','revision':1};db.execute('INSERT INTO commercial_routes VALUES (?,?)',('legacy',json.dumps(legacy)))
  reopened=Store(self.store.folder);legacy=next(r for r in reopened.routes() if r['id']=='legacy');self.assertEqual(legacy['number'],4);self.assertTrue(legacy['color'].startswith('#'));self.assertEqual(legacy['keys'],['RS-B']);self.assertEqual(legacy,reopened.routes()[-1])
