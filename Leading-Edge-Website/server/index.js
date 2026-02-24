const express = require('express');
const cors = require('cors');
const helmet = require('helmet');                     // SECURITY: HTTP security headers
const rateLimit = require('express-rate-limit');      // SECURITY: Rate limiting
const mysql = require('mysql2/promise');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ─────────────────────────────────────────────────────
//  SECURITY: Helmet — sets secure HTTP response headers
//  Includes: CSP, HSTS, X-Frame-Options, nosniff, etc.
// ─────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images to be loaded cross-origin
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:', 'http://localhost:3001', 'http://localhost:5173'],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", 'http://localhost:3001', 'http://localhost:5173'],
        },
    },
}));

// ─────────────────────────────────────────────────────
//  SECURITY: CORS — restrict to known origins only
// ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:4173',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests (e.g., Electron IPC → mysql, curl)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: Origin '${origin}' not allowed`));
    },
    credentials: true,
}));

// ─────────────────────────────────────────────────────
//  SECURITY: Rate limiting
// ─────────────────────────────────────────────────────
// Global: 100 requests per minute per IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// Strict limiter for auth routes: 10 per minute
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please wait a minute.' },
});

// ─────────────────────────────────────────────────────
//  Body parser — SECURITY: enforce 10 MB body limit
// ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- 1. ENSURE UPLOAD DIRECTORIES EXIST ---
const uploadDirs = ['uploads/products', 'uploads/projects', 'uploads/thumbnails', 'uploads/gallery', 'uploads/temp'];
uploadDirs.forEach(dir => fs.ensureDirSync(path.join(__dirname, dir)));

// Serve Static Files (Images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Config
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'furniture_shop',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// --- 2. AUTO-INIT DATABASE ---
async function initDB() {
    try {
        const conn = await pool.getConnection();

        // Ensure media_library table exists
        await conn.query(`
            CREATE TABLE IF NOT EXISTS media_library (
                id INT AUTO_INCREMENT PRIMARY KEY,
                file_name VARCHAR(255),
                file_path TEXT,
                folder VARCHAR(50),
                file_size INT,
                mime_type VARCHAR(50),
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                sale_price DECIMAL(10, 2),
                on_sale BOOLEAN DEFAULT FALSE,
                description TEXT,
                short_description TEXT,
                model_number VARCHAR(100),
                image LONGTEXT, 
                is_visible BOOLEAN DEFAULT TRUE,
                extra_data LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Ensure user_groups table exists
        await conn.query(`
            CREATE TABLE IF NOT EXISTS user_groups (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                permissions JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add group_id column to users if missing
        try {
            await conn.query('ALTER TABLE users ADD COLUMN group_id VARCHAR(50) DEFAULT NULL');
            console.log('Added group_id column to users table');
        } catch (e) { /* column already exists */ }

        // Create default admin if not exists (securely)
        const [users] = await conn.query('SELECT * FROM users WHERE role = "admin"');
        if (users.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await conn.query('INSERT INTO users (id, name, email, password_hash, role, join_date) VALUES (?, ?, ?, ?, ?, NOW())',
                ['admin-init', 'System Admin', 'admin@leadingedge.com', hashedPassword, 'admin']);
            console.log("✅ Default admin account created: admin@leadingedge.com / admin123");
        }

        console.log("✅ Database tables checked/initialized.");
        conn.release();

        // Trigger sync in background
        syncMediaLibrary();
    } catch (e) {
        console.error("❌ Database Initialization Failed:", e);
    }
}

// Initialize DB on startup
initDB();

// --- HELPERS ---

async function logAction(connection, adminEmail, actionType, targetId, details, changes = null) {
    try {
        const query = 'INSERT INTO audit_logs (admin_email, action_type, target_id, details, changes) VALUES (?, ?, ?, ?, ?)';
        await connection.query(query, [adminEmail || 'system', actionType, targetId, JSON.stringify(details), changes ? JSON.stringify(changes) : null]);
    } catch (e) {
        // console.error("Failed to write audit log (Table might not exist yet):", e.message);
    }
}

function getDiff(oldObj, newObj, ignoredKeys = []) {
    const diff = {};
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    ignoredKeys.push('created_at', 'updated_at', 'extra_data');

    keys.forEach(key => {
        if (ignoredKeys.includes(key)) return;
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            diff[key] = { from: oldObj[key], to: newObj[key] };
        }
    });
    return diff;
}

async function checkExists(table, column, value, excludeId = null) {
    let query = `SELECT id FROM ${table} WHERE ${column} = ?`;
    const params = [value];
    if (excludeId) {
        query += ` AND id != ?`;
        params.push(excludeId);
    }
    const [rows] = await pool.query(query, params);
    return rows.length > 0;
}

// Sync function to ensure all files on disk are in the database (Background)
async function syncMediaLibrary() {
    const directories = ['uploads/products', 'uploads/projects', 'uploads/gallery'];

    for (const dir of directories) {
        const fullPath = path.join(__dirname, dir);
        if (await fs.pathExists(fullPath)) {
            try {
                const files = await fs.readdir(fullPath);
                for (const file of files) {
                    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file)) continue;

                    const filePath = `${dir}/${file}`;
                    // Check if exists in DB
                    try {
                        const [rows] = await pool.query('SELECT id FROM media_library WHERE file_path = ?', [filePath]);
                        if (rows.length === 0) {
                            const stats = await fs.stat(path.join(fullPath, file));
                            const mimeType = 'image/' + path.extname(file).substring(1).toLowerCase();
                            await pool.query(
                                'INSERT INTO media_library (file_name, file_path, folder, file_size, mime_type) VALUES (?, ?, ?, ?, ?)',
                                [file, filePath, dir.replace('uploads/', ''), stats.size, mimeType]
                            );
                        }
                    } catch (e) { /* ignore db errors during sync */ }
                }
            } catch (e) { /* ignore fs errors */ }
        }
    }
    console.log("Media Library Synced");
}

