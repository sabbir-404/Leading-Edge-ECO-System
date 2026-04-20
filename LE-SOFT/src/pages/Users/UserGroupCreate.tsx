import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Shield, CheckSquare, Square } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

// ── Permissions Structure matching the Implementation Plan ──
const PERMISSION_GROUPS = [
    {
        category: 'Masters',
        desc: 'Core Accounting & Inventory entities',
        perms: [
            { key: 'read_group', label: 'Read Ledger Groups' }, { key: 'write_group', label: 'Write Ledger Groups' },
            { key: 'read_ledger', label: 'Read Ledgers' }, { key: 'write_ledger', label: 'Write Ledgers' },
            { key: 'read_voucher_type', label: 'Read Voucher Types' }, { key: 'write_voucher_type', label: 'Write Voucher Types' },
            { key: 'read_currencies', label: 'Read Currencies' }, { key: 'write_currencies', label: 'Write Currencies' },
            { key: 'read_stock_group', label: 'Read Stock Groups' }, { key: 'write_stock_group', label: 'Write Stock Groups' },
            { key: 'read_stock_items', label: 'Read Stock Items' }, { key: 'write_stock_items', label: 'Write Stock Items' },
            { key: 'read_units', label: 'Read Units' }, { key: 'write_units', label: 'Write Units' },
            { key: 'read_products', label: 'Read Products' }, { key: 'write_products', label: 'Write Products' },
            { key: 'delete_products', label: 'Delete Products' },
            { key: 'read_godowns', label: 'Read Godowns' }, { key: 'write_godowns', label: 'Write Godowns' },
        ]
    },
    {
        category: 'Billing',
        desc: 'Point of Sale, Billing, and Exchanges',
        perms: [
            { key: 'read_bill', label: 'Read Bills' },
            { key: 'write_bill', label: 'Create Bills' },
            { key: 'alter_bill', label: 'Alter/Edit Bills' },
            { key: 'add_bill_items', label: 'Add Products to Existing Bills' },
            { key: 'see_all_bills', label: "View all users' bills (not just own)" },
            { key: 'adjust_bill_price', label: 'Apply price adjustment on a bill' },
            { key: 'delete_bill', label: 'Delete Bills' },
            { key: 'initiate_exchange', label: 'Initiate Exchanges' },
            { key: 'approve_bill', label: 'Approve Pending Bills' }
        ]
    },
    {
        category: 'Accounts',
        desc: 'Accounting Vouchers & Financial Statements',
        perms: [
            { key: 'read_accounts', label: 'View Accounting Vouchers & Reports' },
            { key: 'write_accounts', label: 'Create Accounting Vouchers' }
        ]
    },
    {
        category: 'CRM',
        desc: 'Customer Relationship, Quotations & Ledgers',
        perms: [
            { key: 'read_customer', label: 'Read Customers' },
            { key: 'write_customer', label: 'Write Customers' },
            { key: 'delete_customer', label: 'Delete Customers' },
            { key: 'read_quotation', label: 'Read Quotations' },
            { key: 'write_quotation', label: 'Create Quotations' },
            { key: 'see_all_customers', label: 'View all customers (not just own)' },
            { key: 'view_customer_contact', label: 'View customer phone & email' },
            { key: 'view_customer_financials', label: 'View customer balances & payment history' },
            { key: 'view_customer_ledger', label: 'View Customer Ledgers & Balances' }
        ]
    },
    {
        category: 'MAKE',
        desc: 'Manufacturing & Production Orders',
        perms: [
            { key: 'read_make', label: 'Read Manufacturing Orders' },
            { key: 'write_make', label: 'Create Manufacturing Orders' },
            { key: 'alter_make', label: 'Alter Manufacturing Orders' }
        ]
    },
    {
        category: 'HRM',
        desc: 'Human Resource Management',
        perms: [
            { key: 'read_hrm', label: 'Read Employee Database' },
            { key: 'write_hrm', label: 'Edit Employee Database' },
            { key: 'approve_leave', label: 'Approve Leave Requests' },
            { key: 'view_payroll', label: 'View & Process Payroll' }
        ]
    },
    {
        category: 'Settings & Security',
        desc: 'System Configuration and User Management',
        perms: [
            { key: 'manage_users', label: 'Manage User Accounts' },
            { key: 'manage_groups', label: 'Manage Permission Groups' },
            { key: 'manage_sessions', label: 'View Active Sessions' },
            { key: 'manage_permissions', label: 'Manage Permission Levels' },
            { key: 'manage_settings', label: 'Manage Application Settings' }
        ]
    },
    {
        category: 'Reports',
        desc: 'Analytics, Summaries, and Data Exports',
        perms: [
            { key: 'read_sales_report', label: 'Read Sales Reports' },
            { key: 'read_inventory_report', label: 'Read Inventory Reports' },
            { key: 'read_financial_report', label: 'Read Financial Reports' },
            { key: 'read_product_history', label: 'Read Product History' }
        ]
    },
    {
        category: 'Communications',
        desc: 'Internal Email and Messaging',
        perms: [
            { key: 'read_email', label: 'Access Internal Emails' },
            { key: 'write_email', label: 'Send Internal Emails' }
        ]
    },
    {
        category: 'Logistics',
        desc: 'Shipping and Delivery Management',
        perms: [
            { key: 'manage_shipping', label: 'Manage Shipping & Deliveries' }
        ]
    }
];

