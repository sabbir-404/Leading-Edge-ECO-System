import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import '../Accounting/Masters/Masters.css';

import DashboardLayout from '../../components/DashboardLayout';

interface Project {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  client: string;
  date: string;
  images: string[];
}

const WebsiteProjects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [formData, setFormData] = useState<Project>({
    id: '',
    title: '',
    description: '',
    coverImage: '',
    client: '',
    date: new Date().toISOString().split('T')[0],
    images: []
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await window.electron.websiteGetProjects();
      setProjects(data);
    } catch (error) { console.error(error); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...formData, id: editingProject ? editingProject.id : `proj-${Date.now()}` };
      if (editingProject) await window.electron.websiteUpdateProject(payload);
      else await window.electron.websiteCreateProject(payload);
      
      setIsModalOpen(false);
      fetchProjects();
      resetForm();
    } catch (error) { console.error(error); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    try {
      await window.electron.websiteDeleteProject(id);
      fetchProjects();
    } catch (error) { console.error(error); }
  };

  const resetForm = () => {
    setEditingProject(null);
    setFormData({
      id: '',
      title: '',
      description: '',
      coverImage: '',
      client: '',
      date: new Date().toISOString().split('T')[0],
      images: []
    });
  };

  const filteredProjects = projects.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <DashboardLayout title="Website Projects">
    <div className="masters-container" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div className="masters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Website Projects</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Showcase portfolio projects</p>
        </div>
        <button className="create-btn" onClick={() => { resetForm(); setIsModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          <Plus size={20} /> Add Project
        </button>
      </div>

      <div className="search-bar" style={{ marginBottom: '1.5rem', position: 'relative' }}>
          <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)' }}
          />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', overflowY: 'auto', paddingBottom: '2rem' }}>
        {filteredProjects.map(project => (
          <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ height: '180px', background: 'var(--bg-secondary)', position: 'relative' }}>
               {project.coverImage && <img src={project.coverImage} alt={project.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
               <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: '8px' }}>
                 <button onClick={() => { setEditingProject(project); setFormData(project); setIsModalOpen(true); }} style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '6px', color: 'white', border: 'none', cursor: 'pointer' }}><Edit2 size={16} /></button>
                 <button onClick={() => handleDelete(project.id)} style={{ background: 'rgba(255,0,0,0.5)', padding: '6px', borderRadius: '6px', color: 'white', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
               </div>
            </div>
            <div style={{ padding: '1rem' }}>
              <h3 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{project.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{project.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>{project.client}</span>
                <span>{project.date}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '100%', maxWidth: '600px', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                <h2>{editingProject ? 'Edit Project' : 'New Project'}</h2>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={24} /></button>
              </div>
              <form onSubmit={handleSave} style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Title</label>
                    <input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Client</label>
                      <input value={formData.client} onChange={e => setFormData({ ...formData, client: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Date</label>
                      <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                  </div>
                </div>
                <div>
                     <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Description</label>
                     <textarea rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Cover Image URL</label>
                    <input value={formData.coverImage} onChange={e => setFormData({ ...formData, coverImage: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-color)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Save Project</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </DashboardLayout>
  );
};

export default WebsiteProjects;
