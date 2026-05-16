import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Shield, Edit2, Check, X, Power } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';
import './Users.css';

const PERMISSION_KEYS = [
    // Masters
    'read_group', 'write_group', 'read_ledger', 'write_ledger', 'read_voucher_type', 'write_voucher_type',
    'read_currencies', 'write_currencies', 'read_stock_group', 'write_stock_group', 'read_stock_items', 'write_stock_items',
    'read_units', 'write_units', 'read_products', 'write_products', 'delete_products', 'read_godowns', 'write_godowns',
    'read_product_ledger', 'edit_product_information', 'manage_product_origins', 'manage_product_model_rules', 'manage_product_attributes',
    'read_damaged_goods', 'manage_damaged_goods',
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
    'read_email', 'write_email', 'manage_shipping',
    // Procurement
    'read_purchase_requisition', 'create_purchase_requisition', 'approve_store_requisition',
    'add_purchase_estimates', 'audit_purchase_requisition', 'director_approve_purchase_requisition',
    'purchase_requisition', 'receive_purchase_requisition', 'complete_purchase_requisition', 'alter_purchase_requisition',
    'view_purchase_requisition_pricing', 'view_purchase_requisition_audit'
];

const UserGroupList: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editPerms, setEditPerms] = useState<any>({});
    const [editDescription, setEditDescription] = useState('');

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

    const toggleGroupActive = async (group: any) => {
        // @ts-ignore
        await window.electron.updateUserGroup({ ...group, is_active: group.is_active === false });
        fetchGroups();
    };

    const startEdit = (group: any) => {
        setEditingId(group.id);
        const p = group.permissions;
        setEditPerms(typeof p === 'object' && p !== null ? p : (typeof p === 'string' ? JSON.parse(p || '{}') : {}));
        setEditDescription(group.description || '');
    };

    const saveEdit = async (group: any) => {
        // @ts-ignore
        await window.electron.updateUserGroup({ ...group, description: editDescription.trim(), permissions: editPerms });
        setEditingId(null);
        setEditDescription('');
        fetchGroups();
    };

    const togglePerm = (key: string) => {
        setEditPerms((prev: any) => ({ ...prev, [key]: !prev[key] }));
    };

    const getPermEntries = (permissions: any) => {
        const pRaw = permissions;
        let perms: any = {};
        if (typeof pRaw === 'object' && pRaw !== null) perms = pRaw;
        else if (typeof pRaw === 'string') { try { perms = JSON.parse(pRaw || '{}'); } catch {} }
        return Object.keys(perms).filter(key => perms[key]);
    };

    return (
        <DashboardLayout title="User Groups">
            <div className="users-page">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="users-toolbar">
                    <div className="users-title">
                        <h1>User Groups</h1>
                        <p>Manage role templates and the permissions assigned to each department.</p>
                    </div>
                    <div className="users-actions">
                        <div className="users-search">
                            <Search size={18} />
                            <input placeholder="Search groups..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <motion.button className="create-btn" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/users/groups/create')}>
                            <Plus size={18} /> New Group
                        </motion.button>
                    </div>
                </motion.div>

                <motion.div className="groups-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    {filtered.map((group, i) => {
                        const activePerms = getPermEntries(group.permissions);
                        const isEditing = editingId === group.id;

                        return (
                            <motion.div key={group.id} className={`group-card ${group.is_active === false ? 'disabled' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                                <div className="group-card-header">
                                    <div>
                                        <div className="group-name">
                                            <Shield size={17} style={{ color: 'var(--accent-color)' }} />
                                            {group.name}
                                            <span className={`group-status ${group.is_active === false ? 'inactive' : 'active'}`}>
                                                {group.is_active === false ? 'Disabled' : 'Active'}
                                            </span>
                                        </div>
                                        {isEditing ? (
                                            <textarea
                                                className="group-description-input"
                                                value={editDescription}
                                                onChange={e => setEditDescription(e.target.value)}
                                                placeholder="Describe this user group..."
                                                rows={3}
                                            />
                                        ) : (
                                            <p className="group-description">{group.description || 'No description provided.'}</p>
                                        )}
                                    </div>
                                    <div className="group-actions">
                                        {isEditing ? (
                                            <>
                                                <button className="icon-btn" onClick={() => saveEdit(group)} title="Save"><Check size={16} /></button>
                                                <button className="icon-btn danger" onClick={() => { setEditingId(null); setEditDescription(''); }} title="Cancel"><X size={16} /></button>
                                            </>
                                        ) : (
                                            <>
                                                <button className="icon-btn" onClick={() => startEdit(group)} title="Edit group" aria-label="Edit group"><Edit2 size={16} /></button>
                                                <button className={`icon-btn ${group.is_active === false ? 'success' : 'warning'}`} onClick={() => toggleGroupActive(group)} title={group.is_active === false ? 'Enable group' : 'Disable group'} aria-label={group.is_active === false ? 'Enable group' : 'Disable group'}><Power size={16} /></button>
                                                <button className="icon-btn danger" onClick={() => handleDelete(group.id)} title="Delete group" aria-label="Delete group"><Trash2 size={16} /></button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {!isEditing ? (
                                    <div className="permission-summary">
                                        {activePerms.slice(0, 7).map(key => <span key={key} className="permission-pill">{key}</span>)}
                                        {activePerms.length > 7 && <span className="permission-pill muted">+{activePerms.length - 7} more</span>}
                                        {activePerms.length === 0 && <span className="permission-pill muted">No permissions</span>}
                                    </div>
                                ) : (
                                    <div className="permission-edit-grid">
                                        {PERMISSION_KEYS.map(key => {
                                            const enabled = !!editPerms[key];
                                            return (
                                                <div key={key} className={`permission-toggle ${enabled ? 'enabled' : ''}`} onClick={() => togglePerm(key)}>
                                                    {enabled ? <Check size={14} /> : <X size={14} />}
                                                    <span>{key}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                    {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No user groups found.</p>}
                </motion.div>
            </div>
        </DashboardLayout>
    );
};

export default UserGroupList;
