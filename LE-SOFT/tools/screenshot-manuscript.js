const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Pages to capture with their routes and descriptions
const PAGE_ROUTES = [
  { name: 'Dashboard', route: '/#/dashboard', label: 'Dashboard' },
  { name: 'Purchase Requisitions', route: '/#/masters/purchase-requisitions', label: 'Inventory - Purchase Requisitions' },
  { name: 'Stock Groups', route: '/#/masters/stock-groups', label: 'Inventory - Stock Groups' },
  { name: 'Units', route: '/#/masters/units', label: 'Inventory - Units' },
  { name: 'Products', route: '/#/masters/products', label: 'Inventory - Products' },
  { name: 'Voucher List', route: '/#/accounting/vouchers', label: 'Accounting - Vouchers' },
  { name: 'Purchase Bills', route: '/#/accounting/purchase-bills', label: 'Accounting - Purchase Bills' },
  { name: 'Trial Balance', route: '/#/reports/trial-balance', label: 'Reports - Trial Balance' },
  { name: 'Balance Sheet', route: '/#/reports/balance-sheet', label: 'Reports - Balance Sheet' },
  { name: 'Profit & Loss', route: '/#/reports/profit-loss', label: 'Reports - Profit & Loss' },
  { name: 'Stock Summary', route: '/#/reports/stock-summary', label: 'Reports - Stock Summary' },
  { name: 'Users', route: '/#/users', label: 'Users Management' },
  { name: 'User Groups', route: '/#/user-groups', label: 'User Groups' },
  { name: 'Billing', route: '/#/billing', label: 'Billing' },
  { name: 'CRM Directory', route: '/#/crm/directory', label: 'CRM - Directory' },
  { name: 'HRM Dashboard', route: '/#/hrm', label: 'HRM - Dashboard' },
  { name: 'Website Dashboard', route: '/#/website', label: 'Website - Dashboard' },
];

