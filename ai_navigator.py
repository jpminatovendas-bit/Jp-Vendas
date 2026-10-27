"""Navegação pública guiada por IA, iniciada exclusivamente no site cadastrado."""
import copy,hashlib,json,re,time,urllib.request,urllib.error
from urllib.parse import urlparse,urljoin,urlunparse
import chamber_api as validation
import extractor_prompt

class Cancelled(Exception):pass

NAV_SCHEMA={'type':'object','properties':{
 'action':{'type':'string','enum':['visit','finish']},
 'url':{'type':['string','null']},
 'purpose':{'type':'string','enum':['mesa','profile','listing','contact','other']},
 'reason':{'type':'string'},
 'result':{'anyOf':[validation.SCHEMA,{'type':'null'}]}
},'required':['action','url','purpose','reason','result'],'additionalProperties':False}
NAV_PROMPT=extractor_prompt.build_prompt(extractor_prompt.DEFAULT_STRATEGY)

def clean_url(value,base=''):
 u=urlparse(urljoin(base,str(value or '').strip()))
 if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:raise ValueError('Endereço de navegação inválido.')
 return urlunparse(u._replace(fragment=''))
def same_site(a,b):
 x,y=urlparse(a),urlparse(b)
 return x.hostname.lower().removeprefix('www.')==y.hostname.lower().removeprefix('www.') and x.port==y.port

def post_openai(key,model,payload,timeout,instructions=None):
 body={'model':model,'store':False,'instructions':instructions or NAV_PROMPT,'input':json.dumps(payload,ensure_ascii=False),'text':{'format':{'type':'json_schema','name':'navegacao_camara','strict':True,'schema':NAV_SCHEMA}},'max_output_tokens':6000}
 request=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=max(1,min(90,timeout))) as response:reply=json.load(response)
 except urllib.error.HTTPError as error:
  code=''
  try:code=json.loads(error.read(65536)).get('error',{}).get('code','')
  except Exception:pass
  known={'insufficient_quota':'saldo/cota insuficiente','invalid_api_key':'chave inválida','model_not_found':'modelo não disponível','rate_limit_exceeded':'limite de chamadas atingido','unsupported_parameter':'parâmetro incompatível com o modelo'}
  raise ValueError('OpenAI HTTP '+str(error.code)+': '+known.get(code,'requisição recusada; confira modelo e configuração da conta.')) from None
 except (urllib.error.URLError,TimeoutError,OSError):raise ValueError('Não foi possível conectar à OpenAI ou o tempo da chamada terminou.') from None
 if reply.get('status')!='completed':raise ValueError('Resposta OpenAI incompleta; nenhum dado não confirmado foi aproveitado.')
 text=''.join(c.get('text','') for o in reply.get('output',[]) if o.get('type')=='message' for c in o.get('content',[]) if c.get('type')=='output_text')
 try:decision=json.loads(text)
 except (TypeError,ValueError):raise ValueError('OpenAI não retornou uma decisão estruturada válida (pode ter ocorrido recusa).') from None
 if not isinstance(decision,dict) or decision.get('action') not in ('visit','finish') or not isinstance(decision.get('reason'),str):raise ValueError('Decisão de navegação inválida.')
 if decision.get('result') is not None:
  r=decision['result']
  if not isinstance(r,dict) or not isinstance(r.get('president'),dict) or not isinstance(r.get('chamber'),dict):raise ValueError('Resultado da coleta inválido.')
 usage=reply.get('usage') or {}
 return decision,{k:int(usage.get(k,0) or 0) for k in ('input_tokens','output_tokens','total_tokens')}

def model_evidence(pack):
 # Validação usa o acervo completo; payload evita repetir mainText e o rodapé inteiro por contato.
 out={k:v for k,v in pack.items() if k not in ('pages','institutional')}
 out['pages']=[{k:v for k,v in page.items() if k!='mainText'} for page in pack['pages']]
 atoms={}
 for atom in pack['institutional']:
  ident=(atom.get('kind'),validation.identity(atom.get('kind'),atom.get('value')))
  if ident in atoms:continue
  short=dict(atom);quote=str(atom.get('quote') or '');value=str(atom.get('value') or '');at=quote.lower().find(value.lower()) if value else -1
  short['quote']=quote[max(0,at-120):at+len(value)+180] if at>=0 else quote[:400]
  atoms[ident]=short
 out['institutional']=list(atoms.values())
 return out

def observed_profile(pack,president,allowed,attempted):
 name=validation.norm(president.get('name'))
 if not name:return None
 found={}
 for page in pack['pages']:
  for link in page.get('nav',[]):
   url=link.get('url');label=str(link.get('label') or '')
   head=re.split(r'[/|]',label,1)[0].strip()
   if url in allowed and url not in attempted and validation.norm(head)==name:found[url]=label
 if len(found)==1:return next(iter(found.items()))
 return None

