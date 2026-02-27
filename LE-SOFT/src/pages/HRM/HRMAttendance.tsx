import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Calendar, Search, Clock, CheckCircle } from 'lucide-react';

export default function HRMAttendance() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    try {
      // @ts-ignore
      const emps = await window.electron.hrmGetEmployees();
      setEmployees(emps.filter((e: any) => e.status === 'Active') || []);
      
      // @ts-ignore
      const atts = await window.electron.hrmGetAttendance({ date });
      setAttendance(atts || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [date]);

  const handleStatusChange = async (empId: number, status: string) => {
    const existing = attendance.find(a => a.employee_id === empId);
    
    // Auto check-in time if marked present
    let check_in = existing?.check_in;
    if (!check_in && (status === 'Present' || status === 'Half Day')) {
      check_in = new Date().toLocaleTimeString('en-GB', { hour12: false });
    }

    try {
      // @ts-ignore
      await window.electron.hrmMarkAttendance({
        employee_id: empId,
        date,
        status,
        check_in,
        check_out: existing?.check_out || null
      });
      fetchData(); // reload
    } catch (err) {
      alert('Failed to update attendance');
    }
  };

  const handleTimeChange = async (empId: number, field: 'check_in' | 'check_out', time: string) => {
    const existing = attendance.find(a => a.employee_id === empId);
    if (!existing) return; // Can't set time if no status is set yet

    try {
      // @ts-ignore
      await window.electron.hrmMarkAttendance({
        employee_id: empId,
        date,
        status: existing.status,
        check_in: field === 'check_in' ? time : existing.check_in,
        check_out: field === 'check_out' ? time : existing.check_out,
      });
      fetchData();
    } catch (err) {
      alert('Failed to update time');
    }
  };

  const filtered = employees.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    (e.designation && e.designation.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present': return { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', border: '#10b981' };
      case 'Absent': return { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', border: '#ef4444' };
      case 'Half Day': return { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', border: '#f59e0b' };
      case 'Leave': return { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: '#3b82f6' };
      default: return { bg: 'var(--input-bg)', text: 'var(--text-primary)', border: 'var(--border-color)' };
    }
  };

  return (
    <DashboardLayout title="HRM - Attendance">
      <div style={{ padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Calendar size={24} style={{ color: 'var(--accent-color)' }} />
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Daily Attendance</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Date:</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '400px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employee..."
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Employee</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600, width: '150px' }}>In Time</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600, width: '150px' }}>Out Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => {
                const attLog = attendance.find(a => a.employee_id === emp.id);
                const currentStatus = attLog?.status || '';

                return (
                  <motion.tr 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                    key={emp.id} style={{ borderBottom: '1px solid var(--border-color)' }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{emp.designation}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {['Present', 'Absent', 'Half Day', 'Leave'].map(s => {
                          const isSelected = currentStatus === s;
                          const colors = getStatusColor(isSelected ? s : 'default');
                          return (
                            <button 
                              key={s}
                              onClick={() => handleStatusChange(emp.id, s)}
                              style={{ 
                                padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`
                              }}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <input 
                        type="time" 
                        value={attLog?.check_in || ''}
                        disabled={!attLog || attLog.status === 'Absent' || attLog.status === 'Leave'}
                        onChange={e => handleTimeChange(emp.id, 'check_in', e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', width: '100%' }}
                      />
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <input 
                        type="time" 
                        value={attLog?.check_out || ''}
                        disabled={!attLog || !attLog.check_in}
                        onChange={e => handleTimeChange(emp.id, 'check_out', e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', width: '100%' }}
                      />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No active employees found to mark attendance.</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
