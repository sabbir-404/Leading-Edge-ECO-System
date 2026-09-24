import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  X, ChevronLeft, ChevronRight, CheckCircle2, Sparkles, 
  Compass, Lightbulb, ArrowRight 
} from 'lucide-react';
import { MAKE_TUTORIAL_STEPS } from './tutorialSteps';
import { 
  getTutorialStatus, 
  setTutorialStatus, 
  consumeTutorialReplay 
} from './tutorialState';
import './MakeTutorial.css';

interface MakeTutorialProps {
  userId?: string | number | null;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export const MakeTutorial: React.FC<MakeTutorialProps> = ({ userId }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [active, setActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [elementMissingFallback, setElementMissingFallback] = useState(false);

  const step = MAKE_TUTORIAL_STEPS[currentStepIndex] || MAKE_TUTORIAL_STEPS[0];
  const totalSteps = MAKE_TUTORIAL_STEPS.length;
  const pollTimerRef = useRef<any>(null);

  // 1. Initial Launch Check (first-time or replay requested)
  useEffect(() => {
    const isMakeRoute = location.pathname.startsWith('/make');
    const status = getTutorialStatus(userId);

    if (status === 'replay_requested') {
      // If not yet on MAKE Dashboard, wait until navigated/reloaded to Dashboard before starting
      if (location.pathname !== MAKE_TUTORIAL_STEPS[0].route) {
        return;
      }
      // Replay was triggered from settings -> start tour directly from Dashboard
      setCurrentStepIndex(0);
      setShowWelcome(false);
      setActive(true);
      return;
    }

    if (isMakeRoute && status === 'unseen' && !active && !showWelcome) {
      setShowWelcome(true);
    }
  }, [location.pathname, userId]);

  // 2. Locate DOM element for the current step with retries
  const locateTarget = useCallback((targetSelector: string) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    let attempts = 0;
    const maxAttempts = 25; // 25 * 100ms = 2.5 seconds timeout

    const checkElement = () => {
      attempts++;
      const el = document.querySelector(targetSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Ensure element is visible with non-zero dimensions
        if (rect.width > 0 && rect.height > 0) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setIsNavigating(false);
          setElementMissingFallback(false);
          consumeTutorialReplay(userId);

          // Scroll smoothly to target if partially outside viewport
          if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          // Small delay for scroll finish before re-measuring rect
          setTimeout(() => {
            const finalRect = el.getBoundingClientRect();
            setTargetRect({
              top: finalRect.top + window.scrollY,
              left: finalRect.left + window.scrollX,
              width: finalRect.width,
              height: finalRect.height,
              bottom: finalRect.bottom + window.scrollY,
              right: finalRect.right + window.scrollX
            });
          }, 150);
          return;
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setIsNavigating(false);
        setElementMissingFallback(true);
        setTargetRect(null);
        consumeTutorialReplay(userId);
        console.warn(`[MakeTutorial] Target element not found after 2.5s: "${targetSelector}" on route "${location.pathname}". Falling back to controlled center display.`);
      }
    };

    pollTimerRef.current = setInterval(checkElement, 100);
    checkElement();
  }, [location.pathname, userId]);

  // 3. Coordinate navigation and target location whenever step or route changes
  useEffect(() => {
    if (!active) return;

    const currentStep = MAKE_TUTORIAL_STEPS[currentStepIndex];
    if (!currentStep) return;

    if (location.pathname !== currentStep.route) {
      setIsNavigating(true);
      setTargetRect(null);
      navigate(currentStep.route);
    } else {
      locateTarget(currentStep.target);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [active, currentStepIndex, location.pathname, locateTarget, navigate]);

  // Handle window resizing to keep spotlight and tooltip accurately positioned
  useEffect(() => {
    if (!active || !targetRect) return;

    const handleResize = () => {
      const currentStep = MAKE_TUTORIAL_STEPS[currentStepIndex];
      if (currentStep) {
        const el = document.querySelector(currentStep.target);
        if (el) {
          const r = el.getBoundingClientRect();
          setTargetRect({
            top: r.top + window.scrollY,
            left: r.left + window.scrollX,
            width: r.width,
            height: r.height,
            bottom: r.bottom + window.scrollY,
            right: r.right + window.scrollX
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [active, currentStepIndex, targetRect]);

  // Step Actions
  const handleStartTour = () => {
    setShowWelcome(false);
    setCurrentStepIndex(0);
    setActive(true);
    if (location.pathname !== MAKE_TUTORIAL_STEPS[0].route) {
      navigate(MAKE_TUTORIAL_STEPS[0].route);
    }
  };

  const handleSkipTour = () => {
    consumeTutorialReplay(userId);
    setTutorialStatus(userId, 'skipped');
    setActive(false);
    setShowWelcome(false);
  };

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Completed all steps
      setTutorialStatus(userId, 'completed');
      setActive(false);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  // Compute Tooltip Card Position with Clamping (Responsive for 800px+)
  const computeTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || elementMissingFallback) {
      return {};
    }

    const cardWidth = 440;
    const cardHeightEst = 260;
    const gap = 14;

    // Viewport dimensions
    const vpWidth = window.innerWidth;
    const vpHeight = window.innerHeight;

    // Horizontal centering relative to target, clamped to screen edges
    const idealLeft = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);
    const clampedLeft = Math.max(16, Math.min(idealLeft, vpWidth - cardWidth - 16));

    // Vertical placement: prefer below, flip above if overflowing bottom
    const spaceBelow = vpHeight - (targetRect.bottom - window.scrollY);
    const placeAbove = spaceBelow < cardHeightEst + gap && (targetRect.top - window.scrollY) > cardHeightEst + gap;

    const top = placeAbove 
      ? Math.max(16, targetRect.top - cardHeightEst - gap) 
      : targetRect.bottom + gap;

    return {
      top: `${top}px`,
      left: `${clampedLeft}px`,
      position: 'absolute'
    };
  };

  // Render Welcome Prompt Dialog
  if (showWelcome) {
    return (
      <div className="make-tutorial-overlay">
        <div className="make-tutorial-backdrop" />
        <div className="make-tutorial-modal-center">
          <div className="make-tutorial-header">
            <div className="make-tutorial-badge">
              <Sparkles size={14} /> MAKE Module Onboarding
            </div>
            <button className="make-tutorial-close-btn" onClick={handleSkipTour} title="Close">
              <X size={18} />
            </button>
          </div>

          <h3 className="make-tutorial-title">Welcome to the MAKE Module!</h3>
          <p className="make-tutorial-desc">
            Take a quick guided interactive tour covering the 8 essential manufacturing tools: 
            Dashboard metrics, Product Catalog &amp; Categories, Intelligent Search, Order Placement, 
            Attachments, 8-Stage Production Progression, and Customer Ledgers.
          </p>

          <div className="make-tutorial-details">
            <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '4px' }}>Tour Highlights:</strong>
            • The tour automatically navigates between MAKE pages.<br />
            • No business data or orders will be modified.<br />
            • You can replay this walkthrough anytime from Settings.
          </div>

          <div className="make-tutorial-footer">
            <button className="make-tutorial-btn make-tutorial-btn-ghost" onClick={handleSkipTour}>
              Skip for now
            </button>
            <div className="make-tutorial-actions">
              <button className="make-tutorial-btn make-tutorial-btn-primary" onClick={handleStartTour}>
                Start Tour <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!active) return null;

  return (
    <div className="make-tutorial-overlay">
      <div className="make-tutorial-backdrop" onClick={handleSkipTour} />

      {/* Loading banner while transitioning between routes */}
      {isNavigating && (
        <div className="make-tutorial-navigating">
          <div className="make-tutorial-spinner" />
          Navigating to {step.title}...
        </div>
      )}

      {/* Spotlight cutout highlight */}
      {targetRect && !elementMissingFallback && (
        <div 
          className="make-tutorial-spotlight"
          style={{
            top: `${Math.max(0, targetRect.top - 6)}px`,
            left: `${Math.max(0, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`
          }}
        />
      )}

      {/* Tooltip or Centered Fallback Card */}
      <div 
        className={elementMissingFallback ? 'make-tutorial-modal-center' : 'make-tutorial-card'}
        style={computeTooltipStyle()}
      >
        <div className="make-tutorial-header">
          <div className="make-tutorial-badge">
            <Compass size={13} /> {step.badge}
          </div>
          <button className="make-tutorial-close-btn" onClick={handleSkipTour} title="Skip Tutorial">
            <X size={16} />
          </button>
        </div>

        <h3 className="make-tutorial-title">{step.title}</h3>
        <p className="make-tutorial-desc">{step.description}</p>

        <div className="make-tutorial-details">
          {step.details}
        </div>

        {step.tips && (
          <div className="make-tutorial-tips">
            <Lightbulb size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{step.tips}</span>
          </div>
        )}

        <div className="make-tutorial-footer">
          {/* Progress dots indicator */}
          <div className="make-tutorial-dots">
            {MAKE_TUTORIAL_STEPS.map((_, i) => (
              <div 
                key={i} 
                className={`make-tutorial-dot ${i === currentStepIndex ? 'active' : ''}`} 
              />
            ))}
          </div>

          {/* Navigation Controls */}
          <div className="make-tutorial-actions">
            <button 
              className="make-tutorial-btn make-tutorial-btn-secondary"
              onClick={handleBack}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft size={15} /> Back
            </button>

            {currentStepIndex < totalSteps - 1 ? (
              <button 
                className="make-tutorial-btn make-tutorial-btn-primary"
                onClick={handleNext}
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button 
                className="make-tutorial-btn make-tutorial-btn-primary"
                onClick={handleNext}
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                Finish <CheckCircle2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MakeTutorial;
