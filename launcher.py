"""Windows desktop launcher; no console required after Python installation."""
import json, os, subprocess, sys, threading, time, urllib.request, webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
import remote_access
ROOT=Path(__file__).resolve().parent
DATA=ROOT/'dados'
URL='http://127.0.0.1:8765'
FLAGS=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0

CURRENT_VERSION='1.36'

def server_health():
    try:
        # Comunicação estritamente local: não passar por proxy do Windows/VPN.
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL+'/api/health',timeout=2) as r:return json.load(r)
    except Exception:return None

def runtime():
    try:
        c=json.loads((DATA/'servidor-em-execucao.json').read_text('utf-8'))
        h=server_health() or {}
        return c if h.get('app')=='JP Minato' and h.get('instance')==c.get('instance') else None
    except Exception:return None

def check_server_version():
    h=server_health() or {}
    if h.get('version')!=CURRENT_VERSION or 'operator_sessions_v1' not in h.get('capabilities',[]):
        raise RuntimeError('O servidor ativo ainda é de outra versão. Use Parar servidor para atualizar e depois Abrir. Se não encerrar, reinicie o Windows após copiar o pacote completo. Não apague dados.')

def stop_server():
    c=runtime()
    if not c:
        if (server_health() or {}).get('app')=='JP Minato':raise RuntimeError('Existe um JP Minato ativo que não corresponde ao registro desta pasta. Não foi encerrado. Confira a instalação ou reinicie o Windows; não apague dados.')
        return
    req=urllib.request.Request(URL+'/api/server-stop',data=b'',headers={'X-Server-Control':c['control']})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=5) as r:json.load(r)
    for _ in range(60):
        if not runtime():return
        time.sleep(.25)
    raise RuntimeError('O servidor ainda está encerrando. Aguarde e tente novamente.')

def prepare():
    env=ROOT/'.venv';python=env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    DATA.mkdir(exist_ok=True)
    with (DATA/'instalacao.log').open('a',encoding='utf-8') as log:
        if not python.exists():subprocess.run([sys.executable,'-m','venv',str(env)],stdout=log,stderr=log,check=True,creationflags=FLAGS)
        ready=subprocess.run([str(python),'-c','import openpyxl,fitz,PIL'],stdout=log,stderr=log,creationflags=FLAGS)
        if ready.returncode:subprocess.run([str(python),'-m','pip','install','-r',str(ROOT/'requirements.txt')],stdout=log,stderr=log,check=True,creationflags=FLAGS)
    return env/('Scripts/pythonw.exe' if os.name=='nt' else 'bin/python')

def start_server():
    if runtime():
        check_server_version();return
    if (server_health() or {}).get('app')=='JP Minato':raise RuntimeError('Há um JP Minato ativo sem vínculo com o registro desta pasta. Confira a pasta da instalação ou reinicie o Windows antes de abrir. Não apague dados.')
    python=prepare()
    with (DATA/'servidor.log').open('a',encoding='utf-8') as log:
        process=subprocess.Popen([str(python),str(ROOT/'app.py'),'--no-browser'],cwd=ROOT,stdout=log,stderr=log,creationflags=FLAGS)
    for _ in range(120):
        if runtime():
            check_server_version();return
        if process.poll() is not None:raise RuntimeError('Não foi possível iniciar. Feche o INICIAR.bat antigo e confira dados/servidor.log.')
        time.sleep(.25)
    raise RuntimeError('Inicialização ainda não concluída. Confira dados/servidor.log e tente Abrir novamente.')

