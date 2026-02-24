import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Mail, Send, Users, CheckCircle } from 'lucide-react';

const AdminNewsletter: React.FC = () => {
  const { users, sendNewsletter, newsletters } = useShop();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  const customerCount = users.filter(u => u.role === 'customer').length;

  const handleSend = () => {
    if (!subject || !content) return;
    setIsSending(true);
    
    // Simulate API call
    setTimeout(() => {
      sendNewsletter({
        id: `news-${Date.now()}`,
        subject,
        content,
        sentDate: new Date().toISOString().split('T')[0],
        recipientCount: customerCount,
        status: 'Sent'
      });
      setIsSending(false);
      setSubject('');
      setContent('');
      alert('Newsletter sent successfully!');
    }, 1500);
  };

  return (
    <div className="space-y-8">
       <h1 className="text-3xl font-bold text-gray-800">Newsletter Management</h1>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Compose Section */}
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Mail className="text-accent" /> Compose Email</h2>
                
                <div className="space-y-4">
                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Campaign Subject</label>
                      <input 
                        className="w-full border p-3 rounded-lg" 
                        placeholder="e.g. Big Spring Sale!" 
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                      />
                   </div>
                   
                   <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <Users size={20} className="text-gray-500" />
                         <span className="text-sm font-medium text-gray-700">Recipients</span>
                      </div>
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">{customerCount} Customers</span>
                   </div>

                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Email Content</label>
                      <textarea 
                        className="w-full border p-3 rounded-lg h-64 font-mono text-sm" 
                        placeholder="Write your newsletter content here (HTML supported in real implementation)..."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                      />
                   </div>

                   <div className="flex justify-end pt-4">
                      <button 
                        onClick={handleSend}
                        disabled={isSending || !subject || !content}
                        className="bg-accent text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                      >
                         {isSending ? 'Sending...' : <><Send size={18} /> Send Bulk Email</>}
                      </button>
                   </div>
                </div>
             </div>
          </div>

          {/* History Sidebar */}
          <div className="lg:col-span-1">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-lg mb-6">Campaign History</h3>
                
                <div className="space-y-4">
                   {newsletters.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">No campaigns sent yet.</p>
                   ) : (
                      newsletters.map(campaign => (
                         <div key={campaign.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start mb-1">
                               <h4 className="font-bold text-gray-800 text-sm line-clamp-1">{campaign.subject}</h4>
                               <span className="text-[10px] text-gray-400">{campaign.sentDate}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                               <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle size={10} /> {campaign.status}</span>
                               <span className="text-gray-500">{campaign.recipientCount} sent</span>
                            </div>
                         </div>
                      ))
                   )}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};

export default AdminNewsletter;