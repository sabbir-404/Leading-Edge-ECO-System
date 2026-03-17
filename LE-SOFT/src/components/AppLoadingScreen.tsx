import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './AppLoadingScreen.css';

interface LoadStep {
  step: string;
  progress: number;
  total: number;
}

interface Props {
  onReady: () => void;
}

export default function AppLoadingScreen({ onReady }: Props) {
  const [currentStep, setCurrentStep] = useState('Preparing...');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(7);
  const [done, setDone] = useState(false);
  const calledRef = useRef(false);

  useEffect(() => {
    const electron = (window as any).electron;

    // Listen for progress events from cache-manager
    const unsubscribe = electron.onCacheProgress?.((data: LoadStep) => {
      setCurrentStep(data.step);
      setProgress(data.progress);
      setTotal(data.total);

      if (data.step === 'Ready' || data.progress >= data.total) {
        setTimeout(() => {
          setDone(true);
          setTimeout(() => onReady(), 600); // let exit animation play
        }, 300);
      }
    });

    // Trigger preload
    electron.preloadCache?.().then((_res: any) => {
      if (!calledRef.current) {
        calledRef.current = true;
        setDone(true);
        setTimeout(() => onReady(), 600);
      }
    }).catch(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        setDone(true);
        setTimeout(() => onReady(), 300);
      }
    });

    return () => unsubscribe?.();
  }, [onReady]);

  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="app-loading-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="loading-card"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            {/* Logo */}
            <div className="loading-logo">
              <span className="logo-text">LE</span>
            </div>
            <h1 className="loading-title">
              LE<span className="accent">SOFT</span>
            </h1>
            <p className="loading-tagline">Setting up your workspace</p>

            {/* Progress bar */}
            <div className="progress-track">
              <motion.div
                className="progress-fill"
                initial={{ width: '0%' }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            {/* Step info */}
            <div className="loading-meta">
              <span className="loading-step">{currentStep}</span>
              <span className="loading-pct">{pct}%</span>
            </div>

            {/* Dots animation */}
            <div className="dots">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="dot"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                />
              ))}
            </div>

            <p className="security-note">
              🔐 Encrypting your session data
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
