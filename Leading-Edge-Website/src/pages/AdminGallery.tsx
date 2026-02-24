
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { GalleryImage, ImageReference } from '../types';
import { Search, Upload, X, Copy, Image as ImageIcon, Loader, Info, Trash2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';

const AdminGallery: React.FC = () => {
  const { showToast } = useShop();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [imageUsage, setImageUsage] = useState<ImageReference[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const data = await api.getImages();
      setImages(data);
    } catch (e: any) {
      showToast('Failed to load gallery: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  useEffect(() => {
    if (selectedImage) {
        setUsageLoading(true);
        api.getImageUsage(selectedImage.url)
           .then(refs => setImageUsage(refs))
           .catch(() => setImageUsage([]))
           .finally(() => setUsageLoading(false));
    }
  }, [selectedImage]);

  const handleFileUpload = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      
      const promises = Array.from(files).map(file => api.uploadImage(file));
      
      try {
          await Promise.all(promises);
          showToast(`${files.length} images uploaded successfully`, 'success');
          fetchImages();
      } catch (e: any) {
          showToast('Upload failed: ' + e.message, 'error');
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
  };

  const handleDragLeave = () => {
      setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFileUpload(e.dataTransfer.files);
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      showToast('Link copied to clipboard', 'info');
  };

  const filteredImages = images.filter(img => img.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Media Gallery</h1>
      </div>

      {/* Upload Zone */}
      <div 
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${isDragOver ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
         <Upload className={`mb-4 ${isDragOver ? 'text-accent' : 'text-gray-400'}`} size={40} />
         <p className="text-gray-600 font-medium">Drag & Drop images here, or click to upload</p>
         <p className="text-gray-400 text-sm mt-1">Supports JPG, PNG, WEBP</p>
         <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="image/*" 
            onChange={(e) => handleFileUpload(e.target.files)} 
         />
      </div>

      {/* Filter Bar */}
      <div className="relative">
         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
         <input 
            className="w-full border rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent"
            placeholder="Search by filename..."
            value={search}
            onChange={e => setSearch(e.target.value)}
         />
      </div>

      {/* Gallery Grid */}
      {loading ? (
          <div className="flex items-center justify-center py-20"><Loader className="animate-spin text-accent" size={32} /></div>
      ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
             {filteredImages.map((img, idx) => (
                 <div 
                    key={idx} 
                    className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200 cursor-pointer group relative hover:shadow-lg transition-all"
                    onClick={() => setSelectedImage(img)}
                 >
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                        <p className="text-white text-xs truncate w-full font-medium">{img.name}</p>
                        <p className="text-gray-300 text-[10px] truncate w-full">{(img.size / 1024).toFixed(1)} KB</p>
                    </div>
                 </div>
             ))}
          </div>
      )}

      {/* Image Detail Modal */}
      {selectedImage && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]" onClick={e => e.stopPropagation()}>
                  
                  {/* Image View */}
                  <div className="flex-1 bg-gray-100 flex items-center justify-center p-4 min-h-[300px]">
                      <img src={selectedImage.url} className="max-w-full max-h-[70vh] object-contain shadow-lg rounded" />
                  </div>

                  {/* Details Panel */}
                  <div className="w-full md:w-96 bg-white border-l p-6 overflow-y-auto">
                      <div className="flex justify-between items-start mb-6">
                          <div>
                              <h3 className="font-bold text-lg text-gray-800 break-all">{selectedImage.name}</h3>
                              <p className="text-xs text-gray-500 mt-1">Uploaded: {new Date(selectedImage.date).toLocaleDateString()}</p>
                          </div>
                          <button onClick={() => setSelectedImage(null)} className="text-gray-400 hover:text-gray-600"><X /></button>
                      </div>

                      <div className="space-y-6">
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Public Link</label>
                              <div className="flex gap-2 mt-1">
                                  <input readOnly value={selectedImage.url} className="w-full text-sm border p-2 rounded bg-gray-50 text-gray-600" />
                                  <button onClick={() => copyToClipboard(selectedImage.url)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-600" title="Copy">
                                      <Copy size={16} />
                                  </button>
                              </div>
                          </div>

                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Storage Location</label>
                              <p className="text-sm mt-1 flex items-center gap-2"><ImageIcon size={14}/> {selectedImage.folder}</p>
                          </div>

                          <div className="border-t pt-4">
                              <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Usage References</label>
                              {usageLoading ? (
                                  <p className="text-sm text-gray-400">Checking usage...</p>
                              ) : imageUsage.length > 0 ? (
                                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                                      {imageUsage.map((ref, i) => (
                                          <li key={i} className="text-sm bg-gray-50 p-2 rounded border border-gray-100 flex items-start gap-2">
                                              <Info size={14} className="mt-0.5 text-blue-500 shrink-0" />
                                              <div>
                                                  <span className="font-bold text-gray-700">{ref.type}: </span>
                                                  <span className="text-gray-600">{ref.name}</span>
                                              </div>
                                          </li>
                                      ))}
                                  </ul>
                              ) : (
                                  <p className="text-sm text-gray-400 italic">No usage found in database.</p>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminGallery;
