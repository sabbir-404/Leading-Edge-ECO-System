import React, { useState, useEffect } from 'react';
import { Calendar, Users } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const WebsiteNewsletter: React.FC = () => {
  const [newsletters, setNewsletters] = useState<any[]>([]);

  useEffect(() => {
    fetchNewsletters();
  }, []);

  const fetchNewsletters = async () => {
    try {
      const data = await window.electron.websiteGetNewsletters();
      setNewsletters(Array.isArray(data) ? data : []);
    } catch (error) { console.error(error); }
  };

  return (
    <DashboardLayout title="Newsletter Campaigns">
    <div className="masters-container" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div className="masters-header" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Newsletter Campaigns</h1>
        <p style={{ color: 'var(--text-secondary)' }}>View past email campaigns</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {newsletters.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No campaigns sent yet.</div>
        ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
                {newsletters.map((n: any) => (
                    <div key={n.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{n.subject}</h3>
                            <span style={{ fontSize: '0.8rem', padding: '4px 8px', background: n.status === 'Sent' ? '#10b98120' : '#f59e0b20', color: n.status === 'Sent' ? '#10b981' : '#f59e0b', borderRadius: '4px' }}>{n.status}</span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>{n.content?.substring(0, 100)}...</p>
                        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} /> {new Date(n.sent_date).toLocaleDateString()}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={14} /> {n.recipient_count} Recipients</div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
};

export default WebsiteNewsletter;
