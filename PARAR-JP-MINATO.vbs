Option Explicit
Dim fs, folder, selected, shellApp, runtimePath, stream, content, regex, matches, control, request, code, stopped, n
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
runtimePath = folder & "\dados\servidor-em-execucao.json"
If Not fs.FileExists(runtimePath) Then
 Set shellApp = CreateObject("Shell.Application")
 Set selected = shellApp.BrowseForFolder(0, "Selecione a pasta do programa JP Minato atual (onde esta a pasta dados).", 0, "E:\JP-Minato")
 If selected Is Nothing Then WScript.Quit
 folder = selected.Self.Path
 runtimePath = folder & "\dados\servidor-em-execucao.json"
End If
If Not fs.FileExists(runtimePath) Then
 MsgBox "Nao foi encontrado o registro do servidor nessa pasta. Confira a pasta do programa em uso.", 48, "JP Minato"
 WScript.Quit
End If
If MsgBox("Pause os trabalhos e conclua as operacoes. Parar o servidor para fazer backup/atualizar? Os dados e a VPN serao preservados.", 36, "JP Minato") <> 6 Then WScript.Quit
Set stream = fs.OpenTextFile(runtimePath, 1)
content = stream.Read(65536)
stream.Close
Set regex = New RegExp
regex.Pattern = """control""\s*:\s*""([A-Za-z0-9_-]{43})"""
Set matches = regex.Execute(content)
If matches.Count <> 1 Then
 MsgBox "Registro de controle invalido. Reabra o iniciador do programa.", 48, "JP Minato"
 WScript.Quit
End If
control = matches(0).SubMatches(0)
On Error Resume Next
Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
request.setTimeouts 2000, 2000, 5000, 5000
request.open "POST", "http://127.0.0.1:8765/api/server-stop", False
request.setRequestHeader "X-Server-Control", control
request.send ""
code = request.status
If Err.Number <> 0 Or code <> 200 Then
 Err.Clear
 MsgBox "O servidor nao confirmou a parada. Confira se o programa esta em execucao nesta maquina e se escolheu a pasta correta.", 48, "JP Minato"
 WScript.Quit
End If
stopped = False
For n = 1 To 60
 WScript.Sleep 250
 Err.Clear
 request.open "GET", "http://127.0.0.1:8765/api/health", False
 request.send
 If Err.Number <> 0 Then
  stopped = True
  Exit For
 End If
Next
On Error GoTo 0
If stopped Then
 MsgBox "Servidor parado. Agora faca backup da pasta dados inteira e atualize os arquivos. Abra ABRIR-JP-MINATO.vbs para iniciar novamente.", 64, "JP Minato"
Else
 MsgBox "A parada foi solicitada, mas o servidor ainda responde. Aguarde e confira antes de atualizar.", 48, "JP Minato"
End If
