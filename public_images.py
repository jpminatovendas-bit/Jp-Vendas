"""Download público com DNS fixado por conexão e validação a cada redirecionamento."""
import http.client,ipaddress,socket,ssl,time
from urllib.parse import urlparse,urljoin

def address(url):
 u=urlparse(str(url or ''))
 if u.scheme not in ('https','http') or not u.hostname or u.username or u.password or u.port not in (None,80,443):
  raise ValueError('Abra a imagem pública original (HTTP/HTTPS). Para blob/data, baixe e importe o arquivo.')
 try:ips=list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(u.hostname,u.port or (443 if u.scheme=='https' else 80),type=socket.SOCK_STREAM)))
 except OSError as e:raise ValueError('Não foi possível resolver o endereço da imagem.') from e
 if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):raise ValueError('Endereços locais, privados e de serviços internos não são permitidos.')
 return u,ips[0]

def fetch(url,limit=10*1024*1024):
 deadline=time.monotonic()+25
 for _ in range(6):
  u,ip=address(url);remaining=deadline-time.monotonic()
  if remaining<=0:raise ValueError('Tempo de download excedido.')
  port=u.port or (443 if u.scheme=='https' else 80)
  conn=http.client.HTTPConnection(u.hostname,port,timeout=min(10,remaining))
  try:
   sock=socket.create_connection((ip,port),timeout=min(10,remaining))
   if u.scheme=='https':sock=ssl.create_default_context().wrap_socket(sock,server_hostname=u.hostname)
   conn.sock=sock
   conn.request('GET',(u.path or '/')+('?' +u.query if u.query else ''),headers={'User-Agent':'JP-Minato/1.16','Accept':'image/*'})
   response=conn.getresponse()
   if response.status in (301,302,303,307,308):
    location=response.getheader('Location')
    if not location:raise ValueError('Redirecionamento sem destino.')
    url=urljoin(url,location);continue
   if response.status!=200:raise ValueError('O site recusou a imagem (HTTP '+str(response.status)+'). Baixe e importe manualmente.')
   size=response.getheader('Content-Length')
   if size and int(size)>limit:raise ValueError('Imagem maior que 10 MB.')
   chunks=[];count=0
   while True:
    if time.monotonic()>deadline:raise ValueError('Tempo de download excedido.')
    chunk=response.read(min(65536,limit-count+1))
    if not chunk:break
    count+=len(chunk)
    if count>limit:raise ValueError('Imagem maior que 10 MB.')
    chunks.append(chunk)
   return b''.join(chunks)
  finally:conn.close()
 raise ValueError('Muitos redirecionamentos. Baixe e importe a imagem manualmente.')
