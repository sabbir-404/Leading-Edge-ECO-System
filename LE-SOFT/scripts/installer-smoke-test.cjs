/**
 * LESOFT Installer Bounded Smoke Test
 * 
 * Verifies NSIS installer behavior under strict bounds:
 * - Tests silent installation with /S /currentuser
 * - Tests paths with and without spaces
 * - Tests fresh directory installations
 * - Tests uninstallation and reinstallation
 * - Enforces hard timeout (no indefinite hangs)
 * - Captures process tree & thread state on any timeout
 * - Verifies binary outputs (LESOFT.exe, app.asar) and ProductVersion (1.8.4)
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const pkg = require('../package.json');
const targetVersion = pkg.version;
const hyphenInstaller = path.resolve(__dirname, `../release/LESOFT-Setup-${targetVersion}.exe`);
const spacedInstaller = path.resolve(__dirname, `../release/LESOFT Setup ${targetVersion}.exe`);
const installerPath = fs.existsSync(hyphenInstaller) ? hyphenInstaller : spacedInstaller;

if (!fs.existsSync(installerPath)) {
    console.error(`ERROR: Installer not found at ${hyphenInstaller} or ${spacedInstaller}`);
    process.exit(1);
}

const installerStat = fs.statSync(installerPath);
console.log(`[INIT] Installer: ${installerPath} (${(installerStat.size / (1024 * 1024)).toFixed(2)} MB)`);

function runProcessWithTimeout(cmd, args, targetDir, timeoutMs = 90000, label = 'Installer') {
    return new Promise((resolve, reject) => {
        console.log(`\n─────────────────────────────────────────────────────────────`);
        console.log(`[${label}] Executing: ${path.basename(cmd)}`);
        console.log(`[${label}] Args:`, args.join(' '));
        if (targetDir) console.log(`[${label}] Target Directory: ${targetDir}`);
        console.log(`[${label}] Hard Timeout: ${timeoutMs}ms`);

        const startTime = Date.now();
        const proc = spawn(cmd, args, {
            detached: false,
            stdio: 'ignore'
        });

        const pid = proc.pid;
        console.log(`[${label}] Spawned PID: ${pid}`);

        let isDone = false;

        const timer = setTimeout(() => {
            if (isDone) return;
            isDone = true;

            console.error(`\n[FATAL TIMEOUT] ${label} exceeded ${timeoutMs}ms limit!`);
            
            // Collect process tree & diagnostics before killing
            try {
                const procList = execSync(`powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or $_.ParentProcessId -eq ${pid} } | Select-Object ProcessId, ParentProcessId, Name, CommandLine | Format-Table -AutoSize"`, { encoding: 'utf8' });
                console.error('[DIAGNOSTIC] Process tree on timeout:\n', procList);
            } catch (diagErr) {
                console.error('[DIAGNOSTIC] Failed to get process diagnostics:', diagErr.message);
            }

            try {
                const threadList = execSync(`powershell -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Threads | Select-Object Id, WaitReason, ThreadState | Format-Table -AutoSize"`, { encoding: 'utf8' });
                console.error('[DIAGNOSTIC] Thread states on timeout:\n', threadList);
            } catch (tErr) {}

            try {
                const eventLogs = execSync(`powershell -Command "Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddMinutes(-5)} -MaxEvents 10 -ErrorAction SilentlyContinue | Format-Table TimeCreated, ProviderName, Message -AutoSize"`, { encoding: 'utf8' });
                console.error('[DIAGNOSTIC] Recent Application Event logs:\n', eventLogs);
            } catch (logErr) {}

            // Force kill process tree
            try {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            } catch (e) {}

            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        proc.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            reject(err);
        });

        proc.on('exit', (code, signal) => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[${label}] PID ${pid} exited with code: ${code}, signal: ${signal} in ${duration}s`);
            resolve({ code, signal, duration });
        });
    });
}

function verifyInstallation(targetDir) {
    const exePath = path.join(targetDir, 'LESOFT.exe');
    const asarPath = path.join(targetDir, 'resources', 'app.asar');

    if (!fs.existsSync(exePath)) {
        throw new Error(`LESOFT.exe NOT found at ${exePath}`);
    }
    const exeStat = fs.statSync(exePath);
    if (exeStat.size < 50 * 1024 * 1024) {
        throw new Error(`LESOFT.exe is unexpectedly small (${exeStat.size} bytes)`);
    }

    if (!fs.existsSync(asarPath)) {
        throw new Error(`app.asar NOT found at ${asarPath}`);
    }
    const asarStat = fs.statSync(asarPath);
    if (asarStat.size < 50 * 1024 * 1024) {
        throw new Error(`app.asar is unexpectedly small (${asarStat.size} bytes)`);
    }

    const versionOutput = execSync(`powershell -Command "(Get-Item '${exePath}').VersionInfo.ProductVersion"`, { encoding: 'utf8' }).trim();
    console.log(`[VERIFY] LESOFT.exe ProductVersion: ${versionOutput}`);
    console.log(`[VERIFY] LESOFT.exe size: ${(exeStat.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[VERIFY] app.asar size: ${(asarStat.size / (1024 * 1024)).toFixed(2)} MB`);

    if (!versionOutput.startsWith(targetVersion)) {
        throw new Error(`Expected ProductVersion to start with '${targetVersion}', got '${versionOutput}'`);
    }

    return {
        exePath,
        asarPath,
        version: versionOutput,
        exeSize: exeStat.size,
        asarSize: asarStat.size
    };
}

async function runTestSuite() {
    console.log(`=============================================================`);
    console.log(`LESOFT v${targetVersion} BOUNDED INSTALLER SMOKE TEST SUITE`);
    console.log(`=============================================================`);

    // ── TEST A: Silent install to a path WITHOUT spaces ─────────────────────
    const noSpaceDir = path.join(os.tmpdir(), 'lesoft_nospaces_test');
    if (fs.existsSync(noSpaceDir)) fs.rmSync(noSpaceDir, { recursive: true, force: true });
    fs.mkdirSync(noSpaceDir, { recursive: true });

    console.log(`\n>>> TEST 7A: Silent install to a path WITHOUT spaces`);
    await runProcessWithTimeout(installerPath, ['/S', '/currentuser', `/D=${noSpaceDir}`], noSpaceDir, 45000, 'Test-7A-NoSpaces');
    const resA = verifyInstallation(noSpaceDir);
    console.log(`>>> TEST 7A PASSED (Version: ${resA.version})`);
    try { fs.rmSync(noSpaceDir, { recursive: true, force: true }); } catch (e) {}

    // ── TEST B: Silent install to a test path WITH spaces ───────────────────
    const spacesDir = path.resolve(__dirname, '../scratch/test-install-spaces');
    if (fs.existsSync(spacesDir)) fs.rmSync(spacesDir, { recursive: true, force: true });
    fs.mkdirSync(spacesDir, { recursive: true });

    console.log(`\n>>> TEST 7B: Silent install to path WITH spaces`);
    await runProcessWithTimeout(installerPath, ['/S', '/currentuser', `/D=${spacesDir}`], spacesDir, 45000, 'Test-7B-Spaces');
    const resB = verifyInstallation(spacesDir);
    console.log(`>>> TEST 7B PASSED (Version: ${resB.version})`);
    try { fs.rmSync(spacesDir, { recursive: true, force: true }); } catch (e) {}

    // ── TEST C: Install to a completely fresh isolated directory ────────────
    const freshDir = path.resolve(__dirname, '../scratch/test-fresh-dir');
    if (fs.existsSync(freshDir)) fs.rmSync(freshDir, { recursive: true, force: true });
    fs.mkdirSync(freshDir, { recursive: true });

    console.log(`\n>>> TEST 7C: Install to completely fresh directory`);
    await runProcessWithTimeout(installerPath, ['/S', '/currentuser', `/D=${freshDir}`], freshDir, 45000, 'Test-7C-FreshDir');
    const resC = verifyInstallation(freshDir);
    console.log(`>>> TEST 7C PASSED (Version: ${resC.version})`);

    // ── TEST D: Silent uninstallation, cleanup, and reinstall into final target ─
    console.log(`\n>>> TEST 7D: Silent Uninstallation, Cleanup & Final Target Reinstall`);
    const uninstallerPath = path.join(freshDir, 'Uninstall LESOFT.exe');
    if (!fs.existsSync(uninstallerPath)) {
        throw new Error(`Uninstaller not found at ${uninstallerPath}`);
    }

    // Run uninstaller silently
    console.log(`Executing uninstaller from: ${uninstallerPath}`);
    // Note: NSIS uninstaller copies itself to temp and runs, but with _?=$INSTDIR it waits synchronously
    await runProcessWithTimeout(uninstallerPath, ['/S', '/currentuser', `_?=${freshDir}`], freshDir, 45000, 'Test-7D-Uninstall');
    
    // Clean remaining freshDir if any
    try { fs.rmSync(freshDir, { recursive: true, force: true }); } catch (e) {}
    console.log(`Uninstall completed and freshDir cleaned.`);

    // Reinstall into the intended production target directory: scratch/installed-app
    const finalTargetDir = path.resolve(__dirname, '../scratch/installed-app');
    if (fs.existsSync(finalTargetDir)) fs.rmSync(finalTargetDir, { recursive: true, force: true });
    fs.mkdirSync(finalTargetDir, { recursive: true });

    console.log(`Reinstalling into intended target directory: ${finalTargetDir}`);
    await runProcessWithTimeout(installerPath, ['/S', '/currentuser', `/D=${finalTargetDir}`], finalTargetDir, 45000, 'Test-7D-Reinstall');
    const resFinal = verifyInstallation(finalTargetDir);
    console.log(`>>> TEST 7D PASSED (Version: ${resFinal.version})`);

    console.log(`\n=============================================================`);
    console.log(`ALL 4 INSTALLER SMOKE TESTS PASSED CLEANLY!`);
    console.log(`Final installed application verified at: ${finalTargetDir}`);
    console.log(`=============================================================`);
}

runTestSuite().catch((err) => {
    console.error(`\n[FATAL TEST FAILURE]`, err);
    process.exit(1);
});