def shortcuts(enable):
    if os.name!='nt':raise ValueError('Atalhos automáticos disponíveis no Windows.')
    # Pass paths as environment values, not interpolated PowerShell source.
    env=dict(os.environ,JP_MINATO_ROOT=str(ROOT),JP_MINATO_AUTO='1' if enable else '0')
    script="""$ErrorActionPreference='Stop'
$w=New-Object -ComObject WScript.Shell
$d=[Environment]::GetFolderPath('Desktop')
$s=[Environment]::GetFolderPath('Startup')
foreach($pair in @(@($d,'JP Minato.lnk',''),@($s,'JP Minato - iniciar.lnk','--startup'))){
 $path=Join-Path $pair[0] $pair[1]
 if($pair[2] -and $env:JP_MINATO_AUTO -ne '1'){if(Test-Path $path){Remove-Item -LiteralPath $path};continue}
 $l=$w.CreateShortcut($path)
 $l.TargetPath=Join-Path $env:WINDIR 'System32\\wscript.exe'
 $l.Arguments='"'+(Join-Path $env:JP_MINATO_ROOT 'ABRIR-JP-MINATO.vbs')+'" '+$pair[2]
 $l.WorkingDirectory=$env:JP_MINATO_ROOT
 $l.IconLocation=(Join-Path $env:JP_MINATO_ROOT 'assets\\app.ico')+',0'
 $l.Save()
}
"""
    subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env=env,check=True,capture_output=True,creationflags=FLAGS)

def firewall():
    if os.name!='nt':raise ValueError('Disponível no Windows.')
    config=remote_access.load_config(DATA)
    if not config.get('enabled'):raise ValueError('Salve o endereço da VPN e a senha primeiro.')
    ip=remote_access.vpn_ip(config['vpn_ip']);python=ROOT/'.venv'/'Scripts'/'pythonw.exe'
    # Fixed encoded command; quote literal paths before handing off to UAC.
    def literal(v):return "'"+str(v).replace("'","''")+"'"
    script="""$ErrorActionPreference='Stop';try {
Get-NetFirewallRule -DisplayName 'JP Minato - VPN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'JP Minato - VPN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8765 -LocalAddress """+literal(ip)+" -RemoteAddress '10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10' -Program "+literal(python)+" -Profile Any | Out-Null;exit 0}catch{exit 1}"
    import base64
    encoded=base64.b64encode(script.encode('utf-16le')).decode()
    elevate="$p=Start-Process powershell.exe -ArgumentList '-NoProfile -NonInteractive -EncodedCommand "+encoded+"' -Verb RunAs -Wait -PassThru;exit $p.ExitCode"
    subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',elevate],check=True,creationflags=FLAGS)

def detect_ip():
    if os.name!='nt':return ''
    script="Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -match 'Tailscale|ZeroTier|WireGuard|NetBird|wt0|VPN'} | Select-Object -ExpandProperty IPAddress | ConvertTo-Json"
    r=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],capture_output=True,text=True,creationflags=FLAGS,timeout=10)
    try:
        addresses=json.loads(r.stdout);addresses=[addresses] if isinstance(addresses,str) else addresses
        for ip in addresses or []:
            try:return remote_access.vpn_ip(ip)
            except ValueError:pass
    except ValueError:pass
    return ''

