"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDB = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'le_soft.db');
const db = new sqlite3_1.default.Database(dbPath);
const initDB = () => {
    db.serialize(() => {
        // Companies Table
        db.run(`CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mailing_name TEXT,
            address TEXT,
            country TEXT,
            state TEXT,
            phone TEXT,
            email TEXT,
            financial_year_from TEXT,
            books_begin_from TEXT,
            base_currency_symbol TEXT DEFAULT '৳',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // Groups Table
        db.run(`CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_group_id INTEGER,
            nature TEXT, -- Assets, Liabilities, Income, Expenses
            company_id INTEGER,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);
        // Ledgers Table
        db.run(`CREATE TABLE IF NOT EXISTS ledgers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            group_id INTEGER,
            opening_balance REAL DEFAULT 0,
            opening_balance_type TEXT CHECK(opening_balance_type IN ('Dr', 'Cr')),
            mailing_name TEXT,
            address TEXT,
            tax_reg_no TEXT,
            company_id INTEGER,
            FOREIGN KEY(group_id) REFERENCES groups(id),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);
        // Vouchers Table
        db.run(`CREATE TABLE IF NOT EXISTS vouchers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_type TEXT NOT NULL, -- Payment, Receipt, Journal, Contra, Sales, Purchase
            voucher_number TEXT NOT NULL,
            date TEXT NOT NULL,
            narration TEXT,
            total_amount REAL,
            company_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        )`);
        // Voucher Entries Table (Credits and Debits)
        db.run(`CREATE TABLE IF NOT EXISTS voucher_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER,
            ledger_id INTEGER,
            amount REAL NOT NULL,
            type TEXT CHECK(type IN ('Dr', 'Cr')),
            FOREIGN KEY(voucher_id) REFERENCES vouchers(id),
            FOREIGN KEY(ledger_id) REFERENCES ledgers(id)
        )`);
        // Seed Initial Groups (Simplified Tally List)
        db.get("SELECT count(*) as count FROM groups", (err, row) => {
            if (row.count === 0) {
                const groups = [
                    ['Capital Account', null, 'Liabilities'],
                    ['Current Assets', null, 'Assets'],
                    ['Current Liabilities', null, 'Liabilities'],
                    ['Fixed Assets', null, 'Assets'],
                    ['Direct Expenses', null, 'Expenses'],
                    ['Indirect Expenses', null, 'Expenses'],
                    ['Sales Accounts', null, 'Income'],
                    ['Purchase Accounts', null, 'Expenses'],
                    ['Cash-in-hand', 2, 'Assets'], // Under Current Assets
                    ['Bank Accounts', 2, 'Assets'], // Under Current Assets
                    ['Sundry Debtors', 2, 'Assets'], // Under Current Assets
                    ['Sundry Creditors', 3, 'Liabilities'], // Under Current Liabilities
                ];
                const stmt = db.prepare("INSERT INTO groups (name, parent_group_id, nature) VALUES (?, ?, ?)");
                groups.forEach(g => stmt.run(g));
                stmt.finalize();
            }
        });
    });
};
exports.initDB = initDB;
exports.default = db;
