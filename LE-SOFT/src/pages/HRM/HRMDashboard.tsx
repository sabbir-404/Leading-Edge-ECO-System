import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Users, UserCheck, UserX, Clock, Calendar } from 'lucide-react';

export default function HRMDashboard() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    onLeave: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // @ts-ignore
        const employees = await window.electron.hrmGetEmployees();
        const today = new Date().toISOString().split('T')[0];
        // @ts-ignore
        const attendance = await window.electron.hrmGetAttendance({ date: today });
        
        setStats({
          totalEmployees: employees.filter((e: any) => e.status === 'Active').length,
          presentToday: attendance.filter((a: any) => a.status === 'Present' || a.status === 'Half Day').length,
          onLeave: attendance.filter((a: any) => a.status === 'Leave').length
        });
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, []);

  return (
    <DashboardLayout title="HRM - Dashboard">
      <div style={{ padding: '1rem 2rem' }}>
        <h1 style={{ fontSize: '1.75rem', margin: '0 0 2rem 0', color: 'var(--text-primary)', fontWeight: 600 }}>Human Resources Overview</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <Users size={28} />
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>Active Employees</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '1.75rem', fontWeight: 700 }}>{stats.totalEmployees}</div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <UserCheck size={28} />
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>Present Today</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '1.75rem', fontWeight: 700 }}>{stats.presentToday}</div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
              <UserX size={28} />
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.25rem', fontWeight: 500 }}>On Leave Today</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '1.75rem', fontWeight: 700 }}>{stats.onLeave}</div>
            </div>
          </motion.div>

        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          
          <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <Clock size={20} style={{ color: 'var(--accent-color)' }} />
              <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>Quick Actions</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <a href="#/hrm/attendance" style={{ display: 'block', padding: '1rem', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>📋 Mark Daily Attendance</a>
              <a href="#/hrm/leaves" style={{ display: 'block', padding: '1rem', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>🌴 Review Pending Leaves</a>
              <a href="#/hrm/payroll" style={{ display: 'block', padding: '1rem', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>💰 Generate Monthly Payroll</a>
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-secondary)', textAlign: 'center' }}>
            <Calendar size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Mobile App Integration Ready</h3>
            <p style={{ margin: 0, maxWidth: '300px', fontSize: '0.9rem', lineHeight: 1.5 }}>The core database and API layer for employee self-service (attendance scanning, leave requests) are in place for the planned Mobile App extension.</p>
          </div>

        </div>

      </div>
    </DashboardLayout>
  );
}
