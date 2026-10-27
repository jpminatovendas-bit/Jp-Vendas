import json,sys,tempfile,unittest
from pathlib import Path
sys.path[:0]=[str(Path(__file__).resolve().parents[1]),str(Path(__file__).resolve().parent)]
import app,send_activity130 as activity
from test_flow import workbook

class SendActivity130(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.number='5548999990001';self.store.add_phone(self.key,{'target':'camara','number':self.number,'whatsapp_verified':True})
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def event(self,ident,timestamp,channel='email',target='camara',kind='sent'):
  recipient=self.number if channel=='whatsapp' else 'c@example.org'
  self.store.record_interaction(self.key,{'id':ident*24,'kind':kind,'channel':channel,'target':target,'recipient':recipient})
  with self.store.connect() as db:db.execute('UPDATE interactions SET timestamp=? WHERE id=?',(timestamp,ident*24))
 def test_day_conversion_timezone_naive_and_bad_dates(self):
  self.assertEqual(activity.day_of('2026-10-23T01:30:00Z'),('2026-10-22','2026-10-22T22:30:00-03:00'))
  self.assertEqual(activity.day_of('2026-10-23T00:30:00-03:00')[0],'2026-10-23')
  self.assertEqual(activity.day_of('2026-10-23T14:30:00')[0],'2026-10-23')
  self.assertEqual(activity.day_of('data inválida'),(None,None))
 def test_day_channel_role_aggregate_all_events_not_only_latest(self):
  self.event('a','2026-10-01T10:00:00-03:00','whatsapp');self.event('b','2026-10-23T02:30:00Z','email');self.event('c','2026-10-22T11:00:00-03:00','email');self.event('d','2026-10-23T10:00:00-03:00','email','presidente')
  item=self.store.item(self.key);bins=item['send_days'];self.assertEqual(item['send_count'],4);self.assertEqual(sum(b['count'] for b in bins),4);self.assertEqual(len(bins),3)
  email=next(b for b in bins if b['day']=='2026-10-22');self.assertEqual(email['count'],2);self.assertEqual(email['last_at'],'2026-10-22T23:30:00-03:00')
  self.assertEqual(bins[0]['channel'],'whatsapp');self.assertEqual(bins[-1]['target'],'presidente');self.assertNotIn('recipient',json.dumps(bins));self.assertNotIn('message',json.dumps(bins))
 def test_pending_rejected_contact_and_correction_do_not_count(self):
  self.event('a','2026-10-23T10:00:00-03:00','email');self.event('b','2026-10-23T10:00:00-03:00','whatsapp');self.event('c','2026-10-23T10:00:00-03:00','email',kind='contact')
  self.store.record_interaction(self.key,{'id':'d'*24,'kind':'sent','channel':'whatsapp','target':'presidente','recipient':'5548999990002'})
  self.store.correct_interaction(self.key,{'id':'a'*24,'active':False});item=self.store.item(self.key);self.assertEqual(item['send_count'],1);self.assertEqual(item['send_days'][0]['channel'],'whatsapp')
  self.store.add_phone(self.key,{'target':'camara','number':self.number,'whatsapp_verified':False});self.assertEqual(self.store.item(self.key)['send_days'],[])
 def test_correction_reactivation_and_restart_rebuild_existing_history(self):
  self.event('a','2026-09-01T10:00:00-03:00');self.store.correct_interaction(self.key,{'id':'a'*24,'active':False});self.assertEqual(self.store.item(self.key)['send_days'],[])
  self.store.correct_interaction(self.key,{'id':'a'*24,'active':True});self.store.contact_engine.close();self.store=app.Store(Path(self.tmp.name)/'dados');self.assertEqual(self.store.item(self.key)['send_days'][0]['day'],'2026-09-01')
 def test_empty_and_invalid_timestamp_keep_lifetime_without_inventing_day(self):
  self.assertEqual(self.store.item(self.key)['send_days'],[]);self.event('a','sem data')
  item=self.store.item(self.key);self.assertEqual(item['send_count'],1);self.assertIsNone(item['send_days'][0]['day']);self.assertEqual(item['send_days'][0]['count'],1)

if __name__=='__main__':unittest.main()