def gui():
    root=tk.Tk();root.title('JP Minato · Iniciar e configurar');root.geometry('650x740')
    try:root.iconbitmap(str(ROOT/'assets'/'app.ico'))
    except tk.TclError:pass
    frame=tk.Frame(root,padx=24,pady=20);frame.pack(fill='both',expand=True)
    tk.Label(frame,text='JP MINATO',font=('Segoe UI',22,'bold')).pack(anchor='w')
    tk.Label(frame,text='Dados e processamento ficam neste computador do escritório.',wraplength=540,justify='left').pack(anchor='w',pady=8)
    status=tk.StringVar(value='Pronto para abrir. A primeira preparação pode levar alguns minutos.')
    busy=False;buttons=[]
    def work(fn,success):
        nonlocal busy
        if busy:return
        busy=True;status.set('Preparando… aguarde.');[b.configure(state='disabled') for b in buttons]
        def finish(error):
            nonlocal busy
            busy=False;[b.configure(state='normal') for b in buttons];status.set(str(error) if error else success)
            if error:messagebox.showerror('JP Minato',str(error),parent=root)
        def run():
            try:fn();error=None
            except Exception as e:error=e
            root.after(0,lambda:finish(error))
        threading.Thread(target=run,daemon=True).start()
    def button(text,fn):
        b=tk.Button(frame,text=text,command=fn,pady=7);b.pack(fill='x',pady=4);buttons.append(b)
    button('Abrir JP Minato',lambda:work(lambda:(start_server(),webbrowser.open(URL)),'Programa aberto. Pode fechar esta janela; o servidor continua funcionando.'))
    def stop_for_update():
        if not messagebox.askyesno('Parar para atualizar','Pause os trabalhos de extração, restauração e consultas. Encerrar o servidor agora? Os dados e a configuração de acesso remoto serão preservados.',parent=root):return
        work(stop_server,'Servidor parado. Faça backup de dados, feche esta janela e extraia a atualização na pasta do programa.')
    button('Parar servidor para atualizar',stop_for_update)
    button('Criar ícone e iniciar com o Windows',lambda:work(lambda:(prepare(),shortcuts(True),start_server()),'Ícone criado. Inicia ao entrar neste usuário do Windows, sem terminal.'))
    try:config=remote_access.load_config(DATA)
    except Exception as e:config={'enabled':False};status.set(str(e))
    tk.Label(frame,text='Acesso de casa por VPN',font=('Segoe UI',13,'bold')).pack(anchor='w',pady=(16,5))
    tk.Label(frame,text='IPv4 do adaptador VPN deste computador (ex.: 100.80.10.20)').pack(anchor='w')
    ip=tk.StringVar(value=config.get('vpn_ip',''));tk.Entry(frame,textvariable=ip).pack(fill='x',pady=4)
    def detect():
        def task():
            value=detect_ip()
            if not value:raise ValueError('VPN não encontrada. Instale/conecte a VPN e copie seu IPv4 para este campo.')
            root.after(0,lambda:ip.set(value))
        work(task,'IP da VPN encontrado. Cadastre a senha e salve.')
    button('Detectar IP da VPN',detect)
    tk.Label(frame,text='Senha de acesso (mínimo 10 caracteres; vazio mantém a existente)').pack(anchor='w')
    password=tk.Entry(frame,show='*');password.pack(fill='x',pady=4)
    def save():
        value=ip.get().strip();secret=password.get()
        try:
            previous=remote_access.load_config(DATA);remote_access.vpn_ip(value)
            if secret and not 10<=len(secret)<=256:raise ValueError('Use uma senha de 10 a 256 caracteres.')
            if not secret and not previous.get('password_hash'):raise ValueError('Cadastre uma senha.')
        except Exception as e:messagebox.showerror('Configuração',str(e),parent=root);return
        if runtime() and not messagebox.askyesno('Reiniciar servidor','Conclua ou pause os trabalhos de extração/restauração antes. Reiniciar agora?',parent=root):return
        def task():
            stop_server();remote_access.save_config(DATA,value,secret,previous);start_server()
        work(task,'Salvo. Acesse de casa: http://'+value+':8765 (com VPN conectada).');password.delete(0,'end')
    button('Salvar acesso remoto e reiniciar',save)
    def disable():
        if not messagebox.askyesno('Desativar','Desativar o acesso remoto e a inicialização automática? O servidor será encerrado.',parent=root):return
        work(lambda:(stop_server(),remote_access.write_json(DATA/'acesso-remoto.json',{'enabled':False,'port':8765}),shortcuts(False)),'Acesso remoto desativado. O ícone local continua disponível.')
    button('Liberar somente a VPN no Firewall do Windows',lambda:work(firewall,'Regra da VPN criada. O Windows pode pedir autorização de administrador.'))
    button('Desativar acesso remoto / início automático',disable)
    tk.Label(frame,textvariable=status,wraplength=540,justify='left',fg='#164c75').pack(anchor='w',pady=12)
    root.mainloop()

if __name__=='__main__':
    if '--startup' in sys.argv:
        try:start_server()
        except Exception as e:
            DATA.mkdir(exist_ok=True)
            with (DATA/'servidor.log').open('a',encoding='utf-8') as f:f.write('Inicialização: '+str(e)+'\n')
    else:gui()
