"""Aplicação + SMTP TLS locais para teste do navegador, sem envio à internet."""
import json,sys,tempfile,threading
from pathlib import Path
sys.path[:0]=[str(Path.cwd()),str(Path.cwd()/'tests')]
import app,smtp_mail127 as mail,fitz
from fixtures.smtp127 import LocalSMTP
from test_flow import workbook
from http.server import ThreadingHTTPServer
root=tempfile.TemporaryDirectory();store=app.Store(Path(root.name)/'dados');store.import_xlsx(workbook());store.save_item('SC-TIJUCAS',{'Presidente Atual (Nome)':'Márcia da Silva','Email Geral da Câmara':'camara@example.org','Presidente - Email':'presidente@example.org'},{})
pdf=store.folder/'pdfs'/'Tijucas.pdf';pdf.parent.mkdir();doc=fitz.open();doc.new_page().insert_text((30,50),'PDF TESTE TIJUCAS');doc.save(pdf);doc.close();store.save_project('SC-TIJUCAS',{'pairs':[],'pdf':str(pdf),'dirty':False,'catalogue_version':1})
smtp=LocalSMTP(root.name);original=mail.smtplib.SMTP_SSL;mail.smtplib.SMTP_SSL=smtp.client_factory(original)
class Handler(app.Handler):
 def do_GET(self):
  if self.path.startswith('/test/mode/'):
   smtp.mode=self.path.rsplit('/',1)[-1];return self.response(200,{'ok':True})
  if self.path=='/test/messages':
   return self.response(200,{'messages':[{'to':str(m['To']),'subject':str(m['Subject']),'body':m.get_body().get_content(),'pdf':[{'name':p.get_filename(),'size':len(p.get_payload(decode=True))} for p in m.iter_attachments()]} for m in smtp.messages]})
  super().do_GET()
app.STORE=store;server=ThreadingHTTPServer(('127.0.0.1',0),Handler);print('PORT='+str(server.server_port),flush=True);server.serve_forever()
