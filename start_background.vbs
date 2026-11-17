Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c START_SERVER.bat", 0, False
Set WshShell = Nothing
