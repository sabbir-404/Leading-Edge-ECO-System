import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Shield, Edit2, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const PERMISSION_KEYS = [
    // Masters
    'read_group', 'write_group', 'read_ledger', 'write_ledger', 'read_voucher_type', 'write_voucher_type',
    'read_currencies', 'write_currencies', 'read_stock_group', 'write_stock_group', 'read_stock_items', 'write_stock_items',
    'read_units', 'write_units', 'read_products', 'write_products', 'delete_products', 'read_godowns', 'write_godowns',
    // Billing
    'read_bill', 'write_bill', 'alter_bill', 'add_bill_items', 'see_all_bills', 'adjust_bill_price', 'delete_bill', 'initiate_exchange', 'approve_bill',
    // Accounts
    'read_accounts', 'write_accounts',
    // CRM
    'read_customer', 'write_customer', 'delete_customer', 'read_quotation', 'write_quotation', 'see_all_customers', 'view_customer_contact', 'view_customer_financials', 'view_customer_ledger',
    // MAKE
    'read_make', 'write_make', 'alter_make',
    // HRM
    'read_hrm', 'write_hrm', 'approve_leave', 'view_payroll',
    // Settings & Security
    'manage_users', 'manage_groups', 'manage_sessions', 'manage_permissions', 'manage_settings',
    // Reports
    'read_sales_report', 'read_inventory_report', 'read_financial_report', 'read_product_history',
    // Website
    'manage_website',
    // Communications & Logistics
    'read_email', 'write_email', 'manage_shipping'
];

const UserGroupList: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editPerms, setEditPerms] = useState<any>({});

    const fetchGroups = async () => {
        const requestingUserId = parseInt(localStorage.getItem('user_id') || '0');
        // @ts-ignore
        const data = await window.electron.getUserGroups({ requestingUserId });
        setGroups(data || []);
    };
    useEffect(() => { fetchGroups(); }, []);

    const userRole = localStorage.getItem('user_role') || '';
    const isSuperAdmin = userRole === 'superadmin';

    const filtered = groups.filter(g =>
        g.name?.toLowerCase().includes(search.toLowerCase()) &&
        (isSuperAdmin || g.name?.toLowerCase() !== 'superadmin')
    );

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this user group?')) return;
        // @ts-ignore
        await window.electron.deleteUserGroup(id);
        fetchGroups();
    };

    const startEdit = (group: any) => {
        setEditingId(group.id);
        try { setEditPerms(JSON.parse(group.permissions || '{}')); }
        catch { setEditPerms({}); }
    };

    const saveEdit = async (group: any) => {
        // @ts-ignore
        await window.electron.updateUserGroup({ ...group, permissions: editPerms });
        setEditingId(null);
        fetchGroups();
    };

    const togglePerm = (key: string) => {
        setEditPerms((prev: any) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <DashboardLayout title="User Groups">
            <div className="masters-container">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>User Groups</h1>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div className="search-box" style={{ display: 'flex', alignItems: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 1rem', gap: '0.5rem' }}>
                            <Search size={18} style={{ opacity: 0.5 }} />
                            <input placeholder="Search groups..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'none', border: 'none', outline: 'none', color: 'inherit', fontSize: '0.9rem' }} />
                        </div>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/users/groups/create')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            <Plus size={18} /> New Group
                        </motion.button>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Name</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Description</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Permissions</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, fontSize: '0.85rem', opacity: 0.7 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((group, i) => {
                                let perms: any = {};
                                try { perms = JSON.parse(group.permissions || '{}'); } catch {}
                                const isEditing = editingId === group.id;

                                return (
                                    <motion.tr key={group.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Shield size={16} style={{ color: 'var(--accent-color)' }} />
                                                <strong>{group.name}</strong>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem', opacity: 0.7, fontSize: '0.9rem' }}>{group.description || '—'}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                {PERMISSION_KEYS.map(key => {
                                                    const enabled = isEditing ? editPerms[key] : perms[key];
                                                    return (
                                                        <span key={key}
                                                            onClick={() => isEditing && togglePerm(key)}
                                                            style={{
                                                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                                                background: enabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)',
                                                                color: enabled ? '#22c55e' : '#ef4444',
                                                                cursor: isEditing ? 'pointer' : 'default',
                                                                border: isEditing ? '1px dashed var(--border-color)' : 'none'
                                                            }}
                                                        >
                                                            {key}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                {isEditing ? (
                                                    <>
                                                        <button onClick={() => saveEdit(group)} style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}><Check size={16} /></button>
                                                        <button onClick={() => setEditingId(null)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}><X size={16} /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => startEdit(group)} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDelete(group.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No user groups found.</p>}
                </motion.div>
            </div>
        </DashboardLayout>
    );
};

export default UserGroupList;
