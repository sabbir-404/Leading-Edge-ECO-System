import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import '../Accounting/Masters/Masters.css';

import DashboardLayout from '../../components/DashboardLayout';

interface MediaItem {
  id: number;
  file_name: string;
  file_path: string;
  folder: string;
  file_size: number;
  mime_type: string;
  upload_date: string;
}

const WebsiteMedia: React.FC = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    setIsLoading(true);
    try {
      const data = await window.electron.websiteGetMedia();
      setMedia(data);
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('URL copied to clipboard!');
  };

  // Helper to construct full URL (Assuming localhost for dev matching the website port)
  const getFullUrl = (path: string) => `http://localhost:3001/${path}`;

  return (
    <DashboardLayout title="Media Gallery">
    <div className="masters-container" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
       <div className="masters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Media Gallery</h1>
          <p style={{ color: 'var(--text-secondary)' }}>View uploaded images and assets</p>
        </div>
        <button onClick={fetchMedia} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <RefreshCw size={20} className={isLoading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {media.map(item => (
                <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ height: '150px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                            src={getFullUrl(item.file_path)} 
                            alt={item.file_name}
                            style={{ flex: 1, width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/200?text=Error'; }} 
                        />
                    </div>
                    <div style={{ padding: '0.75rem' }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.file_name}>{item.file_name}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{item.folder} • {(item.file_size / 1024).toFixed(1)} KB</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <button onClick={() => copyToClipboard(getFullUrl(item.file_path))} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.75rem', padding: '4px', background: 'var(--bg-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px', color: 'var(--text-primary)' }}>
                                <Copy size={12} /> Copy URL
                            </button>
                            <a href={getFullUrl(item.file_path)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                <ExternalLink size={12} />
                            </a>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
        {media.length === 0 && !isLoading && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No media files found. Upload images through usage contexts or via the website directly.</div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
};

export default WebsiteMedia;
