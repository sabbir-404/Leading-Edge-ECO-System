import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { Mail, Send, Inbox, PenSquare, Trash2, ArrowLeft, SendHorizonal } from 'lucide-react';
import './Email.css';
import { motion, AnimatePresence } from 'framer-motion';

export default function Email() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'compose'>('inbox');
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  
  // Compose states
  const [users, setUsers] = useState<any[]>([]);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);

  // Auth User
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setCurrentUser(JSON.parse(u));
  }, []);

  // Fetch Users for compose dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // @ts-ignore
        const usrs = await window.electron.getUsers();
        setUsers(usrs || []);
      } catch (e) {
        console.error('Failed to load users', e);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchEmails = async () => {
      setLoading(true);
      try {
        let data = [];
        if (activeTab === 'inbox') {
          // @ts-ignore
          data = await window.electron.emailGetInbox(currentUser.id);
        } else if (activeTab === 'sent') {
          // @ts-ignore
          data = await window.electron.emailGetSent(currentUser.id);
        }
        setEmails(data || []);
      } catch (e) {
        console.error('Failed to fetch emails', e);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab !== 'compose') {
      fetchEmails();
      setSelectedEmail(null);
    }
  }, [activeTab, currentUser]);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo) return alert('Please select a recipient');
    setSending(true);
    try {
      // @ts-ignore
      const res = await window.electron.emailSend({
        senderId: currentUser?.id,
        receiverId: parseInt(composeTo),
        subject: composeSubject,
        body: composeBody
      });
      if (res.success) {
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setActiveTab('sent');
      } else {
        alert(res.error || 'Failed to send');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while sending email');
    } finally {
      setSending(false);
    }
  };

  const handleOpenEmail = async (email: any) => {
    setSelectedEmail(email);
    if (activeTab === 'inbox' && !email.is_read) {
      try {
        // @ts-ignore
        await window.electron.emailMarkRead(email.id);
        setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e));
      } catch (e) {}
    }
  };

  const handleDeleteEmail = async (emailId: number) => {
    if (!window.confirm('Delete this email?')) return;
    try {
      // @ts-ignore
      await window.electron.emailDelete({ emailId, folder: activeTab });
      setEmails(prev => prev.filter(e => e.id !== emailId));
      if (selectedEmail?.id === emailId) setSelectedEmail(null);
    } catch (e) {
      alert('Failed to delete email');
    }
  };

  const formatDate = (ds: string) => {
    const d = new Date(ds);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout title="Email System">
      <div className="email-container">
        {/* Sidebar */}
        <aside className="email-sidebar widget-card">
          <button 
            className="compose-btn btn-primary"
            onClick={() => setActiveTab('compose')}
          >
            <PenSquare size={18} /> Compose
          </button>

          <nav className="email-nav">
            <button 
              className={activeTab === 'inbox' ? 'active' : ''}
              onClick={() => setActiveTab('inbox')}
            >
              <Inbox size={18} /> Inbox
            </button>
            <button 
              className={activeTab === 'sent' ? 'active' : ''}
              onClick={() => setActiveTab('sent')}
            >
              <Send size={18} /> Sent
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="email-main widget-card">
          
          {/* COMPOSE VIEW */}
          {activeTab === 'compose' && (
            <div className="compose-view">
              <h2>New Message</h2>
              <form onSubmit={handleSendEmail} className="compose-form">
                <div className="form-group">
                  <label>To:</label>
                  <select 
                    value={composeTo} 
                    onChange={e => setComposeTo(e.target.value)}
                    required
                  >
                    <option value="">Select Recipient...</option>
                    {users.filter(u => u.id !== currentUser?.id).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject:</label>
                  <input 
                    type="text" 
                    value={composeSubject}
                    onChange={e => setComposeSubject(e.target.value)}
                    placeholder="Subject..."
                    required
                  />
                </div>
                <div className="form-group flex-1">
                  <textarea 
                    value={composeBody}
                    onChange={e => setComposeBody(e.target.value)}
                    placeholder="Write your message here..."
                    className="compose-body"
                    required
                  ></textarea>
                </div>
                <div className="compose-actions">
                  <button type="submit" className="btn-primary" disabled={sending}>
                    {sending ? 'Sending...' : <><SendHorizonal size={16} /> Send Email</>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* LIST/READ VIEW */}
          {activeTab !== 'compose' && (
            <>
              {!selectedEmail ? (
                // Email List
                <div className="email-list-view">
                  <div className="email-header">
                    <h2>{activeTab === 'inbox' ? 'Inbox' : 'Sent Messages'}</h2>
                  </div>
                  
                  {loading ? (
                    <div className="loading-state">Loading emails...</div>
                  ) : emails.length === 0 ? (
                    <div className="empty-state">
                      <Mail size={40} className="muted-icon" />
                      <p>No messages found in {activeTab}</p>
                    </div>
                  ) : (
                    <div className="email-list">
                      <AnimatePresence>
                        {emails.map(email => (
                          <motion.div 
                            key={email.id} 
                            className={`email-item ${activeTab === 'inbox' && !email.is_read ? 'unread' : ''}`}
                            onClick={() => handleOpenEmail(email)}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <div className="email-sender">
                              {activeTab === 'inbox' ? email.sender?.full_name : `To: ${email.receiver?.full_name}`}
                            </div>
                            <div className="email-subject">
                              <span className="subject-text">{email.subject || '(No Subject)'}</span>
                              <span className="body-preview"> - {email.body?.substring(0, 50)}...</span>
                            </div>
                            <div className="email-date">
                              {formatDate(email.created_at)}
                            </div>
                            <button 
                              className="btn-icon delete-btn" 
                              onClick={(e) => { e.stopPropagation(); handleDeleteEmail(email.id); }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              ) : (
                // Read Email
                <div className="email-read-view">
                  <div className="read-header">
                    <button className="btn-secondary btn-back" onClick={() => setSelectedEmail(null)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button className="btn-icon btn-danger" onClick={() => handleDeleteEmail(selectedEmail.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="read-content">
                    <h2 className="read-subject">{selectedEmail.subject || '(No Subject)'}</h2>
                    <div className="read-meta">
                      <div className="meta-left">
                        <strong>
                          {activeTab === 'inbox' ? `From: ${selectedEmail.sender?.full_name}` : `To: ${selectedEmail.receiver?.full_name}`}
                        </strong>
                        <span className="meta-email">
                          {activeTab === 'inbox' ? `<${selectedEmail.sender?.email}>` : `<${selectedEmail.receiver?.email}>`}
                        </span>
                      </div>
                      <div className="meta-date">
                        {formatDate(selectedEmail.created_at)}
                      </div>
                    </div>
                    
                    <div className="read-body">
                      {selectedEmail.body?.split('\n').map((line: string, i: number) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </main>
      </div>
    </DashboardLayout>
  );
}
