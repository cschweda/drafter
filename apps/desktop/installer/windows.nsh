; Drafter's additions to electron-builder's NSIS installer (electron-builder.config.cjs, `nsis.include`).
;
; `.fountain` is registered by electron-builder itself (`win.fileAssociations`): Drafter opens it
; unless the writer chose another app for it. Markdown is only offered: `.md` and `.markdown` get
; Drafter in Open with (OpenWithProgids), and the app a Markdown file already opens in keeps it, as
; on a Mac, where the two are `Alternate`. A Final Draft file (`.fdx`, imported as a new script) is
; offered the same way. Everything is per user (SHELL_CONTEXT is HKCU here).

!macro customInstall
  ; electron-builder's own command for `.fountain` leaves the program's path unquoted
  ; (`C:\Users\Ada Lovelace\…\Drafter.exe "%1"`), which Windows has to guess at when the path has
  ; a space. The same command, quoted.
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.fountain\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.markdown" "" "Markdown document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.markdown\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.markdown\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.markdown\shell\open" "" "Open with Drafter"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.markdown\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "Drafter.markdown"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "Drafter.markdown"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.fdx" "" "Final Draft document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.fdx\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.fdx\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.fdx\shell\open" "" "Open with Drafter"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Drafter.fdx\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.fdx\OpenWithProgids" "Drafter.fdx"
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "Drafter.markdown"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "Drafter.markdown"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Drafter.markdown"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.fdx\OpenWithProgids" "Drafter.fdx"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Drafter.fdx"
  ; Removed for good (not an update's reinstall): `.fountain` no longer names Drafter's type,
  ; which electron-builder's own uninstall leaves behind.
  ${ifNot} ${isUpdated}
    ReadRegStr $R9 SHELL_CONTEXT "Software\Classes\.fountain" ""
    ${if} $R9 == "Drafter.fountain"
      DeleteRegValue SHELL_CONTEXT "Software\Classes\.fountain" ""
    ${endIf}
  ${endIf}
!macroend
