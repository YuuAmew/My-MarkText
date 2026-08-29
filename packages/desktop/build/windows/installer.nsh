; installer.nsh — include via electron-builder’s nsis.include

;======================================================================
; customInstall macro is invoked by electron-builder after files are in $INSTDIR
!macro customInstall
  ; Register the executable itself so Windows' default-app dialog uses the
  ; product name instead of Electron.
  WriteRegStr HKCU "Software\Classes\Applications\MyMarkText.exe" "FriendlyAppName" "MyMarkText"
  WriteRegStr HKCU "Software\Classes\Applications\MyMarkText.exe" "AppUserModelID" "com.github.marktext.mymarktext"
  WriteRegExpandStr HKCU "Software\Classes\Applications\MyMarkText.exe\DefaultIcon" "" "$INSTDIR\resources\icons\md.ico,0"
  WriteRegExpandStr HKCU "Software\Classes\Applications\MyMarkText.exe\shell\open\command" "" '"$INSTDIR\MyMarkText.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\MyMarkText.exe\SupportedTypes" ".txt" ""
  WriteRegStr HKCU "Software\Classes\Applications\MyMarkText.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\MyMarkText.exe\SupportedTypes" ".mdx" ""

  ; Ask the user if they want to register Markdown file associations.
  MessageBox MB_YESNO|MB_ICONQUESTION \
  "Do you want to associate Markdown files (.md, .markdown, .mmd, .mdown, .mdtext, .mdx) with MyMarkText?" /SD IDNO IDNO SkipAssoc

  ;— User clicked YES, perform the registry writes —
  WriteRegStr HKCU "Software\Classes\.md"       "" "MyMarkText.Document"
  WriteRegStr HKCU "Software\Classes\.markdown" "" "MyMarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mmd"      "" "MyMarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdown"    "" "MyMarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdtxt"    "" "MyMarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdtext"   "" "MyMarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdx"      "" "MyMarkText.Document"

  WriteRegStr HKCU "Software\Classes\MyMarkText.Document" \
    "" "MyMarkText Markdown Document"
  WriteRegExpandStr HKCU "Software\Classes\MyMarkText.Document\DefaultIcon" \
    "" "$INSTDIR\resources\icons\md.ico,0"
  WriteRegExpandStr HKCU "Software\Classes\MyMarkText.Document\shell\open\command" \
    "" '"$INSTDIR\MyMarkText.exe" "%1"'

SkipAssoc:
!macroend

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  ; Delete the open command subtree
  DeleteRegKey HKCU "Software\Classes\MyMarkText.Document\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\MyMarkText.Document\shell\open"
  DeleteRegKey HKCU "Software\Classes\MyMarkText.Document\shell"

  ; Delete the DefaultIcon and ProgID
  DeleteRegKey HKCU "Software\Classes\MyMarkText.Document\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\MyMarkText.Document"
  DeleteRegKey HKCU "Software\Classes\Applications\MyMarkText.exe"

  ; Delete each extension mapping
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.markdown"
  DeleteRegKey HKCU "Software\Classes\.mmd"
  DeleteRegKey HKCU "Software\Classes\.mdown"
  DeleteRegKey HKCU "Software\Classes\.mdtxt"
  DeleteRegKey HKCU "Software\Classes\.mdtext"
  DeleteRegKey HKCU "Software\Classes\.mdx"

  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\marktext"
  SkipRemoval:
!macroend
