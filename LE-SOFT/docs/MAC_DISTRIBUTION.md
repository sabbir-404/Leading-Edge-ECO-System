# macOS Distribution Guide

Since the LESOFT application uses native modules (like SQLite and Bcrypt), it must be built on a macOS system to work correctly. We have configured **GitHub Actions** to automate this for you.

## 🚀 How to Generate the macOS Installer

1.  **Commit and Push**: Ensure your latest code changes (including the `.github/workflows/build-mac.yml` and `package.json` updates I just made) are pushed to your GitHub repository.
2.  **Go to GitHub**: Navigate to your repository on GitHub (`sabbir-404/Leading-Edge-ECO-System`).
3.  **Actions Tab**: Click on the **"Actions"** tab at the top.
4.  **Select Workflow**: On the left sidebar, click on **"Build macOS Version"**.
5.  **Run Workflow**: Click the **"Run workflow"** dropdown button on the right and then click the green **"Run workflow"** button. This will start a real Mac server in the cloud to build your software.
6.  **Download Artifacts**: 
    - Once the build is finished (it will take a few minutes), click on the completed run.
    - Scroll down to the **"Artifacts"** section.
    - Download the **"LESOFT-macOS"** package.
    - This will contain a `.dmg` (installer) and a `.zip` file.

## 📦 Distributing to Users

*   **The .dmg File**: This is the standard Mac installer. Users can open it and drag the LESOFT icon to their Applications folder.
*   **Notarization Note**: Because this build is not "Digitally Signed" with an Apple Developer Account, your Mac users might see a warning: *"LESOFT can't be opened because it is from an unidentified developer."*
    - **Instructions for Users**: They should right-click (or Control-click) the app and select **Open**, then click **Open** again in the dialog box. This only needs to be done once.

## 🖼️ Improving the Icon

I've set the icon to `Logo/logo black.png`. For the best results on high-resolution Retina displays, ensure this file is at least **1024x1024 pixels**. If the icon looks blurry, replace that file with a higher-resolution version.
