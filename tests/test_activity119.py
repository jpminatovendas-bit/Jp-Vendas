import copy,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,editing_activity as activity,contact_extractor as extractor
from test_flow import workbook

class Activity119(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def test_manual_change_stamps_but_noop_and_automatic_save_do_not(self):
  self.store.save_item(self.key,{}, {},manual=True);self.assertNotIn('last_manual_edit_at',self.store.item(self.key)['local'])
  self.store.save_item(self.key,{'Presidente Atual (Nome)':'Manual'}, {},manual=True)
  first=self.store.item(self.key)['local']['last_manual_edit_at']
  with patch.object(activity,'stamp',return_value='2099-01-01T01:00:00-03:00'):
   self.store.save_item(self.key,{'Presidente Atual (Nome)':'Manual'}, {},manual=True)
   self.store.save_item(self.key,{}, {'sector':'Automático'})
   self.assertEqual(self.store.item(self.key)['local']['last_manual_edit_at'],first)
   self.store.save_item(self.key,{}, {'notes':'Conferido'},manual=True)
   self.assertTrue(self.store.item(self.key)['local']['last_manual_edit_at'].startswith('2099'))
 def test_review_persists_without_altering_fields_or_commercial_status(self):
  before=self.store.item(self.key);result=activity.review(self.store,self.key)['item']
  self.assertEqual(result['fields'],before['fields']);self.assertEqual(result['contacted'],before['contacted'])
  self.assertNotIn('last_manual_edit_at',result['local']);self.assertIn('last_reviewed_at',result['local'])
  reopened=app.Store(self.store.folder)
  try:self.assertEqual(reopened.item(self.key)['local']['last_reviewed_at'],result['local']['last_reviewed_at'])
  finally:reopened.contact_engine.close()
 def test_president_email_is_replaced_by_capture_chamber_still_appends(self):
  token=self.store.connect_capture(self.store.start_capture(self.key,'https://camara.example.org/')['ticket'],1)['token']
  for kind in ('email_president','email_chamber'):
   for email in ('primeiro@example.org','novo@example.org'):
    self.store.save_capture(token,{'tab_id':1,'url':'https://camara.example.org/','kind':kind,'value':email,'direct':True})
  item=self.store.item(self.key)
  self.assertEqual(item['fields']['Presidente - Email'],'novo@example.org')
  self.assertEqual(item['fields']['Email Geral da Câmara'],'primeiro@example.org; novo@example.org')
  self.assertIn('last_manual_edit_at',item['local']);self.assertEqual(len(item['local']['captures']),4)
 def test_extractor_replaces_president_manual_email_but_preserves_other_overrides(self):
  self.store.save_item(self.key,{'Presidente - Email':'manual@example.org','Presidente Atual (Nome)':'Nome manual'}, {},manual=True)
  before=self.store.item(self.key)['local']['last_manual_edit_at']
  extractor.apply_result(self.store,self.key,{'origemDados':'https://camara.example.org/','presidenteEmail':['novo@example.org','outro@example.org'],'presidenteNome':'Automático','camaraEmail':['a@example.org','b@example.org']})
  item=self.store.item(self.key)
  self.assertEqual(item['fields']['Presidente - Email'],'novo@example.org');self.assertEqual(item['fields']['Presidente Atual (Nome)'],'Nome manual')
  self.assertEqual(item['local']['last_manual_edit_at'],before)
  self.assertIn('b@example.org',item['fields']['Email Geral da Câmara'])
  extractor.apply_result(self.store,self.key,{'origemDados':'https://camara.example.org/','presidenteEmail':'indisponível'})
  self.assertEqual(self.store.item(self.key)['fields']['Presidente - Email'],'novo@example.org')
 def test_multiple_president_emails_rejected_without_partial_changes(self):
  before=self.store.item(self.key)
  with self.assertRaises(ValueError):self.store.save_item(self.key,{'Presidente - Email':'a@exemplo.org; b@exemplo.org','Presidente Atual (Nome)':'Não salvar'}, {},manual=True)
  self.assertEqual(self.store.item(self.key),before)
 def test_phone_and_capture_noops_do_not_extend_activity(self):
  self.store.add_phone(self.key,{'target':'presidente','number':'48999991234'})
  before=self.store.item(self.key)['local']['last_manual_edit_at']
  with patch.object(activity,'stamp',return_value='2099-01-01T01:00:00-03:00'):
   self.store.add_phone(self.key,{'target':'presidente','number':'48999991234'})
  self.assertEqual(self.store.item(self.key)['local']['last_manual_edit_at'],before)

if __name__=='__main__':unittest.main()
