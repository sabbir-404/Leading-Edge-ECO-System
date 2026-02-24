import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { motion } from 'framer-motion';
import { FileText, ShoppingCart, ChevronRight } from 'lucide-react';
import './Accounting/Masters/Masters.css';

const VoucherTypeCard = ({ title, path, icon: Icon, color, index }: any) => {
    const navigate = useNavigate();
    return (
        <motion.div
            className="master-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
            onClick={() => navigate(path)}
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

const Vouchers: React.FC = () => {
    const location = useLocation();
    const isRoot = location.pathname === '/vouchers' || location.pathname === '/vouchers/';

    const voucherTypes = [
        { title: 'All Vouchers', path: '/vouchers', icon: FileText, color: '#3b82f6' },
        { title: 'Create Voucher', path: '/vouchers/create', icon: FileText, color: '#22c55e' },
        { title: 'Purchase Bills', path: '/vouchers/purchase-bill', icon: ShoppingCart, color: '#f97316' },
    ];

    return (
        <DashboardLayout title="Vouchers">
            {isRoot ? (
                <div className="masters-container">
                    <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="page-title">Vouchers & Bills</motion.h1>
                    <div className="masters-grid">
                        {voucherTypes.map((card, index) => (
                            <VoucherTypeCard key={index} {...card} index={index} />
                        ))}
                    </div>
                </div>
            ) : (
                <Outlet />
            )}
        </DashboardLayout>
    );
};

export default Vouchers;
