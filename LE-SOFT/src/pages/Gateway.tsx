import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, BarChart2, Layers, Settings, Database } from 'lucide-react';
import './Gateway.css';

const Gateway: React.FC = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const menuItems = [
    {
      title: 'Masters',
      items: [
        { label: 'Create', path: '/masters/create', shortcut: 'C' },
        { label: 'Alter', path: '/masters/alter', shortcut: 'A' },
        { label: 'Chart of Accounts', path: '/masters/chart', shortcut: 'H' },
      ],
      icon: <Database size={20} />
    },
    {
      title: 'Transactions',
      items: [
        { label: 'Vouchers', path: '/vouchers', shortcut: 'V' },
        { label: 'Day Book', path: '/daybook', shortcut: 'K' },
      ],
      icon: <FileText size={20} />
    },
    {
      title: 'Reports',
      items: [
        { label: 'Balance Sheet', path: '/reports/balance-sheet', shortcut: 'B' },
        { label: 'Profit & Loss', path: '/reports/pnl', shortcut: 'P' },
        { label: 'Stock Summary', path: '/reports/stock', shortcut: 'S' },
        { label: 'Ratio Analysis', path: '/reports/ratio', shortcut: 'R' },
      ],
      icon: <BarChart2 size={20} />
    },
    {
      title: 'Utilities',
      items: [
        { label: 'Import Data', path: '/import', shortcut: 'O' },
        { label: 'Banking', path: '/banking', shortcut: 'N' },
      ],
      icon: <Settings size={20} />
    }
  ];

  return (
    <div className="gateway-container">
      <header className="gateway-header">
        <div className="company-info">
          <h1 onClick={() => navigate('/company/create')} style={{cursor: 'pointer'}} title="Click to Switch/Create Company">Leading Edge Furniture</h1>
          <p>Financial Year: 2025-2026</p>
        </div>
        <div className="date-display">
          {currentTime.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          <span style={{marginLeft: '10px'}}>{currentTime.toLocaleTimeString()}</span>
        </div>
      </header>
      
      <div className="gateway-grid">
        <div className="menu-column">
          <h2 className="gateway-title">Gateway of Tally (LE-SOFT)</h2>
          
          <div className="menu-groups">
            {menuItems.map((group, index) => (
              <div key={index} className="menu-group">
                <div className="group-header">
                  {group.icon}
                  <span>{group.title}</span>
                </div>
                <div className="group-items">
                  {group.items.map((item, idx) => (
                    <button 
                      key={idx} 
                      className="menu-item"
                      onClick={() => navigate(item.path)}
                    >
                      <span className="shortcut">{item.shortcut}</span>
                      <span className="label">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="info-column">
          <div className="dashboard-widget">
            <h3>Current Period</h3>
            <p className="highlight-text">01-Apr-2025 to 31-Mar-2026</p>
          </div>
          
          <div className="dashboard-widget stats">
            <h3>Key Statistics</h3>
            <div className="stat-row">
              <span>Cash in Hand:</span>
              <span className="amount">₹ 0.00</span>
            </div>
            <div className="stat-row">
              <span>Bank Accounts:</span>
              <span className="amount">₹ 0.00</span>
            </div>
            <div className="stat-row">
              <span>Sundry Debtors:</span>
              <span className="amount">₹ 0.00</span>
            </div>
             <div className="stat-row">
              <span>Sundry Creditors:</span>
              <span className="amount">₹ 0.00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Gateway;
