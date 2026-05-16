import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2, Layers, X, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import '../../Accounting/Masters/Masters.css';

interface StockGroupNode {
    id: number;
    name: string;
    parent_id?: number | null;
    parent_name?: string | null;
    children: StockGroupNode[];
}

const StockGroupList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingGroup, setEditingGroup] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({ name: '', parentId: '' });

    const fetchGroups = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getStockGroups();
            setGroups(result || []);
        } catch (error) {
            console.error('Failed to fetch stock groups:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGroups(); }, []);

    useAutoRefresh(['stock_groups'], fetchGroups);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this stock group?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteStockGroup(id);
            fetchGroups();
        } catch (error) {
            alert('Cannot delete — stock items may belong to this group.');
        }
    };

    const openEdit = (group: any) => {
        setEditingGroup(group);
        setEditForm({
            name: group.name || '',
            parentId: group.parent_id ? String(group.parent_id) : '',
        });
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingGroup) return;
        try {
            // @ts-ignore
            await window.electron.updateStockGroup(editingGroup.id, {
                name: editForm.name.trim(),
                parentId: editForm.parentId ? Number(editForm.parentId) : null,
            });
            setEditingGroup(null);
            fetchGroups();
        } catch (error: any) {
            console.error('Failed to update stock group:', error);
            alert(error?.message || 'Failed to update stock group');
        }
    };

    const buildTree = (items: any[]): StockGroupNode[] => {
        const nodes = new Map<number, StockGroupNode>();
        items.forEach((group) => {
            nodes.set(Number(group.id), { ...group, children: [] });
        });

        const roots: StockGroupNode[] = [];
        nodes.forEach((node) => {
            const parentId = node.parent_id ? Number(node.parent_id) : null;
            const parent = parentId ? nodes.get(parentId) : null;
            if (parent) parent.children.push(node);
            else roots.push(node);
        });

        const sortNodes = (list: StockGroupNode[]) => {
            list.sort((a, b) => a.name.localeCompare(b.name));
            list.forEach((node) => sortNodes(node.children));
        };
        sortNodes(roots);
        return roots;
    };

    const filterTree = (nodes: StockGroupNode[], term: string): StockGroupNode[] => {
        const normalized = term.trim().toLowerCase();
        if (!normalized) return nodes;
        return nodes.reduce<StockGroupNode[]>((acc, node) => {
            const children = filterTree(node.children, normalized);
            if (node.name.toLowerCase().includes(normalized) || children.length > 0) {
                acc.push({ ...node, children });
            }
            return acc;
        }, []);
    };

    const getDescendantIds = (groupId: number) => {
        const tree = buildTree(groups);
        const descendants = new Set<number>();
        const visit = (nodes: StockGroupNode[]) => {
            nodes.forEach((node) => {
                if (node.id === groupId || descendants.has(Number(node.parent_id))) {
                    descendants.add(node.id);
                }
                visit(node.children);
            });
        };
        visit(tree);
        descendants.delete(groupId);
        return descendants;
    };

    const tree = filterTree(buildTree(groups), searchTerm);
    const blockedParentIds = editingGroup ? getDescendantIds(Number(editingGroup.id)) : new Set<number>();

    const renderNode = (group: StockGroupNode, depth = 0) => (
        <motion.div
            key={group.id}
            className={`stock-group-tree-row ${depth === 0 ? 'root' : 'child'}`}
            style={{ marginLeft: depth ? `${Math.min(depth * 28, 112)}px` : 0 }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="stock-group-node">
                <div className="stock-group-node-main">
                    <span className="stock-group-branch" aria-hidden="true" />
                    <div className="stock-group-icon"><Layers size={16} /></div>
                    <div>
                        <strong>{group.name}</strong>
                        <span>{group.parent_name ? `Under ${group.parent_name}` : 'Primary group'}</span>
                    </div>
                </div>
                <div className="action-buttons stock-group-actions">
                    <button className="edit-btn" title="Edit stock group" onClick={() => openEdit(group)}><Edit2 size={16} /></button>
                    <button className="delete-btn" title="Delete stock group" onClick={() => handleDelete(group.id)}><Trash2 size={16} /></button>
                </div>
            </div>
            {group.children.length > 0 && (
                <div className="stock-group-children">
                    {group.children.map((child) => renderNode(child, depth + 1))}
                </div>
            )}
        </motion.div>
    );

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Stock Groups</h2>
                <button className="create-btn" onClick={() => navigate('/masters/stock-groups/create')}>
                    <Plus size={18} /> Create Stock Group
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search stock groups..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="stock-group-tree">
                {loading ? (
                    <div className="empty-state">Loading...</div>
                ) : tree.length === 0 ? (
                    <div className="empty-state">No stock groups found</div>
                ) : (
                    tree.map((group) => renderNode(group))
                )}
            </div>

            {editingGroup && (
                <div className="modal-overlay" onClick={() => setEditingGroup(null)}>
                    <motion.form
                        className="modal-content stock-group-edit-modal"
                        initial={{ scale: 0.96, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onSubmit={handleUpdate}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header-row">
                            <div>
                                <h2>Edit Stock Group</h2>
                                <p>Change the parent to show this group under the correct stock group.</p>
                            </div>
                            <button type="button" className="action-btn" title="Close" onClick={() => setEditingGroup(null)}><X size={16} /></button>
                        </div>

                        <div className="form-group">
                            <label>Group Name</label>
                            <input value={editForm.name} onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} required />
                        </div>

                        <div className="form-group">
                            <label>Under (Parent Group)</label>
                            <select value={editForm.parentId} onChange={(e) => setEditForm(prev => ({ ...prev, parentId: e.target.value }))}>
                                <option value="">Primary</option>
                                {groups
                                    .filter((group) => group.id !== editingGroup.id && !blockedParentIds.has(Number(group.id)))
                                    .map((group) => (
                                        <option key={group.id} value={group.id}>{group.name}</option>
                                    ))}
                            </select>
                        </div>

                        <div className="form-actions">
                            <button type="button" className="back-btn" onClick={() => setEditingGroup(null)}><X size={16} /> Cancel</button>
                            <button type="submit" className="save-btn"><Save size={16} /> Save Changes</button>
                        </div>
                    </motion.form>
                </div>
            )}
        </div>
    );
};

export default StockGroupList;
