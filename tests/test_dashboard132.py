import sys,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime
sys.path[:0]=[str(Path(__file__).resolve().parents[1]),str(Path(__file__).resolve().parent)]
import app,dashboard132 as d,operators131,whatsapp_send126
from test_flow import workbook
class Dashboard132(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.token=operators131.CURRENT.set('Jeff')
  self.store.add_phone(self.key,{'target':'camara','number':'48999990001','whatsapp_verified':False})
  route={'number':1,'name':'Rota Jeff','owner':'Jeff','keys':[self.key],'revision':1}
  with self.store.connect() as db:db.execute('INSERT INTO commercial_routes VALUES (?,?)',('route',json.dumps(route)))
 def tearDown(self):operators131.CURRENT.reset(self.token);self.store.contact_engine.close();self.tmp.cleanup()
 def summary(self,who='Jeff',**q):return d.summary(self.store,{k:[v] for k,v in q.items()},who)
 def test_personal_general_cross_route_and_call_authorship(self):
  operators131.CURRENT.set('Lara');d.call(self.store,{'id':'a'*24,'key':self.key,'number':'5548999990001','outcome':'atendeu'})
  self.assertEqual(self.summary('Lara')['metrics']['cities'],0)
  general=self.summary('Lara',owner='all');self.assertEqual(general['metrics']['calls'],1)
  mine=self.summary('Jeff');self.assertEqual(mine['metrics']['calls'],0);self.assertEqual(mine['metrics']['contacted'],1)
  self.assertEqual(self.summary('Lara',route='route')['metrics']['calls'],1)
  self.assertEqual(self.store.routes()[0]['owner'],'Jeff')
  self.assertTrue(self.store.item(self.key)['contacted']);self.assertEqual(self.store.item(self.key)['send_count'],0)
 def test_queue_only_chamber_confirmed_current_number_and_no_phone_search(self):
  self.assertIn(self.key,[x['key'] for x in self.summary()['queue']])
  self.store.add_phone(self.key,{'target':'presidente','number':'48999990002','whatsapp_verified':True})
  self.assertIn(self.key,[x['key'] for x in self.summary()['queue']])
  self.store.add_phone(self.key,{'target':'camara','number':'48999990001','whatsapp_verified':True})
  self.assertNotIn(self.key,[x['key'] for x in self.summary()['queue']])
  self.store.save_item(self.key,{'Telefone Planilha Original':'','Telefones Coletados no Site':'','WhatsApp(s) da Câmara (Botões/Links)':''},{})
  queue=self.summary()['queue'];self.assertEqual(queue[0]['reason'],'Buscar contato')
 def test_task_revision_shared_edit_completion_author_and_dates(self):
  task=d.save_task(self.store,{'key':self.key,'owner':'Jeff','title':'Retornar','due':'2026-10-20T10:00'})
  operators131.CURRENT.set('Lara');done=d.save_task(self.store,{**task,'state':'done'})
  self.assertEqual(done['owner'],'Jeff');self.assertEqual(done['done_by'],'Lara')
  self.assertEqual(self.summary('Lara')['metrics']['done'],1);self.assertEqual(self.summary('Jeff')['metrics']['done'],0)
  with self.assertRaises(ValueError):d.save_task(self.store,{**task,'title':'Concorrente'})
  reopened=d.save_task(self.store,{**done,'state':'pending'});self.assertNotIn('done_at',reopened)
 def test_lead_requires_seller_no_duplicate_event_and_conversation_manual(self):
  b={'key':self.key,'stage':'encaminhado','owner':'Jeff'}
  with self.assertRaises(ValueError):d.save_case(self.store,b)
  c=d.save_case(self.store,{**b,'seller':'Vendedor A'});d.save_case(self.store,{**c,'notes':'Mesma entrega','handoff_state':'assumido'})
  self.assertEqual(self.summary()['metrics']['assumed'],1)
  self.assertEqual(self.summary()['metrics']['leads'],1)
  with self.assertRaises(ValueError):d.save_case(self.store,c)
  c=self.summary()['cases'][self.key];d.save_case(self.store,{**c,'stage':'conversa'})
  self.assertEqual(self.summary()['metrics']['conversations'],1)
 def test_call_idempotent_retry_validation_no_false_contact(self):
  body={'id':'b'*24,'key':self.key,'outcome':'nao_atendeu'};d.call(self.store,body);d.call(self.store,body)
  self.assertEqual(self.summary()['metrics']['calls'],1);self.assertEqual(self.summary()['metrics']['contacted'],0)
  with self.assertRaises(ValueError):d.call(self.store,{**body,'outcome':'atendeu'})
  with self.assertRaises(ValueError):d.call(self.store,{**body,'id':'c'*24,'outcome':'retornar'})
 def test_periods_timezone_and_actual_send_not_click_or_uncertain(self):
  fixed=datetime(2026,10,24,12,tzinfo=d.TZ)
  self.store.record_interaction(self.key,{'id':'d'*24,'kind':'sent','channel':'email','target':'camara','recipient':'c@example.org'})
  with self.store.connect() as db:
   db.execute('UPDATE interactions SET timestamp=? WHERE id=?',('2026-10-18T23:30:00-03:00','d'*24))
   db.execute('INSERT INTO smtp_attempts VALUES (?,?)',('d'*24,json.dumps({'operator':'Lara'})))
  with patch.object(d,'now',return_value=fixed):
   self.assertEqual(self.summary('Lara',period='week')['metrics']['email'],0)
   self.assertEqual(self.summary('Lara',period='7')['metrics']['email'],1)
   self.assertEqual(self.summary('Jeff',period='7')['metrics']['email'],0)
   self.assertEqual(self.summary('Jeff',period='7',owner='all')['metrics']['email'],1)
  with self.assertRaises(ValueError):self.summary(period='custom',start='2026-10-24',end='2026-10-01')
 def test_callback_follows_caller_without_transferring_route_and_closes_when_confirmed(self):
  operators131.CURRENT.set('Lara')
  d.call(self.store,{'id':'f'*24,'key':self.key,'outcome':'retornar','retry':'2026-10-25T10:00'})
  self.assertEqual(len(self.summary('Lara')['callbacks']),1)
  self.assertEqual(self.store.routes()[0]['owner'],'Jeff')
  self.store.add_phone(self.key,{'target':'camara','number':'48999990001','whatsapp_verified':True})
  self.assertEqual(self.summary('Lara')['callbacks'],[])
 def test_invalid_inputs_and_no_operator(self):
  with self.assertRaises(ValueError):self.summary(owner='Inexistente')
  with self.assertRaises(ValueError):self.summary(route='missing')
  operators131.CURRENT.set(None)
  with self.assertRaises(ValueError):d.save_task(self.store,{'title':'Inválida'})
if __name__=='__main__':unittest.main()
