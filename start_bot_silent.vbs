Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\hp\OneDrive\Desktop\Antigravity projects\Bug'galter bot"
WshShell.Run """C:\Users\hp\AppData\Local\Programs\Python\Python311\python.exe"" -u run_unified_server.py", 0, False
Set WshShell = Nothing
