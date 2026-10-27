import hashlib,shutil,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path[:0]=[str(Path(__file__).resolve().parents[1]),str(Path(__file__).resolve().parent)]
from fixtures.smtp127 import LocalSMTP
import test_smtp127 as base
import smtp_mail127 as mail

@unittest.skipUnless(shutil.which('openssl'),'openssl necessário para teste TLS local')
class SMTPWire127(unittest.TestCase):
 setUp=base.SMTP127.setUp
 tearDown=base.SMTP127.tearDown
 body=base.SMTP127.body
 queued=base.SMTP127.queued
 # Use only these wire checks; inherited unit checks are already collected separately.
 def test_tls_wire_pdf_recipient_auth_and_no_message_on_connection_test(self):
  server=LocalSMTP(self.tmp.name);original=mail.smtplib.SMTP_SSL
  try:
   with patch.object(mail.smtplib,'SMTP_SSL',side_effect=server.client_factory(original)):
    client=mail.open_client(mail.secret_read(self.store));mail.close_client(client);self.assertEqual(server.messages,[])
    self.queued();result=mail.deliver(self.store,'a'*24,mail.secret_read(self.store))
    self.assertEqual(result['state'],'accepted');self.assertEqual(len(server.messages),1);msg=server.messages[0]
    self.assertEqual(msg['To'],'camara@example.org');self.assertEqual(msg['Subject'],'Apresentação Câmara');attachment=list(msg.iter_attachments())[0];self.assertEqual(attachment.get_payload(decode=True),self.pdf.read_bytes());self.assertEqual(attachment.get_filename(),self.pdf.name)
    self.assertEqual(self.store.item(self.key)['pdf_send_count'],1)
  finally:server.close()
