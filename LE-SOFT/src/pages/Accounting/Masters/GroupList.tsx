import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, ChevronRight, ChevronDown, Folder, FolderOpen, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import './Masters.css';

interface GroupNode {
    id: number;
    name: string;
    parent_group_id?: number | null;
    parent_name?: string | null;
    nature?: string | null;
    children: GroupNode[];
}

const GroupList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

    const fetchGroups = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getGroups();
            setGroups(result || []);
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    useAutoRefresh(['groups'], fetchGroups);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this group? All ledgers and subgroups nested under it may be affected.')) return;
        try {
            // @ts-ignore
            await window.electron.deleteGroup(id);
            fetchGroups();
        } catch (error) {
            console.error('Failed to delete group:', error);
            alert('Cannot delete group — it may be in use by ledgers or other subgroups.');
        }
    };

    const toggleExpand = (id: number) => {
        const next = new Set(expandedNodes);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedNodes(next);
    };

    const expandAll = () => {
        const ids = groups.map(g => Number(g.id));
        setExpandedNodes(new Set(ids));
    };

    const collapseAll = () => {
        setExpandedNodes(new Set());
    };

    // Build the hierarchical tree
    const buildTree = (items: any[]): GroupNode[] => {
        const nodes = new Map<number, GroupNode>();
        items.forEach((g) => {
            nodes.set(Number(g.id), { ...g, children: [] });
        });

        const roots: GroupNode[] = [];
        nodes.forEach((node) => {
            const parentId = node.parent_group_id ? Number(node.parent_group_id) : null;
            const parent = parentId ? nodes.get(parentId) : null;
            if (parent) parent.children.push(node);
            else roots.push(node);
        });

        const sortNodes = (list: GroupNode[]) => {
            list.sort((a, b) => a.name.localeCompare(b.name));
            list.forEach((node) => sortNodes(node.children));
        };
        sortNodes(roots);
        return roots;
    };

    // Helper to resolve group nature recursively if not explicitly set
    const getEffectiveNature = (node: GroupNode, allItems: any[]): string => {
        if (node.nature) return node.nature;
        let current = node;
        while (current.parent_group_id) {
            const parent = allItems.find(item => Number(item.id) === Number(current.parent_group_id));
            if (!parent) break;
            if (parent.nature) return parent.nature;
            current = parent;
        }
        return 'Assets'; // Default fallback
    };

    // Render nature badges
    const renderNatureBadge = (nature: string) => {
        let styles = { background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#3b82f6' }; // Default Income
        if (nature === 'Assets') {
            styles = { background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#22c55e' };
        } else if (nature === 'Liabilities') {
            styles = { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' };
        } else if (nature === 'Expenses') {
            styles = { background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.2)', color: '#f97316' };
        }

        return (
            <span className="badge" style={{ ...styles, padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                {nature}
            </span>
        );
    };

    // Recursive Tree node renderer
    const renderTreeNode = (node: GroupNode, depth: number) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id);
        const nature = getEffectiveNature(node, groups);

        return (
            <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div 
                    className={`stock-group-tree-row ${depth === 0 ? 'root' : 'child'}`}
                    style={{ 
                        marginLeft: depth ? `${Math.min(depth * 28, 140)}px` : 0,
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '0.75rem 1rem',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                        {hasChildren ? (
                            <button 
                                onClick={() => toggleExpand(node.id)}
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--text-secondary)', 
                                    cursor: 'pointer', 
                                    padding: '2px', 
                                    display: 'flex', 
                                    alignItems: 'center' 
                                }}
                            >
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>
                        ) : (
                            <span style={{ width: '22px' }} />
                        )}

                        <div style={{ 
                            color: 'var(--accent-color)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            opacity: 0.85
                        }}>
                            {hasChildren ? (
                                isExpanded ? <FolderOpen size={18} /> : <Folder size={18} />
                            ) : (
                                <Layers size={16} />
                            )}
                        </div>

                        <div>
                            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{node.name}</span>
                            {node.parent_name && (
                                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    (Under <strong style={{ fontWeight: 600 }}>{node.parent_name}</strong>)
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                        {renderNatureBadge(nature)}
                        
                        <div className="action-buttons" style={{ margin: 0 }}>
                            <button 
                                className="edit-btn" 
                                title="Edit Group" 
                                onClick={() => navigate('/masters/groups/create', { state: { editGroup: node } })}
                            >
                                <Edit2 size={15} />
                            </button>
                            <button 
                                className="delete-btn" 
                                title="Delete Group" 
                                onClick={() => handleDelete(node.id)}
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    </div>
                </div>

                {hasChildren && isExpanded && (
                    <AnimatePresence>
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            {node.children.map(child => renderTreeNode(child, depth + 1))}
                        </motion.div>
                    </AnimatePresence>
                )}
            </div>
        );
    };

    // Filter results if search query is active
    const filteredRoots = () => {
        const tree = buildTree(groups);
        if (!searchTerm.trim()) return tree;

        // Flatten search matching nodes
        const matches: GroupNode[] = [];
        const searchLower = searchTerm.toLowerCase();

        const searchNode = (node: GroupNode) => {
            if (node.name.toLowerCase().includes(searchLower)) {
                matches.push({ ...node, children: [] });
            }
            node.children.forEach(searchNode);
        };

        tree.forEach(searchNode);
        return matches;
    };

    return (
        <div className="master-list-container" style={{ padding: '1.5rem' }}>
            <div className="list-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Account Groups</h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manage your chart of accounts hierarchies, nature, and linkages.</p>
                </div>
                <button className="create-btn" onClick={() => navigate('/masters/groups/create')}>
                    <Plus size={18} /> Create Group
                </button>
            </div>

            <div className="filter-bar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div className="search-input-wrapper" style={{ flex: 1 }}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search groups by name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {!searchTerm.trim() && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="clear-filters" onClick={expandAll} style={{ padding: '0.5rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', background: 'var(--hover-bg)' }}>
                            Expand All
                        </button>
                        <button className="clear-filters" onClick={collapseAll} style={{ padding: '0.5rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', background: 'var(--hover-bg)' }}>
                            Collapse All
                        </button>
                    </div>
                )}
            </div>

            <div className="tree-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {loading ? (
                    <div className="empty-state" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading account groups...</div>
                ) : filteredRoots().length === 0 ? (
                    <div className="empty-state" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No groups found matching your search.</div>
                ) : (
                    filteredRoots().map(root => renderTreeNode(root, 0))
                )}
            </div>
        </div>
    );
};

export default GroupList;
