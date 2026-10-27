"""Private VPN listeners and password sessions; never share the SQLite file."""
import hashlib, hmac, ipaddress, json, secrets, threading, time
from pathlib import Path
from http.cookies import SimpleCookie

CAPTURE_ROUTES={'/api/verifier-next','/api/verifier-result','/api/capture-connect','/api/capture-navigate','/api/capture-preview','/api/capture-save','/api/crest-save'}
NETWORKS=tuple(ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10'))

def vpn_ip(value):
    ip=ipaddress.ip_address(str(value).strip())
    if ip.version!=4 or not any(ip in n for n in NETWORKS):
        raise ValueError('Informe o IPv4 privado do adaptador VPN, não o IP público ou 0.0.0.0.')
    return str(ip)

def write_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8');tmp.replace(path)
    try:path.chmod(0o600)
    except OSError:pass

def load_config(folder):
    path=Path(folder)/'acesso-remoto.json'
    if not path.exists():return {'enabled':False,'port':8765}
    c=json.loads(path.read_text('utf-8'))
    if c.get('port',8765)!=8765:raise ValueError('A porta do JP Minato deve ser 8765.')
    if c.get('enabled'):
        c['vpn_ip']=vpn_ip(c['vpn_ip'])
        if not c.get('salt') or not c.get('password_hash'):raise ValueError('Configure uma senha antes de ativar o acesso remoto.')
    return c

def save_config(folder,ip,password,previous=None):
    c=dict(previous or {});c.update(enabled=True,vpn_ip=vpn_ip(ip),port=8765)
    if password:
        if not 10<=len(password)<=256:raise ValueError('Use uma senha de 10 a 256 caracteres.')
        c['salt']=secrets.token_hex(16)
        c['password_hash']=hashlib.scrypt(password.encode(),salt=bytes.fromhex(c['salt']),n=16384,r=8,p=1).hex()
    if not c.get('password_hash'):raise ValueError('Cadastre a senha do acesso remoto.')
    write_json(Path(folder)/'acesso-remoto.json',c);return c

class Access:
    def __init__(self,config):
        self.config=config;self.operators={};self.sessions={};self.failures={};self.lock=threading.RLock()
        self.control=secrets.token_urlsafe(32);self.instance=secrets.token_hex(16)
    def valid_host(self,host,port):
        return host in {f'127.0.0.1:{port}',f'localhost:{port}',f'{self.config.get("vpn_ip","")}:{port}'}
    def authenticated(self,cookie):
        if not self.config.get('enabled'):return True
        try:c=SimpleCookie();c.load(cookie or '');token=c['jp_session'].value
        except Exception:return False
        with self.lock:
            expiry=self.sessions.get(token,0)
            if expiry<=time.time():self.sessions.pop(token,None);return False
            return True
    def operator(self,cookie):
        try:c=SimpleCookie();c.load(cookie or "");token=c["jp_session"].value
        except Exception:return None
        with self.lock:
            return self.operators.get(token) if self.sessions.get(token,0)>time.time() else None
    def login(self,password,peer,operator=None):
        from operators131 import NAMES
        if operator is not None and operator not in NAMES:raise ValueError('Selecione um usuário válido.')
        if not self.config.get('enabled'):
            token=secrets.token_urlsafe(32)
            with self.lock:
                self.sessions={k:v for k,v in self.sessions.items() if v>time.time()}
                if len(self.sessions)>=64:self.sessions.pop(next(iter(self.sessions)))
                self.operators={k:v for k,v in self.operators.items() if k in self.sessions}
                self.sessions[token]=time.time()+12*3600;self.operators[token]=operator
            return token
        if not isinstance(password,str) or len(password)>256:raise ValueError('Senha inválida.')
        now=time.time()
        with self.lock:
            self.failures={k:v for k,v in self.failures.items() if now-v[1]<300}
            count,last=self.failures.get(peer,(0,0))
            if count>=5:raise ValueError('Muitas tentativas. Aguarde cinco minutos.')
            digest=hashlib.scrypt(password.encode(),salt=bytes.fromhex(self.config['salt']),n=16384,r=8,p=1).hex()
            if not hmac.compare_digest(digest,self.config['password_hash']):
                if len(self.failures)>=1024:self.failures.pop(next(iter(self.failures)))
                self.failures[peer]=(count+1,now);raise ValueError('Senha incorreta.')
            self.failures.pop(peer,None)
            self.sessions={k:v for k,v in self.sessions.items() if v>now}
            if len(self.sessions)>=64:self.sessions.pop(next(iter(self.sessions)))
            token=secrets.token_urlsafe(32);self.sessions[token]=now+12*3600;self.operators={k:v for k,v in self.operators.items() if k in self.sessions};self.operators[token]=operator;return token
    def logout(self,cookie):
        try:c=SimpleCookie();c.load(cookie or '')
        except Exception:return
        with self.lock:
            if 'jp_session' in c:
                self.sessions.pop(c['jp_session'].value,None);self.operators.pop(c['jp_session'].value,None)
    def public(self,remote=False,active=False):
        return {'enabled':bool(self.config.get('enabled')),'remote':remote,'online':active,
                'url':f'http://{self.config["vpn_ip"]}:8765' if self.config.get('enabled') else None}
