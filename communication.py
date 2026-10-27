"""Modelos de comunicação e abertura de canais, sem inferir entrega."""
import json
import re
from datetime import datetime

DEFAULT_BODY = ('{saudacao}! Somos da JP Minato. Preparamos uma apresentação para a Câmara Municipal de '
                '{municipio} / {uf}, com exemplos de restauração das fotos dos vereadores eleitos em 2004. '
                'Segue o PDF para conhecer nosso trabalho.')
DEFAULTS = {channel+'_'+target: {'body': ('{saudacao}, {primeiro_nome}! ' + DEFAULT_BODY.split('! ',1)[1]
            if target=='presidente' else DEFAULT_BODY),
            'subject': 'Apresentação JP Minato — {municipio} / {uf}' if channel=='email' else ''}
            for channel in ('whatsapp','email') for target in ('camara','presidente')}
VARIABLES = {'saudacao','primeiro_nome','nome_presidente','municipio','uf'}

def templates(store):
    saved=store.setting('communication_templates',{})
    return {key:{**value,**saved.get(key,{})} for key,value in DEFAULTS.items()}

def save_templates(store,body):
    values=body.get('templates')
    if not isinstance(values,dict) or set(values)!=set(DEFAULTS):
        raise ValueError('Configure os quatro modelos de mensagens.')
    clean={}
    for key,value in values.items():
        if not isinstance(value,dict):raise ValueError('Modelo inválido.')
        clean[key]={}
        for field,limit in [('body',10000),('subject',300)]:
            text=value.get(field,'')
            if not isinstance(text,str) or len(text)>limit:raise ValueError('Mensagem ou assunto muito longo.')
            unknown=set(re.findall(r'\{([^{}]+)\}',text))-VARIABLES
            if unknown:raise ValueError('Variável desconhecida: '+', '.join(sorted(unknown)))
            if field=='subject' and ('\n' in text or '\r' in text):raise ValueError('Assunto deve ter uma única linha.')
            clean[key][field]=text
    store.set_setting('communication_templates',clean)
    return {'ok':True,'templates':templates(store)}

def normalize_recipient(channel,value):
    text=str(value or '').strip()
    if len(text)>2000:raise ValueError('Contato muito longo.')
    if channel=='email':
        if not re.fullmatch(r'[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+',text):raise ValueError('E-mail inválido.')
        return text.lower()
    if channel=='whatsapp':
        from app import normalize_phone
        from whatsapp_links import parse_link
        if text.startswith(('https://','http://')):
            link=parse_link(text,normalize_phone)
            return link['link_number'] or link['link_url']
        return normalize_phone(text)
    raise ValueError('Canal inválido.')

def opened(store,key,body=None):
    with store.lock,store.connect() as db:
        if not db.execute('SELECT 1 FROM municipalities WHERE key=?',(key,)).fetchone():raise ValueError('Município não encontrado.')
        db.execute('CREATE TABLE IF NOT EXISTS contact_openings (municipality_key TEXT, channel TEXT, target TEXT, recipient TEXT, timestamp TEXT, PRIMARY KEY(municipality_key,channel,target,recipient))')
        if body is not None:
            target=body.get('target');channel=body.get('channel')
            if target not in ('camara','presidente','outro'):raise ValueError('Destinatário inválido.')
            recipient=normalize_recipient(channel,body.get('recipient'))
            db.execute('INSERT INTO contact_openings VALUES (?,?,?,?,?) ON CONFLICT(municipality_key,channel,target,recipient) DO UPDATE SET timestamp=excluded.timestamp',
                       (key,channel,target,recipient,datetime.now().astimezone().isoformat(timespec='seconds')))
        return {'items':[dict(zip(('channel','target','recipient','timestamp'),row)) for row in db.execute('SELECT channel,target,recipient,timestamp FROM contact_openings WHERE municipality_key=?',(key,))]}
