"""Atividade manual de contatos, separada de extrações e envios."""
import re
from datetime import datetime

EMAIL=re.compile(r'[^\s@?&#;,<>]+@[^\s@?&#;,<>]+\.[^\s@?&#;,<>]+')

def stamp():return datetime.now().astimezone().isoformat(timespec='milliseconds')

def single_email(value):
    text=str(value or '').strip()
    if text and not EMAIL.fullmatch(text):raise ValueError('Informe somente um e-mail para o presidente.')
    return text

def extracted_email(value):
    values=value if isinstance(value,list) else [value]
    for entry in values:
        found=EMAIL.search(str(entry or ''))
        if found:return found.group()
    return None

def mark(local,kind='edit'):
    local['last_manual_edit_at' if kind=='edit' else 'last_reviewed_at']=stamp()

def review(store,key):
    import json
    with store.lock,store.connect() as db:
        row=db.execute('SELECT local FROM municipalities WHERE key=?',(key,)).fetchone()
        if not row:raise ValueError('Município não encontrado.')
        local=json.loads(row[0]);mark(local,'review')
        db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),key))
    return {'ok':True,'item':store.item(key)}