// ─────────────────────────────────────────────────────
//  SECURITY: Multer — hardened file upload config
//  - Only allows image MIME types (jpg, png, gif, webp)
//  - 10 MB file size limit
//  - Sanitizes filename to prevent path traversal
// ─────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type '${file.mimetype}' not allowed. Only images are accepted.`));
        }
    },
});

// --- ROUTES ---

// --- GLOBAL SEARCH (Protected) ---
app.get('/api/admin/search', authenticateToken, async (req, res) => {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);
    const searchTerm = `%${q}%`;

    try {
        const [products] = await pool.query('SELECT id, name as title, "product" as type, model_number as subtitle FROM products WHERE name LIKE ? OR model_number LIKE ? LIMIT 5', [searchTerm, searchTerm]);
        const [orders] = await pool.query('SELECT id, customer_name as title, "order" as type, CONCAT("Total: ", total) as subtitle FROM orders WHERE id LIKE ? OR customer_name LIKE ? LIMIT 5', [searchTerm, searchTerm]);
        const [users] = await pool.query('SELECT id, name as title, "user" as type, email as subtitle FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 5', [searchTerm, searchTerm]);

        let pages = [];
        try {
            [pages] = await pool.query('SELECT id, title, "page" as type, slug as subtitle FROM custom_pages WHERE title LIKE ? LIMIT 3', [searchTerm]);
        } catch (e) { }

        res.json([...products, ...orders, ...users, ...pages]);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- IMAGE GALLERY ENDPOINTS (Protected) ---

// Get all images
app.get('/api/admin/images', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM media_library ORDER BY upload_date DESC');

        const serverUrl = process.env.CDN_URL || `${req.protocol}://${req.get('host')}`;
        const images = rows.map(row => ({
            id: row.id,
            name: row.file_name,
            url: `${serverUrl}/${row.file_path}`,
            folder: row.folder,
            size: row.file_size,
            date: row.upload_date
        }));

        res.json(images);
    } catch (e) {
        console.error("Gallery Error:", e);
        // Fallback: If DB fails, try to list files from folders directly so the UI doesn't crash
        try {
            const directories = ['uploads/products', 'uploads/projects', 'uploads/gallery'];
            let allFiles = [];
            for (const dir of directories) {
                const fullPath = path.join(__dirname, dir);
                if (await fs.pathExists(fullPath)) {
                    const files = await fs.readdir(fullPath);
                    allFiles = [...allFiles, ...files.map(f => ({
                        id: Math.random(),
                        name: f,
                        url: `${req.protocol}://${req.get('host')}/${dir}/${f}`,
                        folder: dir,
                        size: 0,
                        date: new Date()
                    }))];
                }
            }
            res.json(allFiles);
        } catch (err) {
            res.status(500).json({ message: "Database and FS fallback failed: " + e.message });
        }
    }
});

