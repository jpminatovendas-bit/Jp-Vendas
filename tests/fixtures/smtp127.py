"""Servidor SMTP TLS local exclusivo dos testes: nunca encaminha mensagens."""
import base64,socketserver,ssl,subprocess,threading,shutil
from pathlib import Path
from email import policy
from email.parser import BytesParser

class LocalSMTP:
 def __init__(self,folder):
  if not shutil.which('openssl'):raise RuntimeError('openssl indisponível')
  folder=Path(folder);self.cert=folder/'cert.pem';key=folder/'key.pem'
  subprocess.run(['openssl','req','-x509','-nodes','-newkey','rsa:2048','-keyout',str(key),'-out',str(self.cert),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  self.messages=[];self.mode='accepted';self.connections=0;owner=self
  context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(self.cert,key)
  class Server(socketserver.ThreadingTCPServer):
   allow_reuse_address=True;daemon_threads=True
   def get_request(self):
    sock,addr=super().get_request();return context.wrap_socket(sock,server_side=True),addr
  class Handler(socketserver.StreamRequestHandler):
   def handle(self):
    owner.connections+=1;self.wfile.write(b'220 localhost TEST SMTP\r\n');recipient=''
    while True:
     raw=self.rfile.readline()
     if not raw:return
     command=raw.decode('utf8','replace').strip();verb=command.split(' ',1)[0].upper()
     if verb in ('EHLO','HELO'):self.wfile.write(b'250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 30000000\r\n')
     elif verb=='AUTH':self.wfile.write(b'235 Authentication successful\r\n')
     elif verb=='MAIL':self.wfile.write(b'250 OK\r\n')
     elif verb=='RCPT':recipient=command;self.wfile.write(b'250 OK\r\n')
     elif verb=='DATA':
      self.wfile.write(b'354 Send data\r\n');parts=[]
      while True:
       line=self.rfile.readline()
       if not line:return
       if line==b'.\r\n':break
       parts.append(line[1:] if line.startswith(b'..') else line)
      message=BytesParser(policy=policy.default).parsebytes(b''.join(parts));owner.messages.append(message)
      if owner.mode=='uncertain':return
      self.wfile.write(b'552 Rejected by test\r\n' if owner.mode=='failed' else b'250 Queued locally for test\r\n')
     elif verb=='QUIT':self.wfile.write(b'221 Bye\r\n');return
     else:self.wfile.write(b'250 OK\r\n')
  self.server=Server(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
 def client_factory(self,original):
  def connect(host,port,**kwargs):
   if host!='smtp.uni5.net' or port!=465:raise AssertionError('Test must use the configured revenda preset')
   kwargs['context']=ssl.create_default_context(cafile=str(self.cert));return original('localhost',self.server.server_address[1],**kwargs)
  return connect
 def close(self):self.server.shutdown();self.server.server_close();self.thread.join()
