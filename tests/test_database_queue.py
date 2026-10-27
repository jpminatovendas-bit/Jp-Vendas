import unittest,sys,tempfile,sqlite3,io,time,threading,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,contact_extractor as c,openpyxl
from unittest.mock import patch
class DatabaseQueue(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados');w=openpyxl.Workbook();s=w.active;s.append(['Código Único','Município','UF','Website Câmara'])
  for i in range(333):s.append(['SC-'+str(i),'Cidade '+str(i),'SC','https://camara.example.org'])
  b=io.BytesIO();w.save(b);self.store.import_xlsx(b.getvalue());self.store.set_setting('contact_extractor_config',{'interval':0,'concurrency':2})
  class Dummy:
   def ensure(self,config):pass
   def call(self,*args):return {'data':{'valid':True,'resolvedUrl':'https://nova.camara.example.org','source':'google_search'}}
   def close(self):pass
  self.store.contact_engine.close();self.store.contact_engine=Dummy()
 def tearDown(self):self.tmp.cleanup()
 def wait(self,jid):
  limit=time.time()+25
  while time.time()<limit:
   j=c.job(self.store,jid)
   if j['status']!='running':return j
   time.sleep(.02)
  self.fail('Fila não terminou')
 def test_connections_close_and_failed_transaction_rolls_back(self):
  with self.store.connect() as db:
   cursor=db.execute('SELECT key FROM municipalities');cursor.fetchone()
  with self.assertRaises(sqlite3.ProgrammingError):db.execute('SELECT 1')
  with self.assertRaises(sqlite3.ProgrammingError):cursor.fetchone()
  with self.assertRaises(ValueError):
   with self.store.connect() as db:
    db.execute("INSERT INTO settings VALUES ('must_rollback','true')");raise ValueError('rollback')
  self.assertIsNone(self.store.setting('must_rollback'))
 def test_333_with_active_reader_external_write_ui_poll_and_manual_edit(self):
  reader=sqlite3.connect(self.store.db_path);self.assertEqual(reader.execute('PRAGMA journal_mode').fetchone()[0],'wal');reader.execute('BEGIN');reader.execute('SELECT key FROM municipalities').fetchone()
  stop=threading.Event();errors=[];ready=threading.Event()
  def hold_write():
   db=sqlite3.connect(self.store.db_path,timeout=15)
   try:db.execute('BEGIN IMMEDIATE');db.execute("INSERT OR REPLACE INTO settings VALUES ('external','true')");ready.set();time.sleep(.2);db.commit()
   except Exception as e:errors.append(e)
   finally:db.close()
  def ui():
   try:
    for i in range(30):
     c.jobs(self.store);self.store.item('SC-0');self.store.save_item('SC-0',{'Presidente Atual (Nome)':'Nome conferido'},{'commercial':'Cliente'});time.sleep(.005)
   except Exception as e:errors.append(e)
  try:
   jid=c.start(self.store,['SC-'+str(i) for i in range(333)],'search','333')['job'];writers=threading.Thread(target=hold_write);writers.start();self.assertTrue(ready.wait(3));poll=threading.Thread(target=ui);poll.start();j=self.wait(jid);writers.join();poll.join()
   self.assertEqual(errors,[]);self.assertEqual(j['status'],'done');self.assertEqual(sum(x['state']=='done' for x in j['items']),333);self.assertFalse(j.get('error'));self.assertEqual(self.store.item('SC-0')['fields']['Presidente Atual (Nome)'],'Nome conferido');self.assertEqual(self.store.item('SC-0')['local']['commercial'],'Cliente');self.assertFalse(self.store.interaction_history('SC-0'))
  finally:reader.rollback();reader.close()
 def test_worker_failure_for_one_item_does_not_abort_rest(self):
  original=c.update_job;count=[0]
  def fail_once(*args,**kw):
   count[0]+=1
   if count[0]==1:raise sqlite3.OperationalError('database is locked')
   return original(*args,**kw)
  with patch.object(c,'update_job',side_effect=fail_once):j=self.wait(c.start(self.store,['SC-'+str(i) for i in range(10)],'search','dez')['job'])
  self.assertEqual(j['status'],'done');self.assertEqual(sum(x['state']=='error' for x in j['items']),1);self.assertEqual(sum(x['state']=='done' for x in j['items']),9)
 def test_legacy_failed_queue_normalizes_unfinished_and_keeps_candidates(self):
  with self.store.connect() as db:db.execute('INSERT INTO contact_jobs VALUES (?,?)',('old',json.dumps({'id':'old','status':'error','error':'database is locked','items':[{'key':'SC-0','state':'candidate'},{'key':'SC-1','state':'running'},{'key':'SC-2','state':'pending'}]})))
  new=app.Store(self.store.folder)
  try:
   j=c.job(new,'old');self.assertEqual([x['state'] for x in j['items']],['candidate','interrupted','interrupted']);self.assertEqual(j['error'],'database is locked')
  finally:new.contact_engine.close()

 def test_resume_excludes_completed_candidates_and_failures_and_preserves_original(self):
  previous={'id':'previous','mode':'search','label':'Original','status':'error','items':[{'key':'SC-0','state':'candidate'},{'key':'SC-1','state':'done'},{'key':'SC-2','state':'error'},{'key':'SC-3','state':'interrupted'},{'key':'SC-4','state':'pending'}]}
  with self.store.connect() as db:db.execute('INSERT INTO contact_jobs VALUES (?,?)',('previous',json.dumps(previous)))
  j=self.wait(c.resume(self.store,'previous')['job']);self.assertEqual([x['key'] for x in j['items']],['SC-3','SC-4']);self.assertEqual(j['status'],'done');self.assertEqual(c.job(self.store,'previous'),previous)