async function capturePages() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const screenshots = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Inject mock Electron API with proper cleanup function support
    await page.evaluateOnNewDocument(() => {
      window.electronListeners = {};

      window.electron = {
        // Mock all IPC handlers that return data
        getGroups: () => Promise.resolve([]),
        getLedgers: () => Promise.resolve([]),
        getVouchers: () => Promise.resolve([]),
        getUnits: () => Promise.resolve([]),
        getStockGroups: () => Promise.resolve([]),
        getStockItems: () => Promise.resolve([]),
        getProducts: () => Promise.resolve([]),
        getPurchaseBills: () => Promise.resolve([]),
        getUsers: () => Promise.resolve([]),
        getUserGroups: () => Promise.resolve([]),
        getNotifications: () => Promise.resolve([]),
        getCompanies: () => Promise.resolve([]),
        getDashboardStats: () => Promise.resolve({}),
        getSettings: () => Promise.resolve({}),
        websiteGetProducts: () => Promise.resolve([]),
        websiteGetOrders: () => Promise.resolve([]),
        websiteGetCategories: () => Promise.resolve([]),
        websiteGetStats: () => Promise.resolve({}),
        websiteGetDashboardData: () => Promise.resolve({}),
        websiteGetUsers: () => Promise.resolve([]),
        reportTrialBalance: () => Promise.resolve({}),
        reportBalanceSheet: () => Promise.resolve({}),
        reportProfitAndLoss: () => Promise.resolve({}),
        reportStockSummary: () => Promise.resolve({}),
        reportDayBook: () => Promise.resolve({}),
        getPurchaseRequisitions: () => Promise.resolve([]),
        getPurchaseRequisitionById: () => Promise.resolve(null),
        createPurchaseRequisition: () => Promise.resolve({}),
        updatePurchaseRequisition: () => Promise.resolve({}),
        deletePurchaseRequisition: () => Promise.resolve({}),
        getStockHistory: () => Promise.resolve([]),
        reportProductHistory: () => Promise.resolve([]),
        reportMarketAnalysis: () => Promise.resolve({}),
        getCRMData: () => Promise.resolve({}),
        getBillData: () => Promise.resolve([]),
        getCustomerLedgers: () => Promise.resolve([]),
        getExchangeOrders: () => Promise.resolve([]),
        getCRMProgress: () => Promise.resolve([]),
        getHRMData: () => Promise.resolve({}),
        getHRMAttendance: () => Promise.resolve([]),
        getHRMLeaves: () => Promise.resolve([]),
        getHRMPayroll: () => Promise.resolve([]),
        getMakeData: () => Promise.resolve({}),
        getMakeOrders: () => Promise.resolve([]),
        getQuotations: () => Promise.resolve([]),

        // Event listener with proper cleanup function
        onDataUpdated: (callback) => {
          const id = Math.random().toString(36);
          window.electronListeners[id] = callback;

          // Return unsubscribe function
          return () => {
            delete window.electronListeners[id];
          };
        },

        // Cleanup on logout/clear
        clearSession: () => {
          window.electronListeners = {};
        },

        // Redirect handler
        onRedirect: (callback) => {
          window.onRedirectCallback = callback;
          return () => {
            window.onRedirectCallback = null;
          };
        },

        // Stubs for other methods
        pickImage: () => Promise.resolve(null),
        createGroup: () => Promise.resolve({}),
        deleteGroup: () => Promise.resolve({}),
        createLedger: () => Promise.resolve({}),
        deleteLedger: () => Promise.resolve({}),
        createVoucher: () => Promise.resolve({}),
        deleteVoucher: () => Promise.resolve({}),
        createUnit: () => Promise.resolve({}),
        deleteUnit: () => Promise.resolve({}),
        createStockGroup: () => Promise.resolve({}),
        deleteStockGroup: () => Promise.resolve({}),
        createStockItem: () => Promise.resolve({}),
        deleteStockItem: () => Promise.resolve({}),
        createProduct: () => Promise.resolve({}),
        deleteProduct: () => Promise.resolve({}),
        createPurchaseBill: () => Promise.resolve({}),
        deletePurchaseBill: () => Promise.resolve({}),
        createUser: () => Promise.resolve({}),
        updateUser: () => Promise.resolve({}),
        deleteUser: () => Promise.resolve({}),
        authenticateUser: () => Promise.resolve({}),
        createUserGroup: () => Promise.resolve({}),
        updateUserGroup: () => Promise.resolve({}),
        deleteUserGroup: () => Promise.resolve({}),
        sendNotification: () => Promise.resolve({}),
        markNotificationRead: () => Promise.resolve({}),
        markAllNotificationsRead: () => Promise.resolve({}),
        deleteNotification: () => Promise.resolve({}),
        createCompany: () => Promise.resolve({}),
        updateSettings: () => Promise.resolve({}),
        websiteCreateProduct: () => Promise.resolve({}),
        websiteUpdateProduct: () => Promise.resolve({}),
        websiteDeleteProduct: () => Promise.resolve({}),
        websiteDeleteProductsBulk: () => Promise.resolve({}),
        websiteUpdateProductStatusBulk: () => Promise.resolve({}),
        websiteCreateOrder: () => Promise.resolve({}),
        websiteUpdateOrder: () => Promise.resolve({}),
        createWebsiteCategory: () => Promise.resolve({}),
      };
    });

    // Seed localStorage with mock auth
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('user_id', '1');
      localStorage.setItem('user_name', 'Super Admin');
      localStorage.setItem('user_role', 'super_admin');
      localStorage.setItem('user_permissions', JSON.stringify({
        read: ['*'],
        create: ['*'],
        update: ['*'],
        delete: ['*'],
      }));
      localStorage.setItem('company_id', '1');
      localStorage.setItem('company_name', 'Test Company');
      localStorage.setItem('theme', 'light');
    });

    // Navigate to the app
    console.log('Loading app...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for SetupScreen and dismiss it
    try {
      console.log('Waiting for setup screen...');
      await page.waitForSelector('button:contains("Next")', { timeout: 5000 }).catch(() => null);
      
      // Try to find and click setup buttons
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && (text.includes('Next') || text.includes('Continue'))) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      }
    } catch (e) {
      console.log('Setup screen handling skipped');
    }

    // Capture screenshots of each page
    console.log(`Capturing ${PAGE_ROUTES.length} pages...`);
    for (const pageInfo of PAGE_ROUTES) {
      try {
        console.log(`  → ${pageInfo.name}...`);
        
        // Navigate to the page
        await page.goto(`http://localhost:5173${pageInfo.route}`, {
          waitUntil: 'networkidle2',
          timeout: 15000,
        }).catch(async () => {
          // If navigation fails, retry with simpler wait
          await page.goto(`http://localhost:5173${pageInfo.route}`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
        });

        // Wait a bit for content to render
        await page.waitForTimeout(1500);

        // Take screenshot
        const screenshotPath = path.join(screenshotsDir, `${pageInfo.name.replace(/\s+/g, '_')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        screenshots.push({
          name: pageInfo.name,
          label: pageInfo.label,
          path: screenshotPath,
        });

        console.log(`    ✓ Saved to ${screenshotPath}`);
      } catch (err) {
        console.error(`    ✗ Error capturing ${pageInfo.name}: ${err.message}`);
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return screenshots;
}

async function createPDFWithScreenshots(screenshots) {
  const jsPDF = require('jspdf');
  const fs = require('fs');

  const doc = new jsPDF.jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  let yPosition = margin;

  // Title page
  doc.setFontSize(28);
  doc.text('LE-SOFT Manuscript', margin, yPosition);
  yPosition += 15;

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text('Screenshots of Application Pages', margin, yPosition);
  yPosition += 10;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
  yPosition += 10;
  doc.text(`Total Pages Captured: ${screenshots.length}`, margin, yPosition);

  // Table of contents
  doc.addPage();
  yPosition = margin;
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Table of Contents', margin, yPosition);
  yPosition += 10;

  doc.setFontSize(11);
  screenshots.forEach((shot, idx) => {
    doc.text(`${idx + 1}. ${shot.label}`, margin + 5, yPosition);
    yPosition += 7;
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
  });

  // Screenshots pages
  for (const screenshot of screenshots) {
    doc.addPage();
    yPosition = margin;

    // Page title
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(screenshot.label, margin, yPosition);
    yPosition += 12;

    // Add screenshot image
    try {
      const imgData = fs.readFileSync(screenshot.path);
      const imgBase64 = Buffer.from(imgData).toString('base64');
      
      // Calculate dimensions to fit on page
      const maxWidth = pageWidth - 2 * margin;
      const maxHeight = pageHeight - yPosition - margin;
      
      // Load image to get dimensions
      const img = new Image();
      img.src = `data:image/png;base64,${imgBase64}`;

      doc.addImage(
        `data:image/png;base64,${imgBase64}`,
        'PNG',
        margin,
        yPosition,
        maxWidth,
        Math.min(maxHeight, (maxWidth * 600) / 1280) // Maintain aspect ratio
      );
    } catch (err) {
      doc.setTextColor(200, 0, 0);
      doc.text(`Error loading screenshot: ${err.message}`, margin, yPosition);
    }
  }

  // Save PDF
  const outputPath = path.join(__dirname, '..', 'docs', 'LE-SOFT_Manuscript_Screenshots.pdf');
  doc.save(outputPath);
  console.log(`\n✓ PDF saved to ${outputPath}`);
  return outputPath;
}

async function main() {
  try {
    console.log('Starting Puppeteer screenshot capture...\n');
    const screenshots = await capturePages();
    
    if (screenshots.length === 0) {
      console.error('No screenshots captured!');
      process.exit(1);
    }

    console.log(`\n✓ Captured ${screenshots.length} screenshots`);
    console.log('\nCreating PDF with screenshots...');
    await createPDFWithScreenshots(screenshots);
    
    console.log('\n✓ Manuscript PDF generated successfully!');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
