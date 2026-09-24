import { describe, it, expect, beforeEach } from 'vitest';
import { MAKE_TUTORIAL_STEPS } from '../../src/components/tutorial/tutorialSteps';
import {
    getTutorialStatus,
    setTutorialStatus,
    requestTutorialReplay,
    consumeTutorialReplay,
    shouldShowTutorial,
    resetTutorial
} from '../../src/components/tutorial/tutorialState';

const store: Record<string, string> = {};
const mockLocalStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = String(val); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); })
};
vi.stubGlobal('localStorage', mockLocalStorage);

describe('MAKE V1.2 — Tutorial Controller & State Machine Tests', () => {
    beforeEach(() => {
        mockLocalStorage.clear();
        vi.clearAllMocks();
    });

    // ── 1. CANONICAL STEP DEFINITIONS & ROUTE MAPPINGS ────────────────────────
    describe('1. Canonical Step Definitions & Route Targets', () => {
        it('defines exactly 8 canonical tutorial steps in sequential order', () => {
            expect(MAKE_TUTORIAL_STEPS.length).toBe(8);
            MAKE_TUTORIAL_STEPS.forEach((step, idx) => {
                expect(step.stepNumber).toBe(idx + 1);
                expect(step.badge).toBe(`Step ${idx + 1} of 8`);
                expect(step.id).toBeDefined();
                expect(step.title).toBeDefined();
                expect(step.description).toBeDefined();
                expect(step.details).toBeDefined();
                expect(step.target).toMatch(/^\[data-tutorial="[\w-]+"]$/);
            });
        });

        it('maps every tutorial step to a verified application route', () => {
            const expectedMappings = [
                { step: 1, id: 'dashboard', route: '/make/dashboard', target: '[data-tutorial="make-dashboard"]' },
                { step: 2, id: 'product-catalog', route: '/make/products', target: '[data-tutorial="make-product-catalog"]' },
                { step: 3, id: 'product-search', route: '/make/place-order', target: '[data-tutorial="make-product-search"]' },
                { step: 4, id: 'place-order', route: '/make/place-order', target: '[data-tutorial="make-place-order"]' },
                { step: 5, id: 'invoice-attachments', route: '/make/place-order', target: '[data-tutorial="make-invoice-attachments"]' },
                { step: 6, id: 'track-orders', route: '/make/track', target: '[data-tutorial="make-track-orders"]' },
                { step: 7, id: 'production-stages', route: '/make/track', target: '[data-tutorial="make-production-stages"]' },
                { step: 8, id: 'customer-ledger', route: '/crm/ledger', target: '[data-tutorial="make-customer-ledger"]' }
            ];

            expectedMappings.forEach(expected => {
                const actual = MAKE_TUTORIAL_STEPS[expected.step - 1];
                expect(actual.id).toBe(expected.id);
                expect(actual.route).toBe(expected.route);
                expect(actual.target).toBe(expected.target);
            });
        });

        it('has valid stable data-tutorial attributes rather than volatile class names', () => {
            MAKE_TUTORIAL_STEPS.forEach(step => {
                expect(step.target).toContain('data-tutorial');
                expect(step.target).not.toContain('.'); // No volatile css classes
                expect(step.target).not.toContain('#'); // No arbitrary IDs
            });
        });
    });

    // ── 2. STATE TRANSITIONS & LIFECYCLE ──────────────────────────────────────
    describe('2. Tutorial State Machine & Replay Consumption', () => {
        it('reports "unseen" for new first-time users and recommends tutorial', () => {
            expect(getTutorialStatus('user_101')).toBe('unseen');
            expect(shouldShowTutorial('user_101')).toBe(true);
        });

        it('persists "skipped" state when user dismisses the tutorial', () => {
            setTutorialStatus('user_101', 'skipped');
            expect(getTutorialStatus('user_101')).toBe('skipped');
            expect(shouldShowTutorial('user_101')).toBe(false);
        });

        it('persists "completed" state when user finishes all 8 steps', () => {
            setTutorialStatus('user_101', 'completed');
            expect(getTutorialStatus('user_101')).toBe('completed');
            expect(shouldShowTutorial('user_101')).toBe(false);
        });

        it('handles replay request and strictly consumes it once to prevent reload loops', () => {
            const uid = 'user_101';
            // User previously finished tutorial
            setTutorialStatus(uid, 'completed');
            expect(getTutorialStatus(uid)).toBe('completed');

            // User triggers Replay in Settings
            requestTutorialReplay(uid);
            expect(getTutorialStatus(uid)).toBe('replay_requested');
            expect(shouldShowTutorial(uid)).toBe(true);

            // Tutorial controller initializes and consumes the replay request
            const consumedFirst = consumeTutorialReplay(uid);
            expect(consumedFirst).toBe(true);

            // Replay flag is now removed, state falls back to underlying completed status
            expect(getTutorialStatus(uid)).toBe('completed');

            // Subsequent consumption attempt returns false (zero infinite loop)
            const consumedSecond = consumeTutorialReplay(uid);
            expect(consumedSecond).toBe(false);
        });

        it('cleans up properly on resetTutorial', () => {
            const uid = 'user_200';
            setTutorialStatus(uid, 'completed');
            requestTutorialReplay(uid);

            resetTutorial(uid);
            expect(getTutorialStatus(uid)).toBe('unseen');
            expect(shouldShowTutorial(uid)).toBe(true);
        });
    });

    // ── 3. USER ISOLATION ─────────────────────────────────────────────────────
    describe('3. Per-User State Isolation', () => {
        it('isolates completion status between different users', () => {
            const userA = 'user_alice_1';
            const userB = 'user_bob_2';

            setTutorialStatus(userA, 'completed');
            setTutorialStatus(userB, 'skipped');

            expect(getTutorialStatus(userA)).toBe('completed');
            expect(getTutorialStatus(userB)).toBe('skipped');
            expect(getTutorialStatus('user_charlie_3')).toBe('unseen');
        });

        it('isolates replay requests so User A does not trigger tutorial for User B', () => {
            const userA = 'user_alice_1';
            const userB = 'user_bob_2';

            setTutorialStatus(userA, 'completed');
            setTutorialStatus(userB, 'completed');

            requestTutorialReplay(userA);

            expect(getTutorialStatus(userA)).toBe('replay_requested');
            expect(shouldShowTutorial(userA)).toBe(true);

            // User B is completely unaffected
            expect(getTutorialStatus(userB)).toBe('completed');
            expect(shouldShowTutorial(userB)).toBe(false);
        });
    });
});
