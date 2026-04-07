; NoteFlow NSIS customization — adds/removes CLI from user PATH
!include "WordFunc.nsh"

!macro customInstall
  ; Add resources\cli to user PATH so 'noteflow' works in any terminal
  ReadRegStr $0 HKCU "Environment" "PATH"
  StrCpy $1 "$INSTDIR\resources\cli"
  ${If} $0 != ""
    WriteRegExpandStr HKCU "Environment" "PATH" "$1;$0"
  ${Else}
    WriteRegExpandStr HKCU "Environment" "PATH" "$1"
  ${EndIf}
  ; Notify open shells that the environment changed
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUnInstall
  ; Remove resources\cli from user PATH on uninstall
  ReadRegStr $0 HKCU "Environment" "PATH"
  StrCpy $1 "$INSTDIR\resources\cli;"
  ${WordReplace} $0 "$1" "" "+" $0
  StrCpy $1 ";$INSTDIR\resources\cli"
  ${WordReplace} $0 "$1" "" "+" $0
  WriteRegExpandStr HKCU "Environment" "PATH" "$0"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
