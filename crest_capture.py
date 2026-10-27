"""Busca na Wikipédia e captura autorizada de brasões Wikimedia."""
import io,json,re,time,urllib.request,unicodedata
from html.parser import HTMLParser
from urllib.parse import urlparse,urlencode,quote,unquote,urljoin,parse_qs
import fitz
import public_images,capture_routes
HOSTS={'pt.wikipedia.org','en.wikipedia.org','commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'}
STATES={'RS':'Rio Grande do Sul','SC':'Santa Catarina','PR':'Paraná','SP':'São Paulo','RJ':'Rio de Janeiro','MG':'Minas Gerais','ES':'Espírito Santo','BA':'Bahia','SE':'Sergipe','AL':'Alagoas','PE':'Pernambuco','PB':'Paraíba','RN':'Rio Grande do Norte','CE':'Ceará','PI':'Piauí','MA':'Maranhão','PA':'Pará','AM':'Amazonas','AP':'Amapá','RR':'Roraima','AC':'Acre','RO':'Rondônia','MT':'Mato Grosso','MS':'Mato Grosso do Sul','GO':'Goiás','TO':'Tocantins','DF':'Distrito Federal'}
def allowed(url):
 u=urlparse(str(url));
 if u.scheme!='https' or u.hostname not in HOSTS or u.username or u.password or u.port not in (None,443):raise ValueError('Use uma imagem/página da Wikipédia ou Wikimedia Commons.')
 return url
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):allowed(newurl);return super().redirect_request(req,fp,code,msg,headers,newurl)
def fetch(url,limit=10*1024*1024):
 allowed(url)
 return public_images.fetch(url,limit)
def query(params,host='pt.wikipedia.org'):return json.loads(fetch('https://'+host+'/w/api.php?'+urlencode({'action':'query','format':'json',**params}),1024*1024))
def normalized(text):return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFD',str(text)).encode('ascii','ignore').decode().lower()).strip()
def title_matches(title,city,uf):
 title=str(title).replace('_',' ')
 if ':' in title:return False
 base=re.sub(r'\s*\([^)]*\)\s*$','',title)
 if normalized(base)!=normalized(city):return False
 if '(' in title:
  suffix=title[title.rfind('(')+1:].rstrip(') ')
  if normalized(suffix) not in (normalized(STATES.get(uf,'')),normalized(uf)):return False
 return True
class GoogleRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  u=urlparse(newurl)
  if u.scheme!='https' or u.hostname not in ('www.google.com','consent.google.com') or u.username or u.password or u.port not in (None,443):raise ValueError('Busca redirecionou para outro domínio.')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
