
import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Mail, Send, Users, CheckCircle, Code, List } from 'lucide-react';

const AdminNewsletter: React.FC = () => {
  const { users, sendNewsletter, newsletters } = useShop();
  
  // 'campaign' = database users, 'bulk_candidates' = manual list
  const [mode, setMode] = useState<'campaign' | 'bulk_candidates'>('campaign');
  
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [manualRecipients, setManualRecipients] = useState('');
  const [isSending, setIsSending] = useState(false);

  const customerCount = users.filter(u => u.role === 'customer').length;

  const handleSend = () => {
    if (!subject || !content) return;
    if (mode === 'bulk_candidates' && !manualRecipients) return;

    setIsSending(true);
    
    // Simulate API call
    setTimeout(() => {
      sendNewsletter({
        id: `news-${Date.now()}`,
        subject,
        content,
        sentDate: new Date().toISOString().split('T')[0],
        recipientCount: mode === 'campaign' ? customerCount : manualRecipients.split(',').length,
        status: 'Sent',
        // @ts-ignore - Adding extra props to payload that context might not strictly type yet, but API will accept
        type: mode,
        manualRecipients: mode === 'bulk_candidates' ? manualRecipients : undefined
      });
      setIsSending(false);
      setSubject('');
      setContent('');
      setManualRecipients('');
      alert(mode === 'campaign' ? 'Campaign sent successfully!' : 'Bulk emails sent successfully!');
    }, 1500);
  };

  return (
    <div className="space-y-8">
       <div className="flex justify-between items-center">
           <h1 className="text-3xl font-bold text-gray-800">Email & Marketing</h1>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Compose Section */}
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Mail className="text-accent" /> Compose Email</h2>
                
                {/* Mode Selector */}
                <div className="flex gap-4 mb-6 bg-gray-50 p-2 rounded-lg">
                    <button 
                        onClick={() => setMode('campaign')}
                        className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${mode === 'campaign' ? 'bg-white shadow text-accent' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Marketing Campaign
                    </button>
                    <button 
                        onClick={() => setMode('bulk_candidates')}
                        className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${mode === 'bulk_candidates' ? 'bg-white shadow text-accent' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Bulk Email (Candidates)
                    </button>
                </div>

                <div className="space-y-4">
                   {mode === 'campaign' ? (
                       <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <Users size={20} className="text-blue-600" />
                             <span className="text-sm font-medium text-blue-800">Target Audience</span>
                          </div>
                          <span className="bg-white text-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">{customerCount} Registered Customers</span>
                       </div>
                   ) : (
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                               <List size={14} /> Recipient List (Candidates)
                           </label>
                           <textarea 
                               className="w-full border p-3 rounded-lg h-24 text-sm font-mono"
                               placeholder="candidate1@example.com, candidate2@example.com, ..."
                               value={manualRecipients}
                               onChange={e => setManualRecipients(e.target.value)}
                           />
                           <p className="text-xs text-gray-500 mt-1">Separate emails with commas or new lines.</p>
                       </div>
                   )}

                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Subject Line</label>
                      <input 
                        className="w-full border p-3 rounded-lg" 
                        placeholder={mode === 'campaign' ? "e.g. Big Spring Sale!" : "e.g. Interview Invitation"} 
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                      />
                   </div>

                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                          Email Content
                          <span className="text-[10px] font-normal text-gray-400 flex items-center gap-1 border border-gray-300 px-2 py-0.5 rounded">
                              <Code size={10} /> HTML Supported
                          </span>
                      </label>
                      <textarea 
                        className="w-full border p-3 rounded-lg h-64 font-mono text-sm" 
                        placeholder="<html><body><h1>Hello!</h1><p>Write your content here...</p></body></html>"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                      />
                   </div>

                   <div className="flex justify-end pt-4">
                      <button 
                        onClick={handleSend}
                        disabled={isSending || !subject || !content || (mode === 'bulk_candidates' && !manualRecipients)}
                        className="bg-accent text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                      >
                         {isSending ? 'Sending...' : <><Send size={18} /> {mode === 'campaign' ? 'Send Campaign' : 'Send Bulk Emails'}</>}
                      </button>
                   </div>
                </div>
             </div>
          </div>

          {/* History Sidebar */}
          <div className="lg:col-span-1">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-lg mb-6">History</h3>
                
                <div className="space-y-4">
                   {newsletters.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">No emails sent yet.</p>
                   ) : (
                      newsletters.map(campaign => (
                         <div key={campaign.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start mb-1">
                               <h4 className="font-bold text-gray-800 text-sm line-clamp-1">{campaign.subject}</h4>
                               <span className="text-[10px] text-gray-400">{campaign.sentDate}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                               <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle size={10} /> {campaign.status}</span>
                               <span className="text-gray-500">{campaign.recipientCount} recipients</span>
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
