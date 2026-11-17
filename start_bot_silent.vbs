Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\hp\OneDrive\Desktop\Antigravity projects\Bug'galter bot"
WshShell.Run "python run_unified_server.py", 0, False
Set WshShell = Nothing
