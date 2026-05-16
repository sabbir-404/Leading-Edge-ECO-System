import React from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import {
    Package, ChevronRight, FolderTree, BookOpen, FileText,
    Layers, Scale, Warehouse, ShoppingBag,
    Truck, DollarSign, ClipboardList, History, Target, ClipboardCheck, PackageMinus
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { motion } from 'framer-motion';
import './Accounting/Masters/Masters.css';

const MasterCard = ({ title, desc, path, icon: Icon, color, index }: any) => {
    const navigate = useNavigate();
    return (
        <motion.div
            className="master-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.045, type: 'spring', stiffness: 260, damping: 22 }}
            onClick={() => navigate('/masters' + path)}
            whileHover={{ scale: 1.025, translateY: -2 }}
            whileTap={{ scale: 0.97 }}
        >
            <div className="icon-wrapper" style={{ background: color }}>
                <Icon size={22} color="white" />
            </div>
            <div className="content">
                <div>
                    <h3>{title}</h3>
                    {desc && <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{desc}</p>}
                </div>
                <ChevronRight size={16} className="arrow" />
            </div>
        </motion.div>
    );
};

interface Section {
    title: string;
    subtitle: string;
    accent: string;
    items: { title: string; desc: string; path: string; icon: any; color: string }[];
}

const Masters: React.FC = () => {
    const location = useLocation();
    const isRootMasters = location.pathname === '/masters' || location.pathname === '/masters/';

    const sections: Section[] = [
        {
            title: 'Accounting',
            subtitle: 'Chart of Accounts, Ledgers, Currencies & Voucher Setup',
            accent: '#3b82f6',
            items: [
                { title: 'Account Groups',    desc: 'Manage ledger group hierarchy',        path: '/groups',       icon: FolderTree,    color: '#3b82f6' },
                { title: 'Ledgers',           desc: 'Chart of accounts & ledger entries',   path: '/ledgers',      icon: BookOpen,      color: '#22c55e' },
                { title: 'Voucher Types',     desc: 'Define payment & journal types',       path: '/voucher-types',icon: FileText,      color: '#a855f7' },
                { title: 'Currencies',        desc: 'Multi-currency & exchange rates',      path: '/currencies',   icon: DollarSign,    color: '#eab308' },
            ],
        },
        {
            title: 'Inventory',
            subtitle: 'Products, Stock Groups, Units, Godowns & Storage Locations',
            accent: '#f97316',
            items: [
                { title: 'Products',          desc: 'Product catalogue & item registry',    path: '/products',         icon: ShoppingBag,   color: '#ec4899' },
                { title: 'Product Ledger',    desc: 'Supplier, purchase & stock history',   path: '/products',         icon: History,       color: '#0ea5e9' },
                { title: 'Model Rules',       desc: 'Configure generated product IDs',      path: '/product-model-rules', icon: Target,     color: '#8b5cf6' },
                { title: 'Product Attributes',desc: 'Create specs like size and color',     path: '/product-attributes', icon: ClipboardCheck, color: '#10b981' },
                { title: 'Damaged Goods',     desc: 'Track damaged, repair & write-off stock', path: '/damaged-goods', icon: PackageMinus, color: '#ef4444' },
                { title: 'Stock Groups',      desc: 'Group products by category',           path: '/stock-groups',     icon: Layers,        color: '#6366f1' },
                { title: 'Stock Items',       desc: 'Raw material & component items',       path: '/stock-items',      icon: Package,       color: '#f97316' },
                { title: 'Units',             desc: 'Units of measurement (Pcs, Kg, m…)',   path: '/units',            icon: Scale,         color: '#14b8a6' },
                { title: 'Godowns / Stores',  desc: 'Warehouse & rack/bin locations',       path: '/godowns',          icon: Warehouse,     color: '#dc2626' },
            ],
        },
        {
            title: 'Procurement',
            subtitle: 'Supplier Management, Purchase Requisitions & Goods Receiving',
            accent: '#06b6d4',
            items: [
                { title: 'Suppliers',             desc: 'Vendor directory & contact info',       path: '/suppliers',              icon: Truck,          color: '#0ea5e9' },
                { title: 'Purchase Requisitions', desc: 'Raise, approve & track purchase orders', path: '/purchase-requisitions', icon: ClipboardList,  color: '#06b6d4' },
            ],
        },
    ];

    return (
        <DashboardLayout title="Masters">
            <div className="masters-container">
                {isRootMasters ? (
                    <>
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ marginBottom: '2rem' }}
                        >
                            <h1 className="page-title" style={{ marginBottom: '0.3rem' }}>Masters</h1>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                                Configure the foundation of your accounting, inventory, and procurement systems.
                            </p>
                        </motion.div>

                        {sections.map((section, si) => (
                            <div key={section.title} style={{ marginBottom: '2.5rem' }}>
                                {/* Section Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div style={{ width: '4px', height: '22px', borderRadius: '4px', background: section.accent, flexShrink: 0 }} />
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{section.title}</h2>
                                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{section.subtitle}</p>
                                    </div>
                                </div>

                                <div className="masters-grid">
                                    {section.items.map((card, idx) => (
                                        <MasterCard key={card.path} {...card} index={si * 6 + idx} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </>
                ) : (
                    <Outlet />
                )}
            </div>
        </DashboardLayout>
    );
};

export default Masters;
