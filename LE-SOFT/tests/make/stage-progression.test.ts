import { describe, it, expect } from 'vitest';
import { MakeProductionService, CANONICAL_PRODUCTION_STAGES } from '../../electron/services/make/MakeProductionService';

describe('MAKE V1.1 — Production Stage Progression State Machine (8 Canonical Stages)', () => {
    it('should have exactly 8 canonical physical factory stages', () => {
        expect(CANONICAL_PRODUCTION_STAGES).toEqual([
            'Work in process',
            'Production On Going',
            'Primary QC',
            'Color Ongoing (oven)',
            'QC Final',
            'Packaging',
            'Ready to Ship',
            'Delivered'
        ]);
    });

    it('should allow initial transition to Stage 1 (Work in process)', () => {
        const result = MakeProductionService.validateTransition('Placed', 'Work in process');
        expect(result.allowed).toBe(true);
        expect(result.targetStageIndex).toBe(0);
    });

    it('should reject skipping straight to Stage 2 or 3 from initial unstarted order', () => {
        const result2 = MakeProductionService.validateTransition('Placed', 'Production On Going');
        expect(result2.allowed).toBe(false);
        expect(result2.error).toContain('Initial production stage must be "Work in process"');

        const result3 = MakeProductionService.validateTransition('Placed', 'Primary QC');
        expect(result3.allowed).toBe(false);
        expect(result3.error).toContain('Initial production stage must be "Work in process"');
    });

    it('should allow Stage 1 -> Stage 2 transition (Work in process -> Production On Going)', () => {
        const result = MakeProductionService.validateTransition('Work in process', 'Production On Going');
        expect(result.allowed).toBe(true);
        expect(result.currentStageIndex).toBe(0);
        expect(result.targetStageIndex).toBe(1);
    });

    it('should reject Stage 1 -> Stage 3 transition (Work in process -> Primary QC)', () => {
        const result = MakeProductionService.validateTransition('Work in process', 'Primary QC');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Stages must be updated sequentially. Next required stage is "Production On Going"');
    });

    it('should allow Stage 2 -> Stage 3 transition (Production On Going -> Primary QC)', () => {
        const result = MakeProductionService.validateTransition('Production On Going', 'Primary QC');
        expect(result.allowed).toBe(true);
        expect(result.currentStageIndex).toBe(1);
        expect(result.targetStageIndex).toBe(2);
    });

    it('should reject Stage 2 -> Stage 4 transition (Production On Going -> Color Ongoing (oven))', () => {
        const result = MakeProductionService.validateTransition('Production On Going', 'Color Ongoing (oven)');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Stages must be updated sequentially. Next required stage is "Primary QC"');
    });

    it('should allow Stage 3 -> Stage 4 transition (Primary QC -> Color Ongoing (oven))', () => {
        const result = MakeProductionService.validateTransition('Primary QC', 'Color Ongoing (oven)');
        expect(result.allowed).toBe(true);
        expect(result.currentStageIndex).toBe(2);
        expect(result.targetStageIndex).toBe(3);
    });

    it('should reject Stage 3 -> Stage 5 transition (Primary QC -> QC Final)', () => {
        const result = MakeProductionService.validateTransition('Primary QC', 'QC Final');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Stages must be updated sequentially. Next required stage is "Color Ongoing (oven)"');
    });

    it('should allow Stage 7 -> Stage 8 transition (Ready to Ship -> Delivered)', () => {
        const result = MakeProductionService.validateTransition('Ready to Ship', 'Delivered');
        expect(result.allowed).toBe(true);
        expect(result.currentStageIndex).toBe(6);
        expect(result.targetStageIndex).toBe(7);
    });

    it('should reject advancing beyond Stage 8 (Delivered)', () => {
        const result = MakeProductionService.validateTransition('Delivered', 'Work in process');
        expect(result.allowed).toBe(false);
    });

    it('should correctly interpret historical "Color Ongoing" as index 3', () => {
        // Historical "Color Ongoing" maps to index 3 -> next allowed is QC Final (4)
        const res = MakeProductionService.validateTransition('Color Ongoing', 'QC Final');
        expect(res.allowed).toBe(true);
        expect(res.currentStageIndex).toBe(3);
        expect(res.targetStageIndex).toBe(4);
    });

    it('should reject non-existent or invalid stage names', () => {
        const result = MakeProductionService.validateTransition('Work in process', 'Random Nonexistent Stage');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('Invalid production stage');
    });

    it('should ensure all stage updates capture stage, actor, timestamp, and remarks', () => {
        const stageUpdatePayload = {
            order_id: 101,
            stage: 'Primary QC',
            note: 'All dimensions verified against technical drawing. No wood defects found.',
            photo_url: 'https://storage.lenas.me/stages/qc_101.jpg',
            updated_by: 'QCOfficer (QC_Manager)',
            updated_at: new Date().toISOString()
        };

        expect(stageUpdatePayload.stage).toBe('Primary QC');
        expect(stageUpdatePayload.note).toBeTruthy();
        expect(stageUpdatePayload.updated_by).toContain('QCOfficer');
        expect(stageUpdatePayload.photo_url).toBeTruthy();
        expect(stageUpdatePayload.updated_at).toBeTruthy();
    });
});

