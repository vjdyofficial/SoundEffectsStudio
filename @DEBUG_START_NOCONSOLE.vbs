Set WshShell = CreateObject("WScript.Shell")

WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

MsgBox "You are running Sound Effects Studio in debug mode. Press OK to enable Chrome Developer Tool features.", vbInformation, "Launcher"

WshShell.Run "npm start", 0, False