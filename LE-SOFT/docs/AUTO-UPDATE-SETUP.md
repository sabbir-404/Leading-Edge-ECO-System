# Auto-Update Publishing Guide — GitHub Releases

This guide explains how to set up automatic update publishing using GitHub Releases for LE SOFT.

## Step 1: Create a GitHub Personal Access Token (GH_TOKEN)

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a descriptive name, e.g. `LE-SOFT Auto-Update`
4. Set the expiration (recommended: **No expiration** for CI/CD, or **1 year**)
5. Select these scopes:
   - ✅ `repo` (Full control of private repositories)
6. Click **"Generate token"**
7. **COPY THE TOKEN IMMEDIATELY** — you won't be able to see it again!

> ⚠️ **IMPORTANT**: Never commit your token to source control. Keep it secret.

## Step 2: Set the Token as an Environment Variable

### Option A: Set Temporarily (Current Terminal Session)

**PowerShell:**
```powershell
$env:GH_TOKEN = "ghp_YourTokenHere"
```

**Command Prompt:**
```cmd
set GH_TOKEN=ghp_YourTokenHere
```

### Option B: Set Permanently (Recommended for Your Dev Machine)

1. Open **Windows Settings** → **System** → **About** → **Advanced system settings**
2. Click **"Environment Variables"**
3. Under **"User variables"**, click **"New"**
   - Variable name: `GH_TOKEN`
   - Variable value: `ghp_YourTokenHere`
4. Click **OK** and restart your terminal

## Step 3: Configure Your GitHub Repository

1. Create a GitHub repository (or use the existing one)
2. Make sure `package.json` has these fields:

```json
{
  "name": "le-soft",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/YOUR_REPO.git"
  },
  "build": {
    "publish": {
      "provider": "github",
      "owner": "YOUR_USERNAME",
      "repo": "YOUR_REPO"
    }
  }
}
```

3. Replace `YOUR_USERNAME` and `YOUR_REPO` with your actual GitHub username and repository name.

## Step 4: Publish an Update

1. **Bump the version** in `package.json`:
   ```json
   "version": "1.1.0"
   ```

2. **Build and publish**:
   ```powershell
   npm run dist:publish
   ```

3. This will:
   - Build the frontend with Vite
   - Bundle the Electron code with esbuild
   - Package the app with electron-builder
   - Upload the installer + `latest.yml` to a GitHub Release (draft)

4. **Go to your GitHub Releases** page and **publish** the draft release.

## Step 5: How Auto-Update Works

When users run LE SOFT:
1. **10 seconds after startup**, the app checks for updates (`autoUpdater.checkForUpdates()`)
2. If a new version is found on GitHub Releases, a **notification banner** appears at the top
3. User clicks **"Download"** → progress bar shows download status
4. Once downloaded, user clicks **"Install & Restart"** to apply the update
5. Users can also check manually from **Settings** → **Check for Updates**

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Auto-updater not configured" | Only works in packaged builds (`npm run dist`), not in dev mode |
| "Token not found" | Ensure `GH_TOKEN` is set in your environment variables |
| Release not found | Make sure you **published** the draft release on GitHub |
| Update not detected | Ensure the new version number is higher than the current one |
