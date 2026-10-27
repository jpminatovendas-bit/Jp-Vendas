"""Vínculos de captura: uma aba, um município e um percurso autorizado."""
import re,secrets,time
from urllib.parse import urlparse,unquote,quote

def canonical(value):
 u=urlparse(str(value or ''))
 if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.port not in (None,80,443):
  raise ValueError('Página de captura inválida.')
 host=u.hostname.lower();host=('['+host+']') if ':' in host else host
 if u.port and u.port!=(443 if u.scheme=='https' else 80):host+=':'+str(u.port)
 return u._replace(netloc=host,path=quote(u.path or '/',safe="/%:@!$&'()*+,;=-._~"),query=quote(u.query,safe="%:@!$&'()*+,;=/?-._~"),fragment='').geturl()

def tenant(url):
 """Preserva o primeiro segmento em portais que hospedam várias câmaras."""
 u=urlparse(url);parts=[p for p in unquote(u.path).split('/') if p]
 return parts[0].lower() if parts else ''

def contacts_allowed(store,binding,url):
 origin=urlparse(binding['url']);target=urlparse(url)
 if origin.hostname.removeprefix('www.')!=target.hostname.removeprefix('www.'):return False
 # Um domínio compartilhado por cadastros diferentes não libera outros tenants.
 ownparts=[p for p in unquote(origin.path).split('/') if p]
 parts=[p for p in unquote(target.path).split('/') if p]
 for item in store.items():
  other=item['fields'].get('Website Câmara','');u=urlparse(str(other))
  if item['key']==binding['key'] or not u.hostname or u.hostname.removeprefix('www.')!=origin.hostname.removeprefix('www.'):continue
  otherparts=[p for p in unquote(u.path).split('/') if p]
  if otherparts==ownparts:continue
  for index,(own,foreign) in enumerate(zip(ownparts,otherparts)):
   if own!=foreign:
    if parts[:index+1]!=ownparts[:index+1]:return False
    break
  else:
   # Um cadastro na raiz e outro em subpasta não têm limite seguro inferível.
   if len(ownparts)!=len(otherparts):return False
 item=store.item(binding['key'])
 city=re.sub('[^a-z0-9]','',__import__('unicodedata').normalize('NFKD',item['fields']['Município']).encode('ascii','ignore').decode().lower())
 for index,part in enumerate(ownparts):
  if city and city in re.sub('[^a-z0-9]','',part.lower()) and parts[:index+1]!=ownparts[:index+1]:return False
 # Na ausência de outros cadastros do domínio, um segmento não genérico é
 # tratado conservadoramente como limite do portal municipal.
 generic={'br','pt','ptbr','index','inicio','home','portal','site','sites','camara','camaras','municipio','municipios','tenant','tenants','legislativo','sapl','institucional','contato','contatos','mesadiretora','mesa','presidente','presidencia','vereadores','noticias','transparencia'}
 for index,part in enumerate(ownparts):
  if '.' not in part and re.sub('[^a-z0-9]','',part.lower()) not in generic:
   if parts[:index+1]!=ownparts[:index+1]:return False
   break
 return True

def advance(store,token,body):
 with store.lock:
  b=store.capture_binding(token);tab=str(body.get('tab_id',''));url=canonical(body.get('url'));source=canonical(body.get('from_url'))
  pages=b.setdefault('pages',{});old=pages.get(tab)
  if not old or source!=old:raise ValueError('Esta aba saiu do percurso de captura. Reabra pelo município no MVP.')
  if body.get('transition') not in ('link','form_submit','reload','redirect'):
   pages.pop(tab,None);raise ValueError('Endereço digitado ou aba externa: inicie uma nova captura pelo MVP.')
  if b.get('scope','contacts')=='contacts' and not contacts_allowed(store,b,url):
   pages.pop(tab,None);raise ValueError('Este site não pertence ao percurso da Câmara selecionada.')
  child=str(body.get('child_tab_id',''))
  if child:
   if not child.isdigit() or child in pages:raise ValueError('Nova aba inválida.')
   pages[child]=url
  else:pages[tab]=url
  return {'ok':True,'url':url}

def check(store,token,body,scope):
 b=store.capture_binding(token)
 if b.get('scope','contacts')!=scope:raise ValueError('A finalidade desta aba não permite salvar este dado.')
 url=canonical(body.get('url'));tab=str(body.get('tab_id',''))
 if not tab or b.get('pages',{}).get(tab)!=url:
  raise ValueError('Página sem vínculo autorizado. Abra a captura novamente pelo município no MVP.')
 if scope=='contacts' and not contacts_allowed(store,b,url):raise ValueError('Página fora da Câmara selecionada.')
 return b