// Check where an image is used
app.get('/api/admin/image-usage', authenticateToken, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.json([]);

    const filename = path.basename(url);
    const searchTerm = `%${filename}%`;
    const references = [];

    try {
        const [products] = await pool.query('SELECT id, name FROM products WHERE image LIKE ? OR images LIKE ?', [searchTerm, searchTerm]);
        products.forEach(p => references.push({ type: 'Product', id: p.id, name: p.name }));

        try {
            const [projects] = await pool.query('SELECT id, title FROM projects WHERE cover_image LIKE ? OR images LIKE ?', [searchTerm, searchTerm]);
            projects.forEach(p => references.push({ type: 'Project', id: p.id, name: p.title }));
        } catch (e) { }

        try {
            const [cats] = await pool.query('SELECT id, name FROM categories WHERE image LIKE ?', [searchTerm]);
            cats.forEach(c => references.push({ type: 'Category', id: c.id, name: c.name }));
        } catch (e) { }

        res.json(references);
    } catch (e) {
        res.json([]);
    }
});

// --- IMAGE UPLOAD ENDPOINT (Protected) ---
app.post('/api/upload', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const { context, name } = req.body;

        let targetDir = 'uploads/gallery';
        let cleanName = '';

        if (context === 'product') {
            targetDir = 'uploads/products';
            cleanName = slugify(name || 'product', { lower: true, strict: true });
        } else if (context === 'project') {
            targetDir = 'uploads/projects';
            cleanName = slugify(name || 'project', { lower: true, strict: true });
        } else {
            const originalName = path.parse(req.file.originalname).name;
            cleanName = slugify(originalName, { lower: true, strict: true });
        }

        const thumbDir = 'uploads/thumbnails';

        // Ensure dirs exist (redundant safety)
        await fs.ensureDir(path.join(__dirname, targetDir));
        await fs.ensureDir(path.join(__dirname, thumbDir));

        const existingFiles = await fs.readdir(path.join(__dirname, targetDir));
        let finalFilename = `${cleanName}${path.extname(req.file.originalname)}`;
        let counter = 1;
        while (existingFiles.includes(finalFilename)) {
            finalFilename = `${cleanName}_${counter}${path.extname(req.file.originalname)}`;
            counter++;
        }

        const finalPath = path.join(__dirname, targetDir, finalFilename);
        const relativePath = `${targetDir}/${finalFilename}`;
        const thumbPath = path.join(__dirname, thumbDir, finalFilename);

        // Process Image
        await fs.move(req.file.path, finalPath);

        // Try Thumbnail (continue on error)
        try {
            await sharp(finalPath).resize(200).toFile(thumbPath);
        } catch (err) { console.error("Thumbnail error:", err.message); }

        // Store in Database
        try {
            const stats = await fs.stat(finalPath);
            await pool.query(
                'INSERT INTO media_library (file_name, file_path, folder, file_size, mime_type) VALUES (?, ?, ?, ?, ?)',
                [finalFilename, relativePath, targetDir.replace('uploads/', ''), stats.size, req.file.mimetype]
            );
        } catch (dbErr) {
            console.error("DB Insert failed for image (ignoring)", dbErr.message);
        }

        const serverUrl = process.env.CDN_URL || `${req.protocol}://${req.get('host')}`;

        res.json({
            url: `${serverUrl}/${relativePath}`,
            thumbnailUrl: `${serverUrl}/${thumbDir}/${finalFilename}`
        });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// --- AUDIT LOGS (Protected) ---
app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50');
        const logs = rows.map(row => ({
            ...row,
            details: row.details ? JSON.parse(row.details) : {},
            changes: row.changes ? JSON.parse(row.changes) : null
        }));
        res.json(logs);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- DASHBOARD STATS (Protected) ---
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const stats = {
            totalOrdersMonth: 0,
            totalVisitsMonth: 3420,
            revenueMonth: 0,
            trendingProducts: [],
            recentActivity: []
        };

        try {
            const [monthData] = await pool.query(`
                SELECT COUNT(*) as count, SUM(total) as revenue 
                FROM orders 
                WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
            `);
            stats.totalOrdersMonth = monthData[0].count || 0;
            stats.revenueMonth = monthData[0].revenue || 0;
        } catch (e) { }

        try {
            const [trending] = await pool.query(`
                SELECT p.id, p.name, SUM(oi.quantity) as sales 
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY oi.product_id
                ORDER BY sales DESC
                LIMIT 5
            `);
            stats.trendingProducts = trending.map(t => ({ productId: t.id || 'N/A', name: t.name || 'Unknown Product', sales: Number(t.sales) }));
        } catch (e) { }

        try {
            const [recentLogs] = await pool.query(`
                SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10
            `);
            stats.recentActivity = recentLogs.map(l => {
                const admin = l.admin_email.split('@')[0];
                const action = l.action_type.replace(/_/g, ' ').toLowerCase();
                return `${admin} ${action} (ID: ${l.target_id})`;
            });
        } catch (e) { }

        res.json(stats);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Public: Get Products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        for (let product of rows) {
            const [cats] = await pool.query('SELECT category_name FROM product_categories WHERE product_id = ?', [product.id]);
            product.categories = cats.map(c => c.category_name);
            const [imgs] = await pool.query('SELECT image_url FROM product_images WHERE product_id = ?', [product.id]);
            product.images = imgs.map(i => i.image_url);
            const [related] = await pool.query('SELECT related_product_id FROM related_products WHERE product_id = ?', [product.id]);
            product.relatedProducts = related.map(r => r.related_product_id);
            if (product.extra_data) {
                try { Object.assign(product, JSON.parse(product.extra_data)); } catch (e) { }
            }
            product.variations = product.variations || [];
            product.specifications = product.specifications || [];
            product.customTabs = product.customTabs || [];
            product.onSale = Boolean(product.on_sale);
            product.isVisible = Boolean(product.is_visible);
            product.salePrice = product.sale_price;
            product.shortDescription = product.short_description;
            product.modelNumber = product.model_number;
        }
        res.json(rows);
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// Admin: Create Product
app.post('/api/products', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const p = req.body;
        const adminEmail = req.user.email;
        if (await checkExists('products', 'id', p.id)) throw new Error(`Product ID ${p.id} already exists.`);
        const extraData = JSON.stringify({ variations: p.variations || [], specifications: p.specifications || [], customTabs: p.customTabs || [], features: p.features || [], weight: p.weight || 0, specificShippingCharges: p.specificShippingCharges || [], rating: p.rating || 5 });
        await conn.query('INSERT INTO products (id, name, price, sale_price, on_sale, description, short_description, model_number, image, is_visible, extra_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [p.id, p.name, p.price, p.salePrice, p.onSale, p.description, p.shortDescription, p.modelNumber, p.image, p.isVisible, extraData]);
        if (p.categories) for (const cat of p.categories) await conn.query('INSERT INTO product_categories VALUES (?, ?)', [p.id, cat]);
        if (p.images) for (const img of p.images) if (img) await conn.query('INSERT INTO product_images (product_id, image_url) VALUES (?, ?)', [p.id, img]);
        if (p.relatedProducts) for (const relId of p.relatedProducts) await conn.query('INSERT INTO related_products VALUES (?, ?)', [p.id, relId]);

        await logAction(conn, adminEmail, 'CREATE_PRODUCT', p.id, { name: p.name }, { action: 'Created new product' });
        await conn.commit();
        res.status(201).json({ message: 'Product created' });
    } catch (error) { await conn.rollback(); res.status(500).json({ message: error.message }); } finally { conn.release(); }
});

