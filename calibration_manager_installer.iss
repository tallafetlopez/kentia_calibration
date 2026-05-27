; ============================================================
;  Calibration Manager — Inno Setup Script
;  Publisher: HERKO | Version: 1.0.0
;  Output: installer_output\CalibrationManager_Setup.exe
;
;  To compile:
;    ISCC.exe calibration_manager_installer.iss
; ============================================================

#define AppName        "Calibration Manager"
#define AppVersion     "1.0.0"
#define AppPublisher   "HERKO"
#define AppExeName     "Calibration Manager.exe"
#define AppId          "{{A7F3C2D1-8B4E-4A9F-BC21-3D56E07F1A2C}"
#define SourceDir      "electron\dist\Calibration Manager-win32-x64"

[Setup]
; Unique identifier for the application
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://www.herko.com
AppSupportURL=https://www.herko.com
AppUpdatesURL=https://www.herko.com

; Installation directory
DefaultDirName={autopf}\CalibrationManager
DefaultGroupName={#AppPublisher}\{#AppName}
DisableProgramGroupPage=no
AllowNoIcons=no

; Installer appearance
WizardStyle=modern
WizardSizePercent=120
DisableWelcomePage=no
DisableDirPage=no
DisableReadyPage=no

; Output
OutputDir=installer_output
OutputBaseFilename=CalibrationManager_Setup
Compression=lzma2/ultra64
SolidCompression=yes

; Privileges
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

; Icon for the installer executable itself
SetupIconFile=electron\icon.ico

; Registry key for Add/Remove Programs
UninstallDisplayName={#AppName} {#AppVersion}
UninstallDisplayIcon={app}\{#AppExeName}

; Versioning metadata
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} Setup
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

; Minimum Windows version: Windows 10
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.WelcomeLabel1=Welcome to the {#AppName} Setup Wizard
english.WelcomeLabel2=This will install {#AppName} {#AppVersion} by {#AppPublisher} on your computer.%n%nCalibration Manager is a professional desktop tool for automotive ECU calibration data management.%n%nIt is recommended that you close all other applications before continuing.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startmenuicon"; Description: "Create a Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Copy the entire Electron win-unpacked folder
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Desktop shortcut
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppExeName}"; Comment: "Open Calibration Manager"; Tasks: desktopicon

; Start Menu shortcuts
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppExeName}"; Comment: "Open Calibration Manager"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[Registry]
; Register in Add/Remove Programs (already done automatically by Inno Setup,
; but we add extra metadata for a professional look)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1"; ValueType: string; ValueName: "DisplayVersion"; ValueData: "{#AppVersion}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1"; ValueType: string; ValueName: "Publisher"; ValueData: "{#AppPublisher}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1"; ValueType: dword; ValueName: "EstimatedSize"; ValueData: "204800"; Flags: uninsdeletevalue

[Run]
; Offer to launch after install
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up any files the app creates at runtime
Type: filesandordirs; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
