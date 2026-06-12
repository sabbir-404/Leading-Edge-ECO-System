/**
 * nas-storage-server.js
 * Standalone storage microservice for LE-SOFT.
 * Run this on your TrueNAS or local server.
 *
 * HOW TO RUN:
 *   1. Copy this file to your NAS folder.
 *   2. Run: npm init -y && npm install express multer cors
 *   3. Run: node nas-storage-server.js
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/files', express.static(UPLOADS_DIR));

// Setup multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Support nested folder paths if sent (e.g. orderId subdirectory)
        const subfolder = req.headers['x-subfolder'] || '';
        const targetPath = path.join(UPLOADS_DIR, subfolder);
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        cb(null, targetPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uploadsCount: fs.readdirSync(UPLOADS_DIR).length });
});

// Upload file endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const subfolder = req.headers['x-subfolder'] || '';
    const fileUrlPath = subfolder ? `${subfolder}/${req.file.filename}` : req.file.filename;
    res.json({
        success: true,
        filename: req.file.filename,
        urlPath: fileUrlPath,
        url: `http://${req.hostname}:${PORT}/files/${fileUrlPath}`
    });
});

// Delete file endpoint
app.post('/delete', (req, res) => {
    const { filePath } = req.body;
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'No file path provided' });
    }
    const fullPath = path.join(UPLOADS_DIR, filePath);
    
    // Safety check: ensure file path doesn't escape uploads folder
    if (!fullPath.startsWith(UPLOADS_DIR)) {
        return res.status(400).json({ success: false, error: 'Access denied' });
    }

    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return res.json({ success: true });
    } else {
        return res.status(404).json({ success: false, error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`[Storage Server] Running on http://localhost:${PORT}`);
    console.log(`[Storage Server] Uploads directory: ${UPLOADS_DIR}`);
});