def google_html(url):
 u=urlparse(url)
 if u.scheme!='https' or u.hostname!='www.google.com' or u.path!='/search':raise ValueError('Busca Google inválida.')
 with urllib.request.build_opener(GoogleRedirect()).open(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 JP-Minato/1.14.1','Accept-Language':'pt-BR,pt;q=0.9'}),timeout=6) as r:
  data=r.read(2*1024*1024+1)
  if len(data)>2*1024*1024:raise ValueError('Busca muito grande.')
  return data.decode('utf-8',errors='replace')
def google_candidates(html):
 result=[]
 class Links(HTMLParser):
  def handle_starttag(self,tag,attrs):
   if tag!='a':return
   href=dict(attrs).get('href','');u=urlparse(urljoin('https://www.google.com',href))
   if u.hostname=='www.google.com' and u.path=='/url':href=parse_qs(u.query).get('q',parse_qs(u.query).get('url',['']))[0]
   else:href=u.geturl()
   u=urlparse(href)
   if u.scheme=='https' and u.hostname=='pt.wikipedia.org' and not u.username and not u.password and u.port in (None,443) and u.path.startswith('/wiki/'):
    url='https://pt.wikipedia.org'+u.path
    if url not in result:result.append(url)
 Links().feed(html)
 return result[:20]
def validate_article(url,city,uf):
 title=unquote(urlparse(url).path[len('/wiki/'):]).replace('_',' ')
 if not title_matches(title,city,uf):return None
 data=query({'prop':'extracts|pageprops','exintro':1,'explaintext':1,'titles':title,'redirects':1})
 for page in data.get('query',{}).get('pages',{}).values():
  if 'missing' in page or 'disambiguation' in page.get('pageprops',{}) or not title_matches(page.get('title',''),city,uf):continue
  first=page.get('extract','').strip().split('. ')[0];text=' '+normalized(first)+' '
  states=[name for name in STATES.values() if ' '+normalized(name)+' ' in text]
  if states!=[STATES.get(uf)]:continue
  if not re.search(r'\bmunicipio\b',normalized(first)) or not re.search(r'\bestado\b',normalized(first)):continue
  return 'https://pt.wikipedia.org/wiki/'+quote(page['title'].replace(' ','_'),safe='')
 return None
def start(store,key):
 item=store.item(key);city=item['fields']['Município'];uf=item['fields']['UF']
 search='brasão '+city+' '+uf
 result=store.start_capture(key,'https://www.google.com/search?'+urlencode({'q':search}))
 with store.lock:store.capture_tickets[result['ticket']]['scope']='crest'
 return {**result,'message':'Escolha a imagem nos resultados. Use o botão direito → Salvar como brasão deste município.','search_query':search,'verified':False}

def original_file(src):
 u=urlparse(src);parts=u.path.split('/')
 if u.hostname in ('upload.wikimedia.org','thumb.wikimedia.org') and 'thumb' in parts:
  pos=parts.index('thumb');parts.pop(pos)
  if len(parts)>pos+3:parts=parts[:-1]
  return u._replace(path='/'.join(parts),query='',fragment='').geturl()
 return src

def as_png(raw):
 if b'<svg' in raw[:2048].lower():
  import xml.etree.ElementTree as ET
  try:root=ET.fromstring(raw)
  except ET.ParseError:raise ValueError('SVG inválido.')
  for element in root.iter():
   for attr,value in element.attrib.items():
    if attr.split('}')[-1].lower()=='href' and not value.startswith('#'):raise ValueError('SVG com referência externa não permitido.')
  for reference in re.findall(br'url\s*\(([^)]*)\)',raw,re.I):
   if not reference.strip().strip(b"\"'").startswith(b'#'):raise ValueError('SVG com referência externa não permitido.')
  if re.search(br'@import|<\?xml-stylesheet',raw,re.I):raise ValueError('Folha externa no SVG não permitida.')
  if len(raw)>3*1024*1024 or re.search(br'<!DOCTYPE|<!ENTITY|<script|<foreignObject|(?:href|url)\s*[=(]\s*["\']?(?:https?:|file:|//)',raw,re.I):raise ValueError('SVG contém conteúdo externo ou não suportado.')
  with fitz.open(stream=raw,filetype='svg') as doc:
   page=doc[0];rect=page.rect
   if not 0<rect.width<100000 or not 0<rect.height<100000:raise ValueError('Dimensões inválidas.')
   pix=page.get_pixmap(matrix=fitz.Matrix(1600/max(rect.width,rect.height),1600/max(rect.width,rect.height)),alpha=True)
 else:
  # image_profile() falha no binding SWIG de algumas versões do PyMuPDF,
  # inclusive com PNG válido. Ler metadados pela página não carrega os pixels.
  try:
   if raw[:4]==b'RIFF' and raw[8:12]==b'WEBP':
    # MuPDF não lê WebP em todas as instalações. Converter pelo codec Pillow.
    from PIL import Image
    with Image.open(io.BytesIO(raw)) as webp:
     if webp.format!='WEBP' or getattr(webp,'n_frames',1)!=1 or not 0<webp.width*webp.height<=16000000:raise ValueError('WebP inválido ou fora do limite.')
     output=io.BytesIO()
     with webp.convert('RGBA' if webp.mode in ('RGBA','LA') or 'transparency' in webp.info else 'RGB') as converted:converted.save(output,format='PNG')
     raw=output.getvalue()
   with fitz.open(stream=raw) as image_doc:
    if image_doc.is_pdf or image_doc.page_count!=1 or image_doc.metadata.get('format')!='Image':raise ValueError('Não é uma imagem raster.')
    images=image_doc[0].get_image_info(hashes=False,xrefs=False)
    if len(images)!=1 or not 0<images[0]['width']*images[0]['height']<=16000000:raise ValueError('Resolução fora do limite.')
   pix=fitz.Pixmap(raw)
  except Exception as error:
   raise ValueError('Não foi possível ler o brasão. Use PNG, JPG ou WebP válido de até 16 milhões de pixels; se o site bloqueou a imagem, baixe o original e importe pelo campo Brasão.') from error
  if pix.width*pix.height>16000000:raise ValueError('Brasão excede o limite de resolução.')
  if pix.n>4:pix=fitz.Pixmap(fitz.csRGB,pix)
 return pix.tobytes('png')
def capture(store,token,body):
 binding=capture_routes.check(store,token,body,'crest')
 if binding.get('scope')!='crest':raise ValueError('Abra Buscar brasão na Wikipédia pelo município no MVP para vincular a aba.')
 source=capture_routes.canonical(body.get('url',''));src=str(body.get('src_url',''));key=binding['key'];item=store.item(key);target=original_file(src);metadata={}
 # File metadata is optional; failure never fabricates provenance.
 try:
  
  if urlparse(target).hostname not in HOSTS:raise ValueError('Fonte externa à Wikimedia.')
  filename=unquote(urlparse(target).path.split('/')[-1]);data=query({'prop':'imageinfo','titles':'File:'+filename,'iiprop':'url|extmetadata','iiextmetadatafilter':'LicenseShortName|Artist|Credit'},'commons.wikimedia.org')
  info=next(iter(data.get('query',{}).get('pages',{}).values())).get('imageinfo',[{}])[0];metadata=info.get('extmetadata',{})
  if info.get('url'):target=allowed(info['url'])
 except Exception:pass
 raw=public_images.fetch(target)
 png=as_png(raw)
 with store.lock:
  store.crest(key,png,'brasao.png');p=store.project(key);p['crest_source']={'page':source,'file':target,'captured_at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'metadata':metadata};store.save_project(key,p)
  with store.connect() as db:
   local=json.loads(db.execute('SELECT local FROM municipalities WHERE key=?',(key,)).fetchone()[0]);local.setdefault('captures',[]).append({'field':'Brasão','value':target,'url':source,'timestamp':p['crest_source']['captured_at']});db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),key))
  store.capture_sequence+=1;store.capture_events.append((store.capture_sequence,key));store.capture_events=store.capture_events[-200:];store.capture_updates.append({'sequence':store.capture_sequence,'key':key,'field':'Brasão'});store.capture_updates=store.capture_updates[-200:];store.capture_condition.notify_all()
 return {'ok':True,'municipality':item['fields']['Município'],'uf':item['fields']['UF'],'value':'Brasão salvo','sequence':store.capture_sequence}