def collect_site(store,item,config,event=None,progress=None):
 root=clean_url(item['fields'].get('Website Câmara'));key=store.setting('contact_extractor_openai_key','')
 if not key:raise ValueError('Cadastre a chave OpenAI no painel do extrator IA.')
 prompt_state=extractor_prompt.snapshot(store);instructions=extractor_prompt.build_prompt(prompt_state['prompt'])
 deadline=time.monotonic()+config['municipality_timeout'];max_steps=int(config.get('ai_steps',8));max_pages=int(config.get('ai_pages',10));max_requests=config['max_requests']
 pack={'workingUrl':root,'pages':[],'institutional':[],'primaryMesaUrls':[],'compositionPeriods':[],'multipleCompositions':False,'presidentProfileUrl':'','year':config['reference_year']}
 nav={'mode':'ai_navigation','status':'running','model':config['openai_model'],'prompt_revision':prompt_state['revision'],'prompt_sha256':prompt_state['sha256'],'prompt_source':'custom' if prompt_state['custom'] else 'default','prompt_default_version':prompt_state['default_version'],'api_calls':0,'responses':0,'requests':0,'pages':[],'steps':[],'failures':[],'usage':{'input_tokens':0,'output_tokens':0,'total_tokens':0},'stop_reason':''}
 allowed={root};attempted=set();last=None;complete=False;ai_used=False
 def checkpoint(message):
  if event and event.is_set():raise Cancelled('Cancelado. Nenhum resultado desta execução foi aplicado.')
  if progress:progress(message,copy.deepcopy(nav))
 def remaining():return max(0,deadline-time.monotonic())
 def fetch_page(url,purpose,label=''):
  if len(attempted)>=max_pages or nav['requests']>=max_requests:raise ValueError('Limite de páginas/requisições atingido.')
  checkpoint('Abrindo página: '+url);attempted.add(url)
  response=store.contact_engine.call('/api/ai-fetch',{'rootUrl':root,'url':url,'maxRequests':max_requests-nav['requests'],'deadlineSeconds':max(1,min(remaining(),config['municipality_timeout']))},config)['data']
  stats=response.get('network') or {};nav['requests']+=int(stats.get('requests',0));page=response.get('page')
  nav['failures'].extend(str(v)[:250] for v in stats.get('failures',[]))
  if not page:
   nav['pages'].append({'url':url,'purpose':purpose,'status':'error','title':''});return
  actual=clean_url(page['url'])
  if not same_site(root,actual):raise ValueError('A página redirecionou para fora do site cadastrado.')
  attempted.add(actual);allowed.add(actual)
  # Campos são derivados pelo leitor HTML, não por dados antigos nem por suposição da IA.
  classification=validation.source_class(page);page['sourceClass']=classification
  observed_menu=bool(re.fullmatch(r'mesa diretora|presidente|presidencia',validation.norm(label)))
  structured_source=(classification=='mesa' and (purpose=='mesa' or not pack['pages'])) or (observed_menu and purpose in ('mesa','profile'))
  current_source=classification not in validation.FORBIDDEN_SOURCE and (structured_source or (page.get('primary') and (purpose in ('mesa','profile','listing') or not pack['pages'])))
  page['primaryReason']='observed_menu_or_mesa_page' if structured_source else 'reader_content' if current_source else 'not_identified'
  page['role']=('home' if not pack['pages'] else 'roster' if classification=='roster' else 'presidency' if purpose=='profile' or re.fullmatch(r'presidente|presidencia',validation.norm(label)) else 'mesa') if current_source else 'profile' if purpose=='profile' else 'other'
  if current_source:
   pack['primaryMesaUrls'].append(actual)
   if len(page.get('presidentNames',[]))>1:pack['multipleCompositions']=True
  if purpose=='profile' or page['role']=='presidency':pack['presidentProfileUrl']=actual
  pack['compositionPeriods']=list(dict.fromkeys(pack['compositionPeriods']+page.get('compositionPeriods',[])))
  if len(pack['compositionPeriods'])>1:pack['multipleCompositions']=True
  pack['pages'].append(page);pack['institutional'].extend(response.get('institutional') or [])
  for link in page.get('nav',[]):
   try:
    address=clean_url(link.get('url'))
    if same_site(root,address) and validation.source_class({'url':address,'title':link.get('label','')}) not in validation.FORBIDDEN_SOURCE:allowed.add(address)
   except (ValueError,AttributeError):pass
  nav['pages'].append({'url':actual,'purpose':purpose,'status':'read','title':str(page.get('title',''))[:250],'text_chars':len(page.get('text','')),'role':page['role'],'primary':bool(page.get('primary')),'primary_reason':page['primaryReason'],'composition_periods':page.get('compositionPeriods',[])})
 try:
  fetch_page(root,'other')
  if not pack['pages']:raise ValueError('A página inicial não pôde ser lida. Confira bloqueio, conexão e o endereço cadastrado.')
  for step in range(max_steps):
   if remaining()<=1:raise ValueError('Tempo máximo do município atingido.')
   checkpoint('IA analisando as páginas · etapa '+str(step+1)+'/'+str(max_steps))
   payload={'municipio':item['fields']['Município'],'uf':item['fields']['UF'],'ano_referencia':config['reference_year'],'site_inicial':root,'etapas_restantes':max_steps-step,'paginas_restantes':max_pages-len(attempted),'evidencias':model_evidence(pack),'historico':nav['steps'],'falhas':nav['failures'],'urls_ja_tentadas':sorted(attempted),'resultado_anterior':last}
   nav.setdefault('payload_chars',[]).append(len(json.dumps(payload,ensure_ascii=False)))
   nav['api_calls']+=1
   decision,usage=post_openai(key,config['openai_model'],payload,remaining(),instructions);ai_used=True;nav['responses']+=1
   for k in nav['usage']:nav['usage'][k]+=usage[k]
   reason=decision['reason'].replace(key,'[chave ocultada]')[:350]
   if decision.get('result') is not None:
    validation.enforce(decision['result'],pack,config['reference_year']);last=decision['result']
   nav['steps'].append({'step':step+1,'action':decision['action'],'url':str(decision.get('url') or '')[:2000],'purpose':str(decision.get('purpose','other'))[:30],'reason':reason})
   checkpoint('IA: '+reason)
   if decision['action']=='finish':
    if not isinstance(decision.get('result'),dict):raise ValueError('A IA finalizou sem fornecer o resultado estruturado.')
    checked=validation.enforce(decision['result'],pack,config['reference_year'])
    profile=observed_profile(pack,checked.get('president') or {},allowed,attempted) if checked.get('presidenciaAceita') else None
    if profile:
     if step==max_steps-1:raise ValueError('Nome identificado, mas a ficha observada não foi conferida: limite de chamadas IA atingido.')
     target,profile_label=profile
     nav.setdefault('followups',[]).append({'url':target,'reason':'Conferir ficha observada do mesmo nome antes de encerrar.'})
     nav['steps'][-1]['action']='finish_deferred'
     fetch_page(target,'profile',profile_label)
     continue
    complete=True;nav['stop_reason']=reason;break
   if step==max_steps-1:raise ValueError('Limite de etapas da IA atingido antes da finalização.')
   target=clean_url(decision.get('url'),pack['pages'][-1]['url'])
   if target not in allowed or not same_site(root,target):raise ValueError('A IA indicou uma URL não observada ou fora do site cadastrado; navegação bloqueada.')
   if target in attempted:raise ValueError('A IA repetiu uma página já tentada; execução encerrada para evitar repetição.')
   label=next((l.get('label','') for p in pack['pages'] for l in p.get('nav',[]) if l.get('url')==target),'')
   fetch_page(target,decision.get('purpose','other'),label)
 except Cancelled:raise
 except Exception as error:
  reason=str(error).replace(key,'[chave ocultada]')[:500];nav['failures'].append(reason);nav['stop_reason']=reason
 checkpoint('Validando os dados encontrados.')
 result=validation.enforce(last or {'president':{},'chamber':{'contacts':[]},'observacoes':[]},pack,config['reference_year'])
 nav['validation']=result.get('presidenciaDiagnostico',{})
 accepted=result.get('presidenciaAceita',False);has_institution=bool(result['chamber']['contacts'] or result['chamber']['address'])
 read_failure=bool(nav['failures']) or any(p['status']=='error' for p in nav['pages'])
 nav['status']='complete' if complete and accepted and not read_failure else 'partial' if accepted or has_institution else 'no_data'
 if not complete:nav['status']='partial' if accepted or has_institution else 'error'
 if not accepted and complete:nav['stop_reason']+=' · Presidente não identificado/aceito nas fontes consultadas.'
 nav['president_preserved']=not bool(complete or accepted)
 result.update(aiUsed=ai_used,aiMessage='' if complete else nav['stop_reason'],navigation=nav,presidentWrite=bool(complete or accepted),network={'visited':[p['url'] for p in nav['pages'] if p['status']=='read'],'failures':nav['failures'][-10:]})
 return result
