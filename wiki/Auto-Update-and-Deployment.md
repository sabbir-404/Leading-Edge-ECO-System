# Auto-Update & Deployment

This page covers how to build, publish, and distribute LE-SOFT releases, including the automatic update system for end users.

---

## Overview

LE-SOFT uses **electron-updater** + **GitHub Releases** for distributing software updates. When a new version is released:

1. Developer builds and publishes the installer to a GitHub Release
2. Running instances of LE-SOFT check for updates at startup
3. A notification banner appears when an update is available
4. User downloads and installs the update without leaving the app

---

## Step 1: Create a GitHub Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a descriptive name (e.g., `LE-SOFT Auto-Update`)
4. Set expiration (recommended: **No expiration** for CI/CD, or **1 year**)
5. Select scope: ✅ `repo` (Full control of private repositories)
6. Click **"Generate token"** and **copy it immediately**

> ⚠️ Never commit your token to source control.

---

## Step 2: Set the Token as an Environment Variable

### Temporary (current terminal session only)

**PowerShell:**
```powershell
$env:GH_TOKEN = "ghp_YourTokenHere"
```

**Command Prompt:**
```cmd
set GH_TOKEN=ghp_YourTokenHere
```

### Permanent (recommended for dev machine)

1. Open **Windows Settings → System → About → Advanced system settings**
2. Click **Environment Variables**
3. Under **User variables**, click **New**
   - Variable name: `GH_TOKEN`
   - Variable value: `ghp_YourTokenHere`
4. Click **OK** and restart your terminal

---

## Step 3: Bump the Version

Before publishing an update, increment the version in `LE-SOFT/package.json`:

```json
{
  "version": "1.4.0"
}
```

Use [Semantic Versioning](https://semver.org/):
- **Patch** (`1.3.1 → 1.3.2`): Bug fixes
- **Minor** (`1.3.1 → 1.4.0`): New features
- **Major** (`1.3.1 → 2.0.0`): Breaking changes

---

## Step 4: Build and Publish

### Windows Release

```bash
cd LE-SOFT
npm run dist:publish
```

### macOS Release

```bash
cd LE-SOFT
npm run dist:mac:publish
```

### Both Platforms

```bash
cd LE-SOFT
npm run dist:all
```

These commands:
1. Build the React frontend with Vite
2. Bundle the Electron main/preload with esbuild
3. Package the app with electron-builder
4. Upload the installer + `latest.yml` to a **draft** GitHub Release

---

## Step 5: Publish the GitHub Release

1. Go to the repository's [Releases page](https://github.com/sabbir-404/Leading-Edge-ECO-System/releases)
2. Find the newly created **draft** release
3. Review the release notes and attached files
4. Click **"Publish release"**

Once published, running LE-SOFT instances will detect the new version.

---

## How Auto-Update Works (User Perspective)

```
LE-SOFT Starts
      ↓
10 seconds after startup: checks GitHub Releases for updates
      ↓
New version found?
      ├─ No  → nothing happens
      └─ Yes → notification banner appears at top of window
                    ↓
              User clicks "Download"
                    ↓
              Progress bar shows download
                    ↓
              User clicks "Install & Restart"
                    ↓
              App restarts with new version installed
```

Users can also check manually: **Settings → Check for Updates**

---

## Build Artifacts

After running `npm run dist` or `npm run dist:publish`, the following files are generated:

```
LE-SOFT/release/
├── LESOFT Setup 1.x.x.exe      # Windows NSIS installer
├── LESOFT-1.x.x-win.zip        # Windows portable (if configured)
├── LESOFT-1.x.x.dmg            # macOS disk image
├── LESOFT-1.x.x-mac.zip        # macOS zip
├── latest.yml                  # Windows update manifest (auto-updater reads this)
└── latest-mac.yml              # macOS update manifest
```

---

## Windows Installer Details

LE-SOFT uses **NSIS** (Nullsoft Scriptable Install System) for the Windows installer:

| Setting | Value |
|---------|-------|
| One-click install | Disabled (user can choose directory) |
| Desktop shortcut | Always created |
| Start menu shortcut | Created |
| Shortcut name | LESOFT |
| License agreement | `LE-SOFT/LICENSE.txt` |

---

## macOS Distribution

For macOS-specific distribution notes, see `LE-SOFT/docs/MAC_DISTRIBUTION.md`.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Auto-updater not configured" | Only works in packaged builds (`npm run dist`), not in dev mode |
| "GH_TOKEN not found" | Ensure the `GH_TOKEN` environment variable is set |
| Release not detected by clients | Ensure the release is **published** (not draft) on GitHub |
| Update not offered to users | Confirm the new `version` in `package.json` is higher than the installed version |
| Build fails on Windows | Ensure Visual Studio C++ build tools are installed for native module compilation |

---

## Mobile App Updates (Expo OTA)

The Staff Mobile App uses **Expo Updates** for over-the-air (OTA) updates:

```bash
cd LE-SOFT/mobile-staff

# Publish an OTA update
npx eas update --branch production --message "Description of changes"
```

OTA updates are delivered to devices automatically on next app launch, without requiring a new app store submission (for JavaScript-only changes).

---

## See Also

- [LE-SOFT Desktop App](LE-SOFT-Desktop-App)
- [Setup & Installation](Setup-and-Installation)
- [Architecture & Tech Stack](Architecture-and-Tech-Stack)
