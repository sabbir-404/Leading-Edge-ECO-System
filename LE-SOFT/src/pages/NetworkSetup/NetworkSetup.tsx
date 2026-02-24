import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Monitor, Globe, Shield, RefreshCw, CheckCircle, AlertCircle, Copy, HelpCircle } from 'lucide-react';

const NetworkSetup: React.FC = () => {
  const [mode, setMode] = useState<'server' | 'client' | ''>('');
  const [serverAddress, setServerAddress] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [port, setPort] = useState(3456);
  const [localIp, setLocalIp] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Get local IP for server mode display
    (window as any).electron.getLocalIp().then((ip: string) => setLocalIp(ip));
  }, []);

  const handleTestConnection = async () => {
    setStatus('testing');
    setErrorMsg('');
    try {
      const result = await (window as any).electron.testServerConnection({ 
        address: serverAddress, 
        apiKey: secretKey, 
        port 
      });
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(result.message || 'Could not reach server. Check IP and Secret Key.');
      }
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e.message || 'Connection failed.');
    }
  };

  const handleSave = async () => {
    try {
      const config = {
        mode,
        serverAddress: mode === 'server' ? 'localhost' : serverAddress,
        port,
        apiKey: mode === 'client' ? secretKey : '' // Server generates its own on backend
      };
      await (window as any).electron.saveNetworkConfig(config);
      // Restart app to apply changes
      (window as any).electron.restartApp();
    } catch (e: any) {
      setErrorMsg('Failed to save configuration.');
    }
  };

  const copyIp = () => {
    navigator.clipboard.writeText(localIp);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 font-['Inter']">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl relative overflow-hidden"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            Network Setup
          </h1>
          <p className="text-gray-400">Choose how this computer will connect to the database</p>
        </div>

        {!mode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ModeCard 
              icon={<Server className="w-8 h-8 text-blue-400" />}
              title="Main Computer (Server)"
              description="Hosts the database. Other computers will connect to this one."
              onClick={() => setMode('server')}
            />
            <ModeCard 
              icon={<Monitor className="w-8 h-8 text-cyan-400" />}
              title="Workstation (Client)"
              description="Connects to a main computer over LAN or Internet."
              onClick={() => setMode('client')}
            />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {mode === 'server' ? (
              <motion.div 
                key="server-setup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-4">
                  <Shield className="w-6 h-6 text-blue-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-400">Server Mode Active</p>
                    <p className="text-sm text-gray-400 line-clamp-2">The database will be stored locally. An auto-generated Secret Key will be created upon saving. You will need to share your IP and that key with workstations.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
                      Your Local IP Address <HelpCircle className="w-3.5 h-3.5 opacity-50" />
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-gray-300 font-mono">
                        {localIp}
                      </div>
                      <button 
                        onClick={copyIp}
                        className="p-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                        title="Copy IP"
                      >
                        <Copy className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setMode('')} className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 transition-colors">
                    Back
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex-[2] px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-600/20"
                  >
                    Set as Main Computer
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="client-setup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Server Address</label>
                    <div className="relative">
                      < Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                        type="text" 
                        placeholder="Local IP (e.g. 192.168.1.5) or Public Address" 
                        value={serverAddress}
                        onChange={(e) => setServerAddress(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Shared Secret Key</label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                        type="password" 
                        placeholder="Enter the key from the main computer" 
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      />
                    </div>
                  </div>
                </div>

                {status === 'error' && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 text-red-400 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {status === 'success' && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex gap-3 text-emerald-400 text-sm">
                    <CheckCircle className="w-5 h-5 shrink-0" />
                    <span>Connection successful! You can now save and continue.</span>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setMode('')} className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 transition-colors">
                    Back
                  </button>
                  {status !== 'success' ? (
                    <button 
                      onClick={handleTestConnection}
                      disabled={!serverAddress || !secretKey || status === 'testing'}
                      className="flex-[2] px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {status === 'testing' ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Test Connection'}
                    </button>
                  ) : (
                    <button 
                      onClick={handleSave}
                      className="flex-[2] px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-semibold hover:from-cyan-500 hover:to-cyan-400 transition-all shadow-lg shadow-cyan-600/20"
                    >
                      Save & Continue
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
};

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ icon, title, description, onClick }) => (
  <button 
    onClick={onClick}
    className="bg-white/5 border border-white/10 rounded-xl p-6 text-left hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all group relative overflow-hidden"
  >
    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-white/10 transition-colors" />
    <div className="mb-4">{icon}</div>
    <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
    <p className="text-sm text-gray-400 line-clamp-2">{description}</p>
  </button>
);

export default NetworkSetup;
