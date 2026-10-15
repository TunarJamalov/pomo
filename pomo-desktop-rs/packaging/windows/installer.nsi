; Pomo-Focus-Setup.exe: per-user install, no administrator rights needed.
; Built by build-windows.ps1 (makensis /DVERSION=x.y.z installer.nsi).
Unicode true
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define APP "Pomo Focus"
!define EXE "pomo-focus.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PomoFocus"
!define RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
; electron-builder's uninstall key for the 1.x (Electron) version: UUIDv5 of the app id
!define OLD_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\256b6395-14a7-5f14-b41f-51b9ecb2be5a"

Name "${APP}"
OutFile "..\..\dist\Pomo-Focus-Setup.exe"
; Not the folder 1.x used, so its uninstaller can never touch the new files
InstallDir "$LOCALAPPDATA\Programs\PomoFocus"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "..\..\assets\icon.ico"
UninstallIcon "..\..\assets\icon.ico"
BrandingText "Pomo Focus ${VERSION}"
ShowInstDetails nevershow
ShowUninstDetails nevershow
AutoCloseWindow true

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APP} installer"
VIAddVersionKey "CompanyName" "Tunar Jamalov"
VIAddVersionKey "LegalCopyright" "AGPL-3.0, Tunar Jamalov"

Page instfiles
UninstPage instfiles

; Removes the Electron version quietly. Its data (the Discord connection) stays,
; and the new app reads it on first start.
Function RemoveElectronVersion
  ReadRegStr $0 HKCU "${OLD_KEY}" "QuietUninstallString"
  StrCmp $0 "" done
  ExecWait $0
  ; The uninstaller copies itself to a temporary folder and returns early; wait for it
  StrCpy $1 0
  wait:
    ReadRegStr $2 HKCU "${OLD_KEY}" "DisplayName"
    StrCmp $2 "" done
    IntOp $1 $1 + 1
    IntCmp $1 40 done
    Sleep 500
    Goto wait
  done:
  DeleteRegValue HKCU "${RUN_KEY}" "electron.app.Pomo Focus"
FunctionEnd

Section
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  nsExec::Exec 'taskkill /IM "Pomo Focus.exe" /F'
  Call RemoveElectronVersion

  SetOutPath "$INSTDIR"
  File "..\..\target\release\${EXE}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}"

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Tunar Jamalov"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://pomofocus.online/desktop"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ; pomo:// links (the app also checks this on every start)
  WriteRegStr HKCU "Software\Classes\pomo" "" "URL:Pomo Focus"
  WriteRegStr HKCU "Software\Classes\pomo" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\pomo\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'

  Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section Uninstall
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\Classes\pomo"
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\online.pomofocus.desktop"
  DeleteRegValue HKCU "${RUN_KEY}" "Pomo Focus"
SectionEnd
