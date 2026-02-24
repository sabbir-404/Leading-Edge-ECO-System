import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { Save } from 'lucide-react';
import { HeaderFooterConfig } from '../types';

const AdminHeaderFooter: React.FC = () => {
  const { siteConfig, updateSiteConfig } = useShop();
  const [config, setConfig] = useState<HeaderFooterConfig>({
      logoUrl: '', phone: '', email: '', address: '',
      facebookUrl: '', instagramUrl: '', twitterUrl: '', youtubeUrl: '',
      copyrightText: ''
  });

  useEffect(() => {
      if (siteConfig.headerFooter) {
          setConfig(siteConfig.headerFooter);
      }
  }, [siteConfig]);

  const handleChange = (field: keyof HeaderFooterConfig, value: string) => {
      setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
      updateSiteConfig({ ...siteConfig, headerFooter: config });
  };

  return (
    <div className="max-w-4xl">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Header & Footer Settings</h1>
            <button 
                onClick={handleSave}
                className="bg-green-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-green-700 font-bold shadow-lg"
            >
                <Save size={20} /> Save Settings
            </button>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                    <h3 className="text-xl font-bold mb-4 border-b pb-2">Branding</h3>
                    <label className="block text-sm font-bold mb-2">Logo URL</label>
                    <div className="flex gap-4">
                        <div className="w-16 h-16 bg-black rounded flex items-center justify-center flex-shrink-0">
                            {config.logoUrl && <img src={config.logoUrl} className="w-12 h-auto" />}
                        </div>
                        <input className="w-full border p-3 rounded" value={config.logoUrl} onChange={e => handleChange('logoUrl', e.target.value)} />
                    </div>
                </div>

                <div className="col-span-2 md:col-span-1">
                    <h3 className="text-xl font-bold mb-4 border-b pb-2">Contact Info (Footer)</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold mb-1">Phone Number</label>
                            <input className="w-full border p-2 rounded" value={config.phone} onChange={e => handleChange('phone', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Email Address</label>
                            <input className="w-full border p-2 rounded" value={config.email} onChange={e => handleChange('email', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Physical Address</label>
                            <textarea className="w-full border p-2 rounded" value={config.address} onChange={e => handleChange('address', e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="col-span-2 md:col-span-1">
                    <h3 className="text-xl font-bold mb-4 border-b pb-2">Social Media Links</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold mb-1">Facebook URL</label>
                            <input className="w-full border p-2 rounded" value={config.facebookUrl} onChange={e => handleChange('facebookUrl', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Instagram URL</label>
                            <input className="w-full border p-2 rounded" value={config.instagramUrl} onChange={e => handleChange('instagramUrl', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Twitter URL</label>
                            <input className="w-full border p-2 rounded" value={config.twitterUrl} onChange={e => handleChange('twitterUrl', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">YouTube URL</label>
                            <input className="w-full border p-2 rounded" value={config.youtubeUrl} onChange={e => handleChange('youtubeUrl', e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="col-span-2">
                    <h3 className="text-xl font-bold mb-4 border-b pb-2">Legal</h3>
                    <label className="block text-sm font-bold mb-1">Copyright Text</label>
                    <input className="w-full border p-2 rounded" value={config.copyrightText} onChange={e => handleChange('copyrightText', e.target.value)} />
                </div>
            </div>
        </div>
    </div>
  );
};

export default AdminHeaderFooter;