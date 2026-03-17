; ─────────────────────────────────────────────────────────────────────────────
;  LESOFT Custom Uninstall Script
;  Runs after the main uninstaller has removed application files.
;  Wipes all stored license keys, service role keys, and user session data
;  so the same license CANNOT be reused on a fresh installation.
; ─────────────────────────────────────────────────────────────────────────────

!macro customUnInstall
  ; Remove the entire application AppData folder which contains:
  ;   - Local Storage / LevelDB  (license key, service role key, user tokens)
  ;   - IndexedDB                (offline DB cache)
  ;   - app.log                  (debug logs)
  ;   - Encrypted config blobs   (field-encryption key material)
  RMDir /r "$APPDATA\le-soft"

  ; Also clean up any registry entries left by the app
  DeleteRegKey HKCU "Software\le-soft"
  DeleteRegKey HKCU "Software\LESOFT"
!macroend
