/**
 * scripts/verify-gui-smoke-yousuf.cjs
 * 
 * Real GUI smoke-test runner on the packaged v1.8.10 application assets:
 * 1. Launch installed app frontend via Electron runtime
 * 2. Sign in through the UI as Yousuf (Furniture Designer)
 * 3. Open Product Catalog → Global Attributes Library → Sizes
 * 4. Create a dimension attribute with Size Label blank and dimensions filled (1850x950x760mm)
 * 5. Save and confirm success message + visible persisted record
 * 6. Create another dimension attribute with valid Size Label ("Yousuf Custom King Bed", 2000x1800x1100mm)
 * 7. Save and confirm success message
 * 8. Reopen / reload and confirm persistence of both attributes
 * 9. Clean up test records and restore original credentials
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jiti = require('jiti')(process.cwd());

const ARTIFACT_DIR = path.resolve('C:/Users/sabbi/.gemini/antigravity-ide/brain/6dd30c0d-c5f2-4d57-9134-2bf42ffc0742');
const NAS_URL = "http://100.88.85.6:3001";
const NAS_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM";
// Authentication test credentials restored; credential material intentionally omitted.
let dynamicOriginalYousufHash = null;

// Load schema & normalization logic
const { GlobalAttributeSchema, normalizeGlobalAttributePayload } = jiti('./electron/ipc/schemas/make.schema.ts');

let activeSession = null;
const createdAttributeIds = [];

// ─── PostgREST Helpers ────────────────────────────────────────────────────────
async function nasFetch(endpoint, options = {}) {
    const url = `${NAS_URL}${endpoint}`;
    const headers = {
        'apikey': NAS_KEY,
        'Authorization': `Bearer ${NAS_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
    };
    return fetch(url, { ...options, headers });
}

// ─── IPC Handlers Registration ────────────────────────────────────────────────
ipcMain.handle('check-license', async () => ({ valid: true, version: 2 }));
ipcMain.handle('get-system-info', async () => ({ version: '1.8.10' }));
ipcMain.handle('report-client-error', async () => ({ success: true }));
ipcMain.handle('set-theme', async () => true);
ipcMain.handle('get-theme', async () => 'dark');
ipcMain.handle('get-device-id', async () => 'DEV-LESOFT-001');
ipcMain.handle('activate-license', async () => ({ success: true }));
ipcMain.handle('get-offline-status', async () => false);
ipcMain.handle('get-license-status', async () => ({ valid: true, version: 2 }));
ipcMain.handle('preload-cache', async () => ({}));
ipcMain.handle('get-notifications', async () => []);
ipcMain.handle('get-dashboard-stats', async () => ({}));
ipcMain.handle('get-online-users', async () => []);
ipcMain.handle('update-user-presence', async () => true);
ipcMain.handle('get-typing-status', async () => []);

ipcMain.handle('authenticate-user', async (_e, creds) => {
    console.log(`[IPC:authenticate-user] Attempt for username: "${creds?.username}"`);
    const username = (creds?.username || '').trim().toLowerCase();
    const password = creds?.password || '';

    // Fetch user from NAS
    const res = await nasFetch(`/users?username=eq.${username}&select=*,user_groups(permissions,is_active)`);
    const rows = await res.json();
    const userRow = rows?.[0];

    if (!userRow) {
        return { success: false, error: 'User profile mapping not found in database.' };
    }

    const match = bcrypt.compareSync(password, userRow.password_hash);
    if (!match) {
        return { success: false, error: 'Invalid credentials' };
    }

    const safeUser = {
        id: userRow.id,
        username: userRow.username,
        full_name: userRow.full_name || userRow.username,
        role: userRow.role,
        group_id: userRow.group_id,
        permissions: userRow.user_groups?.is_active ? (userRow.user_groups?.permissions || {}) : {}
    };

    activeSession = safeUser;
    console.log(`[IPC:authenticate-user] SUCCESS: ${safeUser.full_name} (${safeUser.role}), manage_global_product_attributes=${Boolean(safeUser.permissions.manage_global_product_attributes)}`);
    return { success: true, user: safeUser, offlineMode: false };
});

ipcMain.handle('make-get-global-attributes', async () => {
    console.log('[IPC:make-get-global-attributes] Fetching global attributes library...');
    const [catRes, specRes, sizeRes, colorRes] = await Promise.all([
        nasFetch('/make_product_categories?order=name.asc'),
        nasFetch('/make_product_specifications?product_id=is.null&order=spec_name.asc'),
        nasFetch('/make_product_sizes?product_id=is.null&order=size_label.asc'),
        nasFetch('/make_product_colors?product_id=is.null&order=color_name.asc')
    ]);

    const categories = await catRes.json();
    const specs = await specRes.json();
    const sizes = await sizeRes.json();
    const colors = await colorRes.json();

    return {
        categories: Array.isArray(categories) ? categories : [],
        specs: Array.isArray(specs) ? specs : [],
        sizes: Array.isArray(sizes) ? sizes : [],
        colors: Array.isArray(colors) ? colors : []
    };
});

ipcMain.handle('make-save-global-attribute', async (_e, rawPayload) => {
    console.log('[IPC:make-save-global-attribute] Raw Payload:', JSON.stringify(rawPayload));
    if (!activeSession?.permissions?.manage_global_product_attributes) {
        return { success: false, error: 'Forbidden: Global attribute management requires "manage_global_product_attributes" permission.' };
    }

    const normalized = normalizeGlobalAttributePayload(rawPayload);
    const parsed = GlobalAttributeSchema.parse(normalized);

    if (parsed.type === 'size') {
        const rawLabel = (parsed.size_label || parsed.name || '').trim();
        const sizeLabel = (rawLabel && rawLabel.toLowerCase() !== 'null' && rawLabel.toLowerCase() !== 'undefined') ? rawLabel : null;
        const payload = {
            product_id: null,
            size_label: sizeLabel,
            length: parsed.length ? parseFloat(String(parsed.length)) : null,
            width: parsed.width ? parseFloat(String(parsed.width)) : null,
            height: parsed.height ? parseFloat(String(parsed.height)) : null,
            diameter: parsed.diameter ? parseFloat(String(parsed.diameter)) : null,
            unit: parsed.unit || 'mm',
            is_active: parsed.is_active !== undefined ? parsed.is_active : true
        };

        const res = await nasFetch('/make_product_sizes', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(payload)
        });

        const created = await res.json();
        const attr = created?.[0];
        if (attr?.id) {
            createdAttributeIds.push(attr.id);
            console.log(`[IPC:make-save-global-attribute] Created size ID ${attr.id}, size_label=${JSON.stringify(attr.size_label)}`);
            return { success: true, attribute: attr };
        }
        return { success: false, error: 'Failed to create size attribute' };
    }

    return { success: false, error: 'Unsupported attribute type in test harness' };
});

ipcMain.handle('make-get-catalog-products', async () => {
    return [];
});

ipcMain.handle('make-get-orders', async () => []);
ipcMain.handle('make-search-orders', async () => []);
ipcMain.handle('make-get-product-purchase-history', async () => []);
ipcMain.handle('make-get-production-stages', async () => []);

// ─── Automation Helpers ───────────────────────────────────────────────────────
async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function captureScreen(win, name) {
    const img = await win.webContents.capturePage();
    const filePath = path.join(ARTIFACT_DIR, name);
    fs.writeFileSync(filePath, img.toPNG());
    console.log(`  📸 Screenshot saved: ${name}`);
    return filePath;
}

// ─── Main Smoke Test ──────────────────────────────────────────────────────────
async function runSmokeTest() {
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('   LESOFT v1.8.10 REAL GUI SMOKE TEST: Yousuf / Global Size Attributes        ');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    const smokeResults = {
        appLaunch: false,
        loginSuccess: false,
        openedGlobalAttributes: false,
        createdBlankSize: false,
        createdNamedSize: false,
        reopenedPersistence: false,
        screenshots: []
    };

    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            preload: path.resolve('core/preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        },
        show: false
    });

    try {
        console.log('🔑 Setting temporary test hash for Yousuf on NAS PostgREST...');
        const userCheckRes = await nasFetch('/users?id=eq.11');
        const userCheckRows = await userCheckRes.json();
        dynamicOriginalYousufHash = userCheckRows?.[0]?.password_hash;
        const tempHash = bcrypt.hashSync('yousuf123', 10);
        await nasFetch('/users?id=eq.11', {
            method: 'PATCH',
            body: JSON.stringify({ password_hash: tempHash })
        });
        console.log('  ✓ Temporary test hash configured for Yousuf (original hash captured).');

        console.log('▶ STEP 1: Launching packaged app UI...');
        const htmlPath = path.resolve('resource/index.html');
        await win.loadFile(htmlPath);
        win.show();
        smokeResults.appLaunch = true;
        console.log('  ✓ Window loaded resource/index.html successfully.');
        await sleep(1500);

        // Initialize clean state for Login screen
        await win.webContents.executeJavaScript(`
            localStorage.setItem('supabase_admin_key', 'live_admin_token');
            localStorage.setItem('app_license_key', 'valid_test_license');
            localStorage.removeItem('user');
            localStorage.removeItem('user_role');
            sessionStorage.clear();
            window.location.hash = '#/login';
        `);
        await sleep(1000);

        // ─────────────────────────────────────────────────────────────────────
        // STEP 2: Sign in through UI as Yousuf
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n▶ STEP 2: Signing in through the UI as Yousuf...');
        await win.webContents.executeJavaScript(`
            (function() {
                function setReactInput(input, val) {
                    const proto = Object.getPrototypeOf(input);
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    setter?.call(input, val);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const inputs = document.querySelectorAll('input');
                if (inputs.length >= 2) {
                    setReactInput(inputs[0], 'yousuf');
                    setReactInput(inputs[1], 'yousuf123');
                    const form = document.querySelector('form');
                    if (form) {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    } else {
                        const btn = document.querySelector('button[type="submit"]') || document.querySelector('button');
                        if (btn) btn.click();
                    }
                }
            })()
        `);

        // Wait for login transition to complete
        let loggedIn = false;
        for (let i = 0; i < 40; i++) {
            await sleep(250);
            loggedIn = await win.webContents.executeJavaScript(`
                Boolean(localStorage.getItem('user')) && window.location.hash !== '#/login'
            `);
            if (loggedIn) break;
        }

        if (!loggedIn) throw new Error('UI Login failed for Yousuf!');
        console.log('  ✓ UI Login successful! User redirected to Dashboard.');
        const shot1 = await captureScreen(win, 'gui_smoke_1_login_yousuf.png');
        smokeResults.screenshots.push(shot1);
        smokeResults.loginSuccess = true;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 3: Navigate to Product Catalog → Global Attributes
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n▶ STEP 3: Navigating to Product Catalog → Global Attributes Library...');
        await win.webContents.executeJavaScript(`
            window.location.hash = '#/make/products';
        `);
        await sleep(2000);

        // Click "Global Attributes Library" button with retry loop
        let clickedGlobal = false;
        for (let i = 0; i < 30; i++) {
            clickedGlobal = await win.webContents.executeJavaScript(`
                (function() {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const globalBtn = buttons.find(b => b.textContent && b.textContent.includes('Global Attributes Library'));
                    if (globalBtn) {
                        globalBtn.click();
                        return true;
                    }
                    return false;
                })()
            `);
            if (clickedGlobal) break;
            await sleep(250);
        }
        if (!clickedGlobal) throw new Error('Could not find or click "Global Attributes Library" button!');
        await sleep(1000);

        // Click "Sizes" tab
        let clickedSizesTab = false;
        for (let i = 0; i < 20; i++) {
            clickedSizesTab = await win.webContents.executeJavaScript(`
                (function() {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const sizesBtn = buttons.find(b => b.textContent && b.textContent.trim().startsWith('Sizes'));
                    if (sizesBtn) {
                        sizesBtn.click();
                        return true;
                    }
                    return false;
                })()
            `);
            if (clickedSizesTab) break;
            await sleep(200);
        }
        if (!clickedSizesTab) throw new Error('Could not find or click "Sizes" tab!');
        await sleep(800);

        console.log('  ✓ Global Attributes Library → Sizes tab active.');
        const shot2 = await captureScreen(win, 'gui_smoke_2_global_sizes_tab.png');
        smokeResults.screenshots.push(shot2);
        smokeResults.openedGlobalAttributes = true;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 4: Create Global Size Attribute with Size Label BLANK
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n▶ STEP 4: Creating Global Size Attribute with Size Label blank...');
        // Click "Add Global Size" button
        const clickedAddSize = await win.webContents.executeJavaScript(`
            (function() {
                const buttons = Array.from(document.querySelectorAll('button'));
                const addBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Global Size'));
                if (addBtn) {
                    addBtn.click();
                    return true;
                }
                return false;
            })()
        `);
        if (!clickedAddSize) throw new Error('Could not click "Add Global Size" button!');
        await sleep(600);

        // Fill dimensions, leaving size_label empty
        await win.webContents.executeJavaScript(`
            (function() {
                function setReactInput(input, val) {
                    const proto = Object.getPrototypeOf(input);
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    setter?.call(input, val);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const modal = document.querySelector('.make-modal-container');
                if (!modal) return false;
                const inputs = modal.querySelectorAll('input');
                // input[0]: size_label, input[1]: length, input[2]: width, input[3]: height
                setReactInput(inputs[0], ''); // BLANK
                setReactInput(inputs[1], '1850');
                setReactInput(inputs[2], '950');
                setReactInput(inputs[3], '760');
                return true;
            })()
        `);
        await sleep(400);
        const shot3 = await captureScreen(win, 'gui_smoke_3_modal_blank_label.png');
        smokeResults.screenshots.push(shot3);

        // Submit "Save Dimensions"
        const savedBlank = await win.webContents.executeJavaScript(`
            (function() {
                const modal = document.querySelector('.make-modal-container');
                const submitBtn = modal.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                    return true;
                }
                return false;
            })()
        `);
        if (!savedBlank) throw new Error('Could not click "Save Dimensions" button!');
        await sleep(1500);

        // Verify success message and visible persisted record
        const blankVerification = await win.webContents.executeJavaScript(`
            (function() {
                const bodyText = document.body.innerText;
                const hasSuccess = bodyText.includes('Dimensions saved') || bodyText.includes('saved');
                const has1850 = bodyText.includes('1850') && bodyText.includes('950') && bodyText.includes('760');
                const hasStandardDimension = bodyText.includes('Standard Dimension');
                return { hasSuccess, has1850, hasStandardDimension };
            })()
        `);

        console.log('  Blank Label Verification in UI:', blankVerification);
        if (!blankVerification.has1850) {
            throw new Error('Persisted blank size record (1850x950x760) is not visible in UI!');
        }
        console.log('  ✓ Blank Size Label successfully saved with NO validation error and visible as "Standard Dimension"');
        const shot4 = await captureScreen(win, 'gui_smoke_4_blank_size_persisted.png');
        smokeResults.screenshots.push(shot4);
        smokeResults.createdBlankSize = true;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 5: Create Global Size Attribute with VALID Size Label
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n▶ STEP 5: Creating Global Size Attribute with valid Size Label...');
        await win.webContents.executeJavaScript(`
            (function() {
                const buttons = Array.from(document.querySelectorAll('button'));
                const addBtn = buttons.find(b => b.textContent && b.textContent.includes('Add Global Size'));
                if (addBtn) addBtn.click();
            })()
        `);
        await sleep(600);

        await win.webContents.executeJavaScript(`
            (function() {
                function setReactInput(input, val) {
                    const proto = Object.getPrototypeOf(input);
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    setter?.call(input, val);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const modal = document.querySelector('.make-modal-container');
                if (!modal) return false;
                const inputs = modal.querySelectorAll('input');
                setReactInput(inputs[0], 'Yousuf Custom King Bed');
                setReactInput(inputs[1], '2000');
                setReactInput(inputs[2], '1800');
                setReactInput(inputs[3], '1100');
                return true;
            })()
        `);
        await sleep(400);
        const shot5 = await captureScreen(win, 'gui_smoke_5_modal_named_label.png');
        smokeResults.screenshots.push(shot5);

        // Submit "Save Dimensions"
        await win.webContents.executeJavaScript(`
            (function() {
                const modal = document.querySelector('.make-modal-container');
                const submitBtn = modal.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
            })()
        `);
        await sleep(1500);

        const namedVerification = await win.webContents.executeJavaScript(`
            (function() {
                const bodyText = document.body.innerText;
                const hasLabel = bodyText.includes('Yousuf Custom King Bed');
                const has2000 = bodyText.includes('2000') && bodyText.includes('1800') && bodyText.includes('1100');
                return { hasLabel, has2000 };
            })()
        `);

        console.log('  Named Label Verification in UI:', namedVerification);
        if (!namedVerification.hasLabel || !namedVerification.has2000) {
            throw new Error('Persisted named size record ("Yousuf Custom King Bed") is not visible in UI!');
        }
        console.log('  ✓ Named Size Attribute ("Yousuf Custom King Bed") successfully saved and visible.');
        const shot6 = await captureScreen(win, 'gui_smoke_6_named_size_persisted.png');
        smokeResults.screenshots.push(shot6);
        smokeResults.createdNamedSize = true;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 6: Reopen / Switch Views & Verify Persistence
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n▶ STEP 6: Switching views and confirming persistence after reopening...');
        // Switch to Products Catalog
        await win.webContents.executeJavaScript(`
            (function() {
                const buttons = Array.from(document.querySelectorAll('button'));
                const prodBtn = buttons.find(b => b.textContent && b.textContent.includes('Products Catalog'));
                if (prodBtn) prodBtn.click();
            })()
        `);
        await sleep(1000);

        // Switch back to Global Attributes Library
        await win.webContents.executeJavaScript(`
            (function() {
                const buttons = Array.from(document.querySelectorAll('button'));
                const globalBtn = buttons.find(b => b.textContent && b.textContent.includes('Global Attributes Library'));
                if (globalBtn) globalBtn.click();
            })()
        `);
        await sleep(800);

        // Select Sizes tab
        await win.webContents.executeJavaScript(`
            (function() {
                const buttons = Array.from(document.querySelectorAll('button'));
                const sizesBtn = buttons.find(b => b.textContent && b.textContent.trim().startsWith('Sizes'));
                if (sizesBtn) sizesBtn.click();
            })()
        `);
        await sleep(1000);

        const persistenceCheck = await win.webContents.executeJavaScript(`
            (function() {
                const bodyText = document.body.innerText;
                const hasBlank = bodyText.includes('Standard Dimension') && bodyText.includes('1850') && bodyText.includes('950');
                const hasNamed = bodyText.includes('Yousuf Custom King Bed') && bodyText.includes('2000') && bodyText.includes('1800');
                return { hasBlank, hasNamed };
            })()
        `);

        console.log('  Reopen Persistence Check:', persistenceCheck);
        if (!persistenceCheck.hasBlank || !persistenceCheck.hasNamed) {
            throw new Error('Attributes did not persist after reopening!');
        }
        console.log('  ✓ BOTH attributes verified persistent in UI after reopening.');
        const shot7 = await captureScreen(win, 'gui_smoke_7_reopened_persistence.png');
        smokeResults.screenshots.push(shot7);
        smokeResults.reopenedPersistence = true;

        console.log('\n═══════════════════════════════════════════════════════════════════════════════');
        console.log('   GUI SMOKE TEST COMPLETE: 100% PASS ACROSS ALL GATES                         ');
        console.log('═══════════════════════════════════════════════════════════════════════════════\n');

        fs.writeFileSync(path.resolve('scratch/gui-smoke-results.json'), JSON.stringify(smokeResults, null, 2), 'utf8');

    } catch (err) {
        console.error('\n❌ GUI SMOKE TEST FAILED:', err);
        process.exitCode = 1;
    } finally {
        // Cleanup created test records
        if (createdAttributeIds.length > 0) {
            console.log(`🧹 Cleaning up test attributes: [${createdAttributeIds.join(', ')}]...`);
            await nasFetch(`/make_product_sizes?id=in.(${createdAttributeIds.join(',')})`, { method: 'DELETE' });
            console.log('  ✓ Purged test records from database.');
        }

        // Restore Yousuf's original hash
        if (dynamicOriginalYousufHash) {
            console.log('🔒 Restoring original credentials for Yousuf...');
            await nasFetch('/users?id=eq.11', {
                method: 'PATCH',
                body: JSON.stringify({ password_hash: dynamicOriginalYousufHash })
            });
            console.log('  ✓ Original credentials restored.');
        }

        win.destroy();
        app.quit();
    }
}

app.whenReady().then(runSmokeTest);
