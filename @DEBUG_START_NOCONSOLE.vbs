Set WshShell = CreateObject("WScript.Shell")

WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "npm start", 0, False

MsgBox "You are running Sound Effects Studio in debug mode. This will enable Chrome Developer Tool features to find out unstable bugs and errors. Preaa OK to continue", vbInformation, "Launcher"