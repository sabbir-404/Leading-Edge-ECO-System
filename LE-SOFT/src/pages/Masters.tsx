import React from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { Package, ChevronRight, FolderTree, BookOpen, FileText, Calculator, Layers, Scale, Warehouse, ShoppingBag } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { motion } from 'framer-motion';
import './Accounting/Masters/Masters.css';

const MasterCard = ({ title, path, icon: Icon, color, index }: any) => {
    const navigate = useNavigate();
    return (
        <motion.div
            className="master-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
            onClick={() => navigate('/masters' + path)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            <div className="icon-wrapper" style={{ background: color }}>
                <Icon size={24} color="white" />
            </div>
            <div className="content">
                <h3>{title}</h3>
                <ChevronRight size={16} className="arrow" />
            </div>
        </motion.div>
    );
};

const Masters: React.FC = () => {
    const location = useLocation();
    const isRootMasters = location.pathname === '/masters' || location.pathname === '/masters/';

    const accountingMasters = [
        { title: 'Groups', path: '/groups', icon: FolderTree, color: '#3b82f6' },
        { title: 'Ledgers', path: '/ledgers', icon: BookOpen, color: '#22c55e' },
        { title: 'Voucher Types', path: '/voucher-types', icon: FileText, color: '#a855f7' },
        { title: 'Currencies', path: '/currencies', icon: Calculator, color: '#eab308' },
    ];

    const inventoryMasters = [
        { title: 'Stock Groups', path: '/stock-groups', icon: Layers, color: '#6366f1' },
        { title: 'Stock Items', path: '/stock-items', icon: Package, color: '#f97316' },
        { title: 'Units', path: '/units', icon: Scale, color: '#14b8a6' },
        { title: 'Products', path: '/products', icon: ShoppingBag, color: '#ec4899' },
        { title: 'Godowns', path: '/godowns', icon: Warehouse, color: '#dc2626' },
    ];

    return (
        <DashboardLayout title="Masters">
            <div className="masters-container">
                {isRootMasters ? (
                    <>
                        <motion.h1
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="page-title"
                        >
                            Masters
                        </motion.h1>

                        <h2 className="section-title" style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.15rem', fontWeight: 600, opacity: 0.8 }}>Accounting Masters</h2>
                        <div className="masters-grid">
                            {accountingMasters.map((card, index) => (
                                <MasterCard key={index} {...card} index={index} />
                            ))}
                        </div>

                        <h2 className="section-title" style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1.15rem', fontWeight: 600, opacity: 0.8 }}>Inventory Masters</h2>
                        <div className="masters-grid">
                            {inventoryMasters.map((card, index) => (
                                <MasterCard key={index + 10} {...card} index={index + 2} />
                            ))}
                        </div>
                    </>
                ) : (
                    <Outlet />
                )}
            </div>
        </DashboardLayout>
    );
};

export default Masters;
