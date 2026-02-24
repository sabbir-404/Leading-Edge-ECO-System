import React, { useState, useEffect } from 'react';
import { Truck, Layout, Home, BookOpen, Save } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const WebsiteSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('shipping');
  const [loading, setLoading] = useState(false);
  const [siteConfig, setSiteConfig] = useState<any>({});
  
  const [shippingAreas, setShippingAreas] = useState<any[]>([]);
  const [shippingMethods, setShippingMethods] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
        const config = await window.electron.websiteGetConfig();
        const areas = await window.electron.websiteGetShippingAreas();
        const methods = await window.electron.websiteGetShippingMethods();
        
        setSiteConfig(config || {});
        setShippingAreas(areas || []);
        setShippingMethods(methods || []);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleConfigSave = async () => {
      try {
          await window.electron.websiteUpdateConfig(siteConfig);
          alert('Configuration saved!');
      } catch (e) { alert('Failed to save'); }
  };

  return (
    <DashboardLayout title="Website Settings">
    <div className="masters-container" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
       <div className="masters-header">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Website Settings</h1>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          {['shipping', 'home', 'layout', 'catalogues'].map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                style={{
                    padding: '1rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid var(--accent-color)' : '2px solid transparent',
                    color: activeTab === tab ? 'var(--accent-color)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                }}
              >
                  {tab === 'shipping' && <Truck size={16} style={{marginRight:8, verticalAlign:'text-bottom'}} />}
                  {tab === 'home' && <Home size={16} style={{marginRight:8, verticalAlign:'text-bottom'}} />}
                  {tab === 'layout' && <Layout size={16} style={{marginRight:8, verticalAlign:'text-bottom'}} />}
                  {tab === 'catalogues' && <BookOpen size={16} style={{marginRight:8, verticalAlign:'text-bottom'}} />}
                  {tab}
              </button>
          ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* CONTENT BASED ON TABS */}
          {activeTab === 'shipping' && (
              <div>
                  <h3 style={{marginBottom:'1rem'}}>Shipping Configuration {loading && '(Loading...)'}</h3>
                  {/* Placeholder for Shipping UI - connecting to backend IPC would go here */}
                  <div style={{ display: 'grid', gridTemplateColumns:'1fr 1fr', gap: '2rem' }}>
                    <div>
                        <h4>Shipping Areas</h4>
                        {shippingAreas.map((a: any) => (
                             <div key={a.id} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>{a.name}</div>
                        ))}
                    </div>
                    <div>
                        <h4>Shipping Methods</h4>
                         <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                            {shippingMethods.map((m: any) => (
                                <div key={m.id} style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                    <strong>{m.name}</strong> - {m.type} ({m.flatRate || 'Calc'})
                                </div>
                            ))}
                        </div>
                    </div>
                  </div>
              </div>
          )}

          {activeTab === 'home' && (
              <div>
                   <h3 style={{marginBottom:'1rem'}}>Home Page Sections</h3>
                   <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px' }}>
                       <p style={{color: 'var(--text-secondary)', marginBottom: '1rem'}}>Manage valid home page sections visibility and order via Site Config.</p>
                       <textarea 
                            value={JSON.stringify(siteConfig.homeSections || [], null, 2)}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    setSiteConfig({...siteConfig, homeSections: parsed});
                                } catch(err) {} 
                            }}
                            style={{ width: '100%', height: '300px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', fontFamily: 'monospace' }}
                       />
                       <button onClick={handleConfigSave} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <Save size={18} /> Save Config
                       </button>
                   </div>
              </div>
          )}

           {activeTab === 'layout' && (
              <div>
                   <h3 style={{marginBottom:'1rem'}}>Header & Footer</h3>
                    <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px' }}>
                       <p style={{color: 'var(--text-secondary)', marginBottom: '1rem'}}>Global layout settings.</p>
                       <textarea 
                            value={JSON.stringify(siteConfig.headerFooter || {}, null, 2)}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    setSiteConfig({...siteConfig, headerFooter: parsed});
                                } catch(err) {} 
                            }}
                            style={{ width: '100%', height: '300px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', fontFamily: 'monospace' }}
                       />
                       <button onClick={handleConfigSave} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <Save size={18} /> Save Config
                       </button>
                   </div>
              </div>
          )}
          
          {activeTab === 'catalogues' && (
              <div>
                   <h3 style={{marginBottom:'1rem'}}>Catalogues</h3>
                    <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px' }}>
                       <textarea 
                            value={JSON.stringify(siteConfig.catalogues || [], null, 2)}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    setSiteConfig({...siteConfig, catalogues: parsed});
                                } catch(err) {} 
                            }}
                            style={{ width: '100%', height: '300px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', fontFamily: 'monospace' }}
                       />
                       <button onClick={handleConfigSave} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <Save size={18} /> Save Config
                       </button>
                   </div>
              </div>
          )}
      </div>
    </div>
    </DashboardLayout>
  );
};

export default WebsiteSettings;