// Admin: Update Product
app.put('/api/products/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const p = req.body;
        const id = req.params.id;
        const adminEmail = req.user.email;

        const [oldRows] = await conn.query('SELECT * FROM products WHERE id = ?', [id]);
        const oldData = oldRows[0];

        const extraData = JSON.stringify({ variations: p.variations || [], specifications: p.specifications || [], customTabs: p.customTabs || [], features: p.features || [], weight: p.weight || 0, specificShippingCharges: p.specificShippingCharges || [], rating: p.rating || 5 });
        await conn.query('UPDATE products SET name=?, price=?, sale_price=?, on_sale=?, description=?, short_description=?, model_number=?, image=?, is_visible=?, extra_data=? WHERE id=?', [p.name, p.price, p.salePrice, p.onSale, p.description, p.shortDescription, p.modelNumber, p.image, p.isVisible, extraData, id]);

        await conn.query('DELETE FROM product_categories WHERE product_id = ?', [id]);
        if (p.categories) for (const cat of p.categories) await conn.query('INSERT INTO product_categories VALUES (?, ?)', [id, cat]);
        await conn.query('DELETE FROM product_images WHERE product_id = ?', [id]);
        if (p.images) for (const img of p.images) if (img) await conn.query('INSERT INTO product_images (product_id, image_url) VALUES (?, ?)', [id, img]);
        await conn.query('DELETE FROM related_products WHERE product_id = ?', [id]);
        if (p.relatedProducts) for (const relId of p.relatedProducts) await conn.query('INSERT INTO related_products VALUES (?, ?)', [id, relId]);

        const changes = getDiff(oldData || {}, { ...p, extra_data: extraData });
        await logAction(conn, adminEmail, 'UPDATE_PRODUCT', id, { name: p.name }, changes);

        await conn.commit();
        res.json({ message: 'Product updated' });
    } catch (error) { await conn.rollback(); res.status(500).json({ message: error.message }); } finally { conn.release(); }
});

