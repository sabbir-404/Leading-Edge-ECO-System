/**
 * MAKE Tutorial State Management
 *
 * Provides isolated per-user state storage for the MAKE onboarding walkthrough:
 * - 'unseen': First-time user, tutorial prompt should be offered upon entering MAKE.
 * - 'skipped': User chose to skip the walkthrough.
 * - 'completed': User finished all 8 steps of the tutorial.
 * - 'replay_requested': User clicked "Replay MAKE Tutorial" in Settings;
 *   flag is strictly consumed ONCE to avoid infinite reload/replay loops.
 */

export type TutorialStatus = 'unseen' | 'skipped' | 'completed' | 'replay_requested';

const STATUS_KEY_PREFIX = 'make_tutorial_status_';
const REPLAY_KEY_PREFIX = 'make_tutorial_replay_';

const resolveUserId = (userId?: string | number | null): string => {
  if (userId) return String(userId).trim();
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    if (stored.id) return String(stored.id);
    if (stored.username) return String(stored.username);
  } catch {}
  return 'default_user';
};

export const getTutorialStatus = (userId?: string | number | null): TutorialStatus => {
  try {
    const uid = resolveUserId(userId);
    const replayFlag = localStorage.getItem(`${REPLAY_KEY_PREFIX}${uid}`);
    if (replayFlag === 'true') {
      return 'replay_requested';
    }

    const stored = localStorage.getItem(`${STATUS_KEY_PREFIX}${uid}`);
    if (stored === 'skipped' || stored === 'completed') {
      return stored as TutorialStatus;
    }

    return 'unseen';
  } catch (e) {
    console.warn('[MakeTutorial] Failed to read tutorial state from localStorage:', e);
    return 'unseen';
  }
};

export const setTutorialStatus = (
  userId: string | number | null | undefined,
  status: 'unseen' | 'skipped' | 'completed'
): void => {
  try {
    const uid = resolveUserId(userId);
    localStorage.setItem(`${STATUS_KEY_PREFIX}${uid}`, status);
  } catch (e) {
    console.warn('[MakeTutorial] Failed to save tutorial state to localStorage:', e);
  }
};

export const requestTutorialReplay = (userId?: string | number | null): void => {
  try {
    const uid = resolveUserId(userId);
    localStorage.setItem(`${REPLAY_KEY_PREFIX}${uid}`, 'true');
  } catch (e) {
    console.warn('[MakeTutorial] Failed to request tutorial replay:', e);
  }
};

export const consumeTutorialReplay = (userId?: string | number | null): boolean => {
  try {
    const uid = resolveUserId(userId);
    const key = `${REPLAY_KEY_PREFIX}${uid}`;
    const wasRequested = localStorage.getItem(key) === 'true';
    if (wasRequested) {
      localStorage.removeItem(key);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[MakeTutorial] Failed to consume tutorial replay:', e);
    return false;
  }
};

export const shouldShowTutorial = (userId?: string | number | null): boolean => {
  const status = getTutorialStatus(userId);
  return status === 'unseen' || status === 'replay_requested';
};

export const resetTutorial = (userId?: string | number | null): void => {
  try {
    const uid = resolveUserId(userId);
    localStorage.removeItem(`${STATUS_KEY_PREFIX}${uid}`);
    localStorage.removeItem(`${REPLAY_KEY_PREFIX}${uid}`);
  } catch (e) {
    console.warn('[MakeTutorial] Failed to reset tutorial state:', e);
  }
};
