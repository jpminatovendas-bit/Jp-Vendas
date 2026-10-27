import io,json,os,smtplib,tempfile,threading,time,unittest,sys
from pathlib import Path
from unittest.mock import patch,MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,smtp_mail127 as mail,fitz,openpyxl
from test_flow import workbook

class SMTP127(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
  self.pdf=self.store.folder/'pdfs'/'Tijucas.pdf';self.pdf.parent.mkdir();doc=fitz.open();doc.new_page().insert_text((20,40),'PDF TIJUCAS TESTE');doc.save(self.pdf);doc.close()
  self.store.save_project(self.key,{'pairs':[],'pdf':str(self.pdf),'dirty':False,'catalogue_version':1,'layout_version':'1.33.1'})
  mail.configure(self.store,{'username':'vendas@example.org','password':'SENHA_APENAS_TESTE','from_name':'JP Minato'})
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def body(self,ident='a',**values):return {'id':ident*24,'recipient':'camara@example.org','target':'camara','subject':'Apresentação Câmara','message':'Bom dia! Texto da Câmara.','expected_pdf':str(self.pdf),**values}
 def queued(self,body=None):
  with patch.object(mail.municipal_media,'background',return_value={'job':'teste'}):return mail.prepare(self.store,self.key,body or self.body())
 def test_defaults_secret_not_exposed_and_blank_password_preserves(self):
  public=mail.public(self.store);self.assertTrue(public['configured']);self.assertEqual(public['config']['host'],'smtp.uni5.net');self.assertEqual(public['config']['port'],465);self.assertNotIn('SENHA_APENAS_TESTE',json.dumps(public))
  mail.configure(self.store,{'username':'vendas@example.org','from_name':'Nova assinatura','password':''});self.assertEqual(mail.secret_read(self.store)['password'],'SENHA_APENAS_TESTE')
  with self.assertRaises(ValueError):mail.configure(self.store,{'username':'outra@example.org','password':''})
  with self.assertRaises(ValueError):mail.configure(self.store,{'username':'vendas@example.org','port':587,'security':'ssl'})
  with self.assertRaises(ValueError):mail.configure(self.store,{'username':'vendas@example.org','host':'https://smtp.uni5.net'})
 def test_secure_connection_settings_and_starttls_before_login(self):
  fake=MagicMock()
  with patch.object(mail.smtplib,'SMTP_SSL',return_value=fake) as factory:
   mail.open_client(mail.secret_read(self.store));kwargs=factory.call_args.kwargs;self.assertTrue(kwargs['context'].check_hostname);self.assertEqual(factory.call_args.args,('smtp.uni5.net',465));fake.login.assert_called_with('vendas@example.org','SENHA_APENAS_TESTE')
  with patch.object(mail.smtplib,'SMTP',return_value=fake):
   fake.reset_mock();mail.open_client({**mail.secret_read(self.store),'security':'starttls','port':587});names=[c[0] for c in fake.mock_calls];self.assertLess(names.index('starttls'),names.index('login'))
 def test_connection_test_never_sends_and_hides_auth_server_details(self):
  with patch.object(mail,'open_client',side_effect=smtplib.SMTPAuthenticationError(535,b'SENHA_APENAS_TESTE')):
   job=mail.test_connection(self.store)
   for _ in range(100):
    result=self.store.import_status(job['job'])
    if result['status']!='running':break
    time.sleep(.01)
   self.assertFalse(result['result']['ok']);self.assertNotIn('SENHA_APENAS_TESTE',str(result))
 def test_pdf_snapshot_recipient_mime_acceptance_and_idempotency(self):
  self.queued();self.assertEqual(self.store.item(self.key)['send_count'],0)
  item=mail.lookup(self.store,'a'*24);message=mail.mime_message(item);attachments=list(message.iter_attachments());self.assertEqual(len(attachments),1);self.assertEqual(attachments[0].get_payload(decode=True),self.pdf.read_bytes());self.assertEqual(attachments[0].get_content_type(),'application/pdf');self.assertEqual(message['To'],'camara@example.org');self.assertIn('Texto da Câmara',message.get_body().get_content())
  fake=MagicMock();fake.send_message.return_value={};fake.quit.side_effect=OSError('QUIT failed after acceptance')
  # A changed current project cannot change the PDF already selected for this attempt.
  self.store.save_project(self.key,{'pdf':str(self.pdf),'dirty':True,'catalogue_version':1,'layout_version':'1.33.1'})
  with patch.object(mail,'open_client',return_value=fake):
   first=mail.deliver(self.store,item['id'],mail.secret_read(self.store));second=mail.deliver(self.store,item['id'],mail.secret_read(self.store))
  self.assertEqual(first['state'],'accepted');self.assertEqual(second['state'],'accepted');self.assertEqual(fake.send_message.call_count,1)
  h=self.store.interaction_history(self.key);self.assertEqual(len(h),1);self.assertEqual(h[0]['pdf_sha256'],item['pdf_sha256']);self.assertIn('Aceito pelo servidor SMTP',h[0]['notes']);self.assertEqual(self.store.item(self.key)['pdf_send_count'],1)
  with patch.object(mail.municipal_media,'background') as bg:mail.prepare(self.store,self.key,self.body());bg.assert_not_called()
 def test_failed_auth_or_rejected_data_do_not_record_send(self):
  for index,error in enumerate([smtplib.SMTPAuthenticationError(535,b'bad password'),smtplib.SMTPDataError(552,b'too big')]):
   ident='ab'[index];self.queued(self.body(ident));fake=MagicMock();fake.send_message.side_effect=error
   with patch.object(mail,'open_client',side_effect=error if index==0 else None,return_value=fake):result=mail.deliver(self.store,ident*24,mail.secret_read(self.store))
   self.assertEqual(result['state'],'failed');self.assertEqual(self.store.item(self.key)['send_count'],0)
 def test_disconnect_during_data_is_uncertain_without_retry_or_record(self):
  self.queued();fake=MagicMock();fake.send_message.side_effect=smtplib.SMTPServerDisconnected('lost reply')
  with patch.object(mail,'open_client',return_value=fake):
   self.assertEqual(mail.deliver(self.store,'a'*24,mail.secret_read(self.store))['state'],'uncertain');mail.deliver(self.store,'a'*24,mail.secret_read(self.store))
  self.assertEqual(fake.send_message.call_count,1);self.assertEqual(self.store.item(self.key)['send_count'],0)
 def test_concurrent_same_id_prepares_one_delivery_and_conflicts_rejected(self):
  results=[]
  with patch.object(mail.municipal_media,'background',return_value={}) as bg:
   threads=[threading.Thread(target=lambda:results.append(mail.prepare(self.store,self.key,self.body()))) for _ in range(3)]
   for t in threads:t.start()
   for t in threads:t.join()
   self.assertEqual(len(results),3);self.assertEqual(bg.call_count,1)
  with self.assertRaises(ValueError):self.queued(self.body(recipient='other@example.org'))
 def test_missing_dirty_mismatched_or_nonpdf_prevents_transmission(self):
  for change in [{'dirty':True},{'pdf':str(self.pdf)+'-absent'},{'catalogue_version':0}]:
   self.store.save_project(self.key,{'pdf':str(self.pdf),'dirty':False,'catalogue_version':1,'layout_version':'1.33.1',**change})
   with self.assertRaises(ValueError):self.queued()
  self.store.save_project(self.key,{'pdf':str(self.pdf),'dirty':False,'catalogue_version':1,'layout_version':'1.33.1'})
  with self.assertRaises(ValueError):self.queued(self.body(expected_pdf='another.pdf'))
  self.pdf.write_bytes(b'not pdf')
  with self.assertRaises(ValueError):self.queued()
  self.assertEqual(self.store.interaction_history(self.key),[])
 def test_snapshot_survives_original_deletion_and_tamper_is_detected(self):
  self.queued();item=mail.lookup(self.store,'a'*24);self.pdf.unlink();self.assertTrue(mail.mime_message(item));Path(item['pdf_path']).write_bytes(b'changed')
  with self.assertRaises(ValueError):mail.mime_message(item)
 def test_restart_does_not_resend_sending_or_queued(self):
  self.queued();other=self.queued(self.body('b'));item=mail.lookup(self.store,'a'*24);item['state']='sending';mail.persist(self.store,item)
  reopened=app.Store(self.store.folder);self.assertEqual(mail.lookup(reopened,'a'*24)['state'],'uncertain');self.assertEqual(mail.lookup(reopened,'b'*24)['state'],'failed');reopened.contact_engine.close()
 def test_chamber_director_and_attendant_survive_reimport_and_export(self):
  values={'Diretor da Câmara (Nome)':'Diretora Ana','Sec. Executivo / Atendimento (Nome)':'João do atendimento'};self.store.save_item(self.key,values,{},manual=True);self.store.import_xlsx(workbook());item=self.store.item(self.key)
  for k,v in values.items():self.assertEqual(item['fields'][k],v)
  result=self.store.export_contacts([self.key]);book=openpyxl.load_workbook(self.store.files[result['url'].split('/')[-1]]);rows=list(book.active.values);headers=list(rows[0]);self.assertEqual(rows[1][headers.index('Diretor da Câmara (Nome)')],'Diretora Ana');self.assertEqual(item['fields']['Presidente Atual (Nome)'],'Pessoa original');book.close()

 def test_unreadable_old_credential_can_be_replaced_without_disclosing_it(self):
  mail.secret_path(self.store).write_bytes(b'invalid-old-protected-file');public=mail.public(self.store);self.assertFalse(public['configured']);self.assertTrue(public['credential_error']);self.assertNotIn('invalid-old-protected-file',str(public))
  mail.configure(self.store,{'username':'vendas@example.org','password':'NOVA_SENHA_TESTE'});self.assertTrue(mail.public(self.store)['configured'])