// Admin: Delete Product
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const adminEmail = req.user.email;
        await conn.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        await logAction(conn, adminEmail, 'DELETE_PRODUCT', req.params.id, {}, { action: 'Deleted product' });
        res.json({ message: 'Product deleted' });
    } catch (error) { res.status(500).json({ message: error.message }); } finally { conn.release(); }
});

// Admin: Get Users
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, email, role, phone, address, join_date, group_id FROM users');
        res.json(rows.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role, phone: r.phone, address: r.address, joinDate: r.join_date, groupId: r.group_id })));
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Admin: Create User
app.post('/api/users', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const u = req.body;
        const adminEmail = req.user.email;
        if (await checkExists('users', 'email', u.email)) return res.status(409).json({ message: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(u.password || '123456', 10);

        await conn.query('INSERT INTO users (id, name, email, password_hash, role, phone, address, group_id, join_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', [u.id, u.name, u.email, hashedPassword, u.role, u.phone, u.address, u.groupId || null]);
        await logAction(conn, adminEmail, 'CREATE_USER', u.id, { email: u.email }, { role: { from: null, to: u.role } });
        res.status(201).json({ message: 'User created' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// Admin: Update User
app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const u = req.body;
        const adminEmail = req.user.email;
        const [oldRows] = await conn.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        const oldData = oldRows[0];
        if (await checkExists('users', 'email', u.email, req.params.id)) return res.status(409).json({ message: 'Email taken' });

        let query, params;
        if (u.password) {
            const hashedPassword = await bcrypt.hash(u.password, 10);
            query = 'UPDATE users SET name=?, email=?, password_hash=?, role=?, phone=?, address=?, group_id=? WHERE id=?';
            params = [u.name, u.email, hashedPassword, u.role, u.phone, u.address, u.groupId || null, req.params.id];
        } else {
            query = 'UPDATE users SET name=?, email=?, role=?, phone=?, address=?, group_id=? WHERE id=?';
            params = [u.name, u.email, u.role, u.phone, u.address, u.groupId || null, req.params.id];
        }
        await conn.query(query, params);
        const changes = getDiff(oldData, u, ['password_hash']);
        await logAction(conn, adminEmail, 'UPDATE_USER', req.params.id, { email: u.email }, changes);
        res.json({ message: 'User updated' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// --- USER GROUPS ---
app.get('/api/user-groups', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM user_groups ORDER BY name');
        const groups = rows.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []),
            createdAt: r.created_at
        }));
        // Attach user count per group
        for (const group of groups) {
            const [countRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE group_id = ?', [group.id]);
            group.userCount = countRows[0].count;
        }
        res.json(groups);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/user-groups', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const g = req.body;
        const adminEmail = req.user.email;
        const id = g.id || `group-${Date.now()}`;
        await conn.query(
            'INSERT INTO user_groups (id, name, description, permissions) VALUES (?, ?, ?, ?)',
            [id, g.name, g.description || '', JSON.stringify(g.permissions || [])]
        );
        await logAction(conn, adminEmail, 'CREATE_USER_GROUP', id, { name: g.name }, { action: 'Created user group' });
        res.status(201).json({ message: 'Group created', id });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

app.put('/api/user-groups/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const g = req.body;
        const adminEmail = req.user.email;
        await conn.query(
            'UPDATE user_groups SET name=?, description=?, permissions=? WHERE id=?',
            [g.name, g.description || '', JSON.stringify(g.permissions || []), req.params.id]
        );
        await logAction(conn, adminEmail, 'UPDATE_USER_GROUP', req.params.id, { name: g.name }, { action: 'Updated user group' });
        res.json({ message: 'Group updated' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

app.delete('/api/user-groups/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const adminEmail = req.user.email;
        // Remove group assignment from users in this group
        await conn.query('UPDATE users SET group_id = NULL WHERE group_id = ?', [req.params.id]);
        await conn.query('DELETE FROM user_groups WHERE id = ?', [req.params.id]);
        await logAction(conn, adminEmail, 'DELETE_USER_GROUP', req.params.id, {}, { action: 'Deleted user group' });
        res.json({ message: 'Group deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// --- CATEGORIES ---
// Public: Get Categories
app.get('/api/categories', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM categories ORDER BY sort_order, name');
        res.json(rows.map(r => ({
            id: r.id, name: r.name, slug: r.slug, image: r.image,
            parentId: r.parent_id, isFeatured: Boolean(r.is_featured), sortOrder: r.sort_order
        })));
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Admin: Create Category
app.post('/api/categories', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const c = req.body;
        const adminEmail = req.user.email;
        const id = c.id || `cat-${Date.now()}`;
        const slug = c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await conn.query(
            'INSERT INTO categories (id, name, slug, image, parent_id, is_featured, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, c.name, slug, c.image || null, c.parentId || null, c.isFeatured || false, c.sortOrder || 0]
        );
        await logAction(conn, adminEmail, 'CREATE_CATEGORY', id, { name: c.name }, { action: 'Created category' });
        res.status(201).json({ message: 'Category created', id });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// Admin: Update Category
app.put('/api/categories/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const c = req.body;
        const adminEmail = req.user.email;
        const slug = c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await conn.query(
            'UPDATE categories SET name=?, slug=?, image=?, parent_id=?, is_featured=?, sort_order=? WHERE id=?',
            [c.name, slug, c.image || null, c.parentId || null, c.isFeatured || false, c.sortOrder || 0, req.params.id]
        );
        await logAction(conn, adminEmail, 'UPDATE_CATEGORY', req.params.id, { name: c.name }, { action: 'Updated category' });
        res.json({ message: 'Category updated' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// Admin: Delete Category
app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const adminEmail = req.user.email;
        await conn.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
        await logAction(conn, adminEmail, 'DELETE_CATEGORY', req.params.id, {}, { action: 'Deleted category' });
        res.json({ message: 'Category deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// --- CONFIG ---
app.get('/api/config', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM site_config WHERE id = "default"');
        if (rows.length > 0) { res.json(JSON.parse(rows[0].config_data || '{}')); }
        else { res.json({}); }
    } catch (e) { res.json({}); }
});

app.post('/api/config', authenticateToken, async (req, res) => {
    try {
        const config = req.body;
        const [existing] = await pool.query('SELECT id FROM site_config WHERE id = "default"');
        if (existing.length > 0) {
            await pool.query('UPDATE site_config SET config_data = ? WHERE id = "default"', [JSON.stringify(config)]);
        } else {
            await pool.query('INSERT INTO site_config (id, config_data) VALUES ("default", ?)', [JSON.stringify(config)]);
        }
        res.json({ message: 'Config updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- PAGES ---
app.get('/api/pages', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM custom_pages ORDER BY title');
        res.json(rows.map(r => ({
            id: r.id, slug: r.slug, title: r.title,
            content: r.content_json ? JSON.parse(r.content_json) : []
        })));
    } catch (e) { res.json([]); }
});

app.post('/api/pages', authenticateToken, async (req, res) => {
    try {
        const p = req.body;
        const id = p.id || `page-${Date.now()}`;
        await pool.query('INSERT INTO custom_pages (id, slug, title, content_json) VALUES (?, ?, ?, ?)',
            [id, p.slug, p.title, JSON.stringify(p.content || [])]);
        res.status(201).json({ message: 'Page created', id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/pages/:id', authenticateToken, async (req, res) => {
    try {
        const p = req.body;
        await pool.query('UPDATE custom_pages SET slug=?, title=?, content_json=? WHERE id=?',
            [p.slug, p.title, JSON.stringify(p.content || []), req.params.id]);
        res.json({ message: 'Page updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/pages/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM custom_pages WHERE id=?', [req.params.id]);
        res.json({ message: 'Page deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ORDERS ---
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        for (const order of rows) {
            const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
            order.items = items;
            order.paymentStatus = order.payment_status;
            order.shippingAddress = order.shipping_address;
            order.customerName = order.customer_name;
            order.customerEmail = order.customer_email;
            order.customerPhone = order.customer_phone;
            order.shippingCost = order.shipping_cost;
        }
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/orders', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const o = req.body;
        const id = o.id || `order-${Date.now()}`;
        await conn.query(
            'INSERT INTO orders (id, user_id, customer_name, customer_email, customer_phone, shipping_address, subtotal, shipping_cost, tax, total, status, payment_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, o.userId || null, o.customerName, o.customerEmail, o.customerPhone || '', JSON.stringify(o.shippingAddress || ''), o.subtotal, o.shippingCost || 0, o.tax || 0, o.total, o.status || 'Pending', o.paymentStatus || 'Unpaid']
        );
        if (o.items) {
            for (const item of o.items) {
                await conn.query('INSERT INTO order_items (order_id, product_id, product_name, quantity, price, image, selected_variation) VALUES (?,?,?,?,?,?,?)',
                    [id, item.productId, item.productName || item.name, item.quantity, item.price, item.image || '', JSON.stringify(item.selectedVariation || null)]);
            }
        }
        await conn.commit();
        res.status(201).json({ message: 'Order created', id });
    } catch (e) { await conn.rollback(); res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const o = req.body;
        const adminEmail = req.user.email;
        await conn.query('UPDATE orders SET status=?, payment_status=? WHERE id=?', [o.status, o.paymentStatus || o.payment_status, req.params.id]);
        await logAction(conn, adminEmail, 'UPDATE_ORDER', req.params.id, { status: o.status }, { action: 'Updated order status' });
        res.json({ message: 'Order updated' });
    } catch (e) { res.status(500).json({ message: e.message }); } finally { conn.release(); }
});

// --- SHIPPING ---
app.get('/api/shipping/areas', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM shipping_areas');
        res.json(rows);
    } catch (e) { res.json([]); }
});

app.post('/api/shipping/areas', authenticateToken, async (req, res) => {
    try {
        const areas = req.body;
        await pool.query('DELETE FROM shipping_areas');
        for (const a of areas) {
            await pool.query('INSERT INTO shipping_areas (id, name) VALUES (?, ?)', [a.id || `area-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, a.name]);
        }
        res.json({ message: 'Shipping areas updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/shipping/methods', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM shipping_methods');
        res.json(rows.map(r => ({
            id: r.id, name: r.name, type: r.type, flatRate: r.flat_rate,
            isGlobal: Boolean(r.is_global),
            areaIds: r.area_ids ? JSON.parse(r.area_ids) : [],
            weightRates: r.weight_rates ? JSON.parse(r.weight_rates) : []
        })));
    } catch (e) { res.json([]); }
});

app.post('/api/shipping/methods', authenticateToken, async (req, res) => {
    try {
        const methods = req.body;
        await pool.query('DELETE FROM shipping_methods');
        for (const m of methods) {
            await pool.query('INSERT INTO shipping_methods (id, name, type, flat_rate, is_global, area_ids, weight_rates) VALUES (?,?,?,?,?,?,?)',
                [m.id || `ship-${Date.now()}`, m.name, m.type, m.flatRate || 0, m.isGlobal || true, JSON.stringify(m.areaIds || []), JSON.stringify(m.weightRates || [])]);
        }
        res.json({ message: 'Shipping methods updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- NEWSLETTERS ---
app.get('/api/newsletters', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM newsletter_campaigns ORDER BY sent_date DESC');
        res.json(rows);
    } catch (e) { res.json([]); }
});

app.post('/api/newsletters', authenticateToken, async (req, res) => {
    try {
        const n = req.body;
        const id = n.id || `news-${Date.now()}`;
        await pool.query('INSERT INTO newsletter_campaigns (id, subject, content, sent_date, recipient_count, status) VALUES (?,?,?,?,?,?)',
            [id, n.subject, JSON.stringify(n.content || ''), n.sentDate || new Date().toISOString().split('T')[0], n.recipientCount || 0, n.status || 'Draft']);
        res.status(201).json({ message: 'Newsletter created', id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});
// SECURITY: Auth rate limiter applied — max 10 login attempts per minute per IP
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    // SECURITY: Basic input validation
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        if (rows.length > 0) {
            const user = rows[0];
            const match = await bcrypt.compare(password, user.password_hash);

            // Fallback for non-hashed legacy passwords (auto-migrate on success)
            const legacyMatch = !match && (user.password_hash === password);

            if (match || legacyMatch) {
                // If legacy match, re-hash and save immediately
                if (legacyMatch) {
                    const hashed = await bcrypt.hash(password, 12);
                    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, user.id]);
                }

                // SECURITY: JWT expiry reduced to 2h (was 8h)
                const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
                res.json({
                    token,
                    user: { id: user.id, name: user.name, email: user.email, role: user.role, joinDate: user.join_date }
                });
                return;
            }
        }
        // SECURITY: Generic error — don't reveal whether email exists
        res.status(401).json({ message: 'Invalid credentials' });
    } catch (e) { res.status(500).json({ message: 'Login failed' }); }
});

// Admin: Projects (Protected)
app.get('/api/projects', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM projects');
        res.json(rows.map(r => ({ id: r.id, title: r.title, description: r.description, coverImage: r.cover_image, client: r.client, date: r.completion_date, images: JSON.parse(r.images || '[]') })));
    } catch (e) { res.json([]); }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
    const p = req.body;
    try {
        const exists = await checkExists('projects', 'id', p.id);
        if (exists) {
            await pool.query('UPDATE projects SET title=?, description=?, cover_image=?, client=?, completion_date=?, images=? WHERE id=?', [p.title, p.description, p.coverImage, p.client, p.date, JSON.stringify(p.images), p.id]);
            res.json({ message: 'Updated (fallback)' });
        } else {
            await pool.query('INSERT INTO projects (id, title, description, cover_image, client, completion_date, images) VALUES (?,?,?,?,?,?,?)', [p.id, p.title, p.description, p.coverImage, p.client, p.date, JSON.stringify(p.images)]);
            res.status(201).json({ message: 'Created' });
        }
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/projects/:id', authenticateToken, async (req, res) => {
    const p = req.body;
    try {
        await pool.query('UPDATE projects SET title=?, description=?, cover_image=?, client=?, completion_date=?, images=? WHERE id=?', [p.title, p.description, p.coverImage, p.client, p.date, JSON.stringify(p.images), req.params.id]);
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM projects WHERE id=?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
