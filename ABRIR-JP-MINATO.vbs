Option Explicit
Dim sh, fs, folder, command, args, pythonw
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = folder
args = ""
If WScript.Arguments.Count > 0 Then
 If WScript.Arguments(0) = "--startup" Then args = " --startup"
End If
pythonw = folder & "\.venv\Scripts\pythonw.exe"
If fs.FileExists(pythonw) Then
 command = Chr(34) & pythonw & Chr(34)
Else
 command = "pyw -3"
End If
On Error Resume Next
sh.Run command & " " & Chr(34) & folder & "\launcher.py" & Chr(34) & args, 0, False
If Err.Number <> 0 Then
 Err.Clear
 sh.Run "pythonw " & Chr(34) & folder & "\launcher.py" & Chr(34) & args, 0, False
 If Err.Number <> 0 Then MsgBox "Instale Python 3.11 ou superior com o launcher e tkinter. Depois abra este arquivo novamente.", 48, "JP Minato"
End If