const UserGroupCreate: React.FC = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [permissions, setPermissions] = useState<Record<string, boolean>>({});
    const [error, setError] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<string[]>(['Billing', 'Settings & Security']);

    const togglePerm = (key: string) => {
        setPermissions(p => ({ ...p, [key]: !p[key] }));
    };

    const toggleCategory = (category: string) => {
        if (expandedCategories.includes(category)) {
            setExpandedCategories(expandedCategories.filter(c => c !== category));
        } else {
            setExpandedCategories([...expandedCategories, category]);
        }
    };

    const selectAllInCategory = (category: string, value: boolean) => {
        const group = PERMISSION_GROUPS.find(g => g.category === category);
        if (!group) return;
        const newPerms = { ...permissions };
        group.perms.forEach(p => newPerms[p.key] = value);
        setPermissions(newPerms);
    };

    const selectAllGlobal = () => {
        const all: Record<string, boolean> = {};
        PERMISSION_GROUPS.forEach(g => {
            g.perms.forEach(p => all[p.key] = true);
        });
        setPermissions(all);
    };

    const clearAllGlobal = () => {
        setPermissions({});
    };

    const isCategoryAllSelected = (category: string) => {
        const group = PERMISSION_GROUPS.find(g => g.category === category);
        if (!group) return false;
        return group.perms.every(p => permissions[p.key]);
    };

    const isCategoryPartiallySelected = (category: string) => {
        const group = PERMISSION_GROUPS.find(g => g.category === category);
        if (!group) return false;
        const selectedCount = group.perms.filter(p => permissions[p.key]).length;
        return selectedCount > 0 && selectedCount < group.perms.length;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Group name is required'); return; }
        try {
            // @ts-ignore
            await window.electron.createUserGroup({ name, description, permissions });
            navigate('/users/groups');
        } catch (err: any) {
            setError(err.message || 'Failed to create group');
        }
    };

    return (
        <DashboardLayout title="Create User Group">
            <div className="masters-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', padding: '10px', borderRadius: '10px' }}><Shield size={24} /></div>
                    <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>
                        Create User Group
                    </motion.h1>
                </div>

                {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', fontWeight: 500 }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '2rem', background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>Group Name *</label>
                            <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Sales Team, Cashier" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>Description</label>
                            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this group does..." style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem' }}>Permission Matrix</h3>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Check the specific modules and actions this group can access.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" onClick={clearAllGlobal} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Clear All</button>
                            <button type="button" onClick={selectAllGlobal} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Select All Global</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '3rem' }}>
                        {PERMISSION_GROUPS.map(group => {
                            const isExpanded = expandedCategories.includes(group.category);
                            const allSelected = isCategoryAllSelected(group.category);
                            const partialSelected = isCategoryPartiallySelected(group.category);

                            return (
                                <motion.div key={group.category} layout style={{ border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)', overflow: 'hidden' }}>
                                    {/* Accordion Header */}
                                    <div 
                                        style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer', background: isExpanded ? 'var(--hover-bg)' : 'transparent', transition: 'background 0.2s' }}
                                        onClick={() => toggleCategory(group.category)}
                                    >
                                        <div style={{ marginRight: '1rem', color: 'var(--text-secondary)' }}>
                                            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{group.category}</h4>
                                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{group.desc}</p>
                                        </div>
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); selectAllInCategory(group.category, !allSelected); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: allSelected ? 'rgba(34, 197, 94, 0.1)' : 'var(--input-bg)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: `1px solid ${allSelected ? '#22c55e' : 'var(--border-color)'}`, color: allSelected ? '#22c55e' : 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600, fontSize: '0.8rem' }}
                                        >
                                            {allSelected ? <CheckSquare size={16} /> : partialSelected ? <div style={{width: 12, height: 12, background: 'var(--accent-color)', borderRadius: 2}}/> : <Square size={16} opacity={0.5} />}
                                            {allSelected ? 'All Selected' : 'Select All'}
                                        </div>
                                    </div>

                                    {/* Accordion Body */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }} 
                                                animate={{ height: 'auto', opacity: 1 }} 
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                style={{ borderTop: '1px solid var(--border-color)' }}
                                            >
                                                <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                                                    {group.perms.map(perm => (
                                                        <div 
                                                            key={perm.key} 
                                                            onClick={() => togglePerm(perm.key)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', background: permissions[perm.key] ? 'rgba(99, 102, 241, 0.05)' : 'var(--input-bg)', border: `1px solid ${permissions[perm.key] ? 'var(--accent-color)' : 'var(--border-color)'}`, transition: 'all 0.15s' }}
                                                        >
                                                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${permissions[perm.key] ? 'var(--accent-color)' : 'var(--text-secondary)'}`, background: permissions[perm.key] ? 'var(--accent-color)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                {permissions[perm.key] && <div style={{ width: 10, height: 10, background: 'white', clipPath: 'polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%)' }} />}
                                                            </div>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: permissions[perm.key] ? 600 : 500, color: permissions[perm.key] ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                                {perm.label}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Fixed Bottom Save Bar */}
                    <div style={{ position: 'sticky', bottom: '1rem', zIndex: 10, background: 'var(--bg-color)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button type="button" onClick={() => navigate('/users/groups')} style={{ padding: '0.75rem 2rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>Cancel</button>
                        <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ padding: '0.75rem 2.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
                            Save User Group
                        </motion.button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
};

export default UserGroupCreate;
