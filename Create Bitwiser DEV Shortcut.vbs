Option Explicit
Dim fso, shell, root, electron, entry, shortcutPath, shortcut
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
electron = fso.BuildPath(root, "node_modules\electron\dist\electron.exe")
entry = fso.BuildPath(root, "electron\dev\main.cjs")
If Not fso.FileExists(electron) Or Not fso.FileExists(entry) Then
  MsgBox "Electron is not installed. Run npm ci in the project folder once, then try again.", vbExclamation, "Bitwiser DEV"
  WScript.Quit 1
End If
shortcutPath = fso.BuildPath(shell.SpecialFolders("Desktop"), "Bitwiser DEV.lnk")
Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = electron
shortcut.Arguments = Chr(34) & entry & Chr(34)
shortcut.WorkingDirectory = root
shortcut.IconLocation = fso.BuildPath(root, "assets\icon.ico") & ",0"
shortcut.Description = "Bitwiser DEV - isolated local progress controls"
shortcut.WindowStyle = 1
shortcut.Save
If WScript.Arguments.Count = 0 Then
  MsgBox "Bitwiser DEV shortcut created on your Desktop. Double-click it to play.", vbInformation, "Bitwiser DEV"
End If
