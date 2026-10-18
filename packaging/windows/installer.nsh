!include "LogicLib.nsh"

!ifdef BUILD_UNINSTALLER
  Var /GLOBAL PicHostDeleteData
!endif

!macro customInstall
  CreateDirectory "$INSTDIR\data"
  ${If} $installMode == "all"
    nsExec::ExecToLog 'icacls "$INSTDIR\data" /grant *S-1-5-32-545:(OI)(CI)M'
  ${EndIf}
!macroend

!macro customUnInstall
  StrCpy $PicHostDeleteData "0"
  ${IfNot} ${isUpdated}
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_DEFBUTTON2 "是否删除 $INSTDIR\data 中的 PicHost 数据？$\r$\n$\r$\n选择“否”将保留数据库、图片、视频和备份。" IDYES PicHostDeleteDataYes
      Goto PicHostDeleteDataDone
      PicHostDeleteDataYes:
        StrCpy $PicHostDeleteData "1"
      PicHostDeleteDataDone:
    ${EndIf}
  ${EndIf}
!macroend

!macro customRemoveFiles
  StrCpy $R1 "$INSTDIR\..\PicHost-data-backup"

  ${If} $PicHostDeleteData == "1"
    RMDir /r "$INSTDIR\data"
  ${Else}
    IfFileExists "$INSTDIR\data\*.*" 0 PicHostDataHandled
    IfFileExists "$R1" 0 PicHostMoveData
      MessageBox MB_ICONSTOP "无法保护现有的 PicHost 数据，已取消卸载。"
      Abort

    PicHostMoveData:
      ClearErrors
      Rename "$INSTDIR\data" "$R1"
      IfErrors 0 PicHostDataHandled
        MessageBox MB_ICONSTOP "无法将 PicHost 数据移动到安全位置，已取消卸载。"
        Abort

    PicHostDataHandled:
  ${EndIf}

  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"

  ${If} $PicHostDeleteData != "1"
    IfFileExists "$R1\*.*" 0 PicHostDataRestoreDone
      CreateDirectory "$INSTDIR"
      ClearErrors
      Rename "$R1" "$INSTDIR\data"
      IfErrors 0 PicHostDataRestoreDone
        MessageBox MB_ICONEXCLAMATION "PicHost 已卸载，但数据保留在：$\r$\n$R1"

    PicHostDataRestoreDone:
  ${EndIf}
!macroend
