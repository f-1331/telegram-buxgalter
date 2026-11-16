Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node src/index.js", 0, False
Set WshShell = Nothing
