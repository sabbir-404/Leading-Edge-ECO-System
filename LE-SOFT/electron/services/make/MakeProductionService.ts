/**
 * MakeProductionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Server-Side Production Stage State Machine for MAKE V1.
 * 
 * Enforces the Canonical 8-Stage Manufacturing Workflow:
 *  1. Work in process
 *  2. Production On Going
 *  3. Primary QC
 *  4. Color Ongoing (oven)
 *  5. QC Final
 *  6. Packaging
 *  7. Ready to Ship
 *  8. Delivered
 * 
 * Rules:
 *  - Sequential transition only: S(n) -> S(n+1). Skipping is strictly rejected.
 *  - Backward-compatible mapping for historical variants (e.g. legacy 6-stage display).
 *  - Photographic verification supported for inspection stages.
 */

import { supabase } from '../../supabase';

export const CANONICAL_PRODUCTION_STAGES = [
    'Work in process',
    'Production On Going',
    'Primary QC',
    'Color Ongoing (oven)',
    'QC Final',
    'Packaging',
    'Ready to Ship',
    'Delivered'
] as const;

export type CanonicalStage = typeof CANONICAL_PRODUCTION_STAGES[number];

// Backward-compatibility mapping from legacy stage strings to canonical stage indices
const LEGACY_STAGE_INDEX_MAP: Record<string, number> = {
    // 8 Canonical stages
    'Work in process': 0,
    'Production On Going': 1,
    'Primary QC': 2,
    'Color Ongoing (oven)': 3,
    'QC Final': 4,
    'Packaging': 5,
    'Ready to Ship': 6,
    'Delivered': 7,

    // Historical variants & WordPress plugin variants
    'Color Ongoing': 3,
    'Color Ongoing (Oven)': 3,
    'Color ongoing': 3,
    'In Production': 1,
    'Production Ongoing': 1,
    'Work In Progress': 0,
    'WIP': 0,
    'Completed': 7,

    // Historical 6-stage fallback mapping
    'Cutting & Woodworking': 0,
    'Metalwork': 1,
    'Polish & Paint': 3,
    'Upholstery': 1,
    'Packaging & QC': 4,
    'Dispatch': 6
};

export interface StageTransitionResult {
    allowed: boolean;
    error?: string;
    currentStageIndex: number;
    targetStageIndex: number;
}

export class MakeProductionService {
    /**
     * Resolves the canonical stage index (0-5) for any stage string (canonical or legacy).
     * Returns -1 if the stage string is not recognized.
     */
    public static getStageIndex(stageName?: string | null): number {
        if (!stageName) return -1;
        const trimmed = stageName.trim();
        if (trimmed in LEGACY_STAGE_INDEX_MAP) {
            return LEGACY_STAGE_INDEX_MAP[trimmed];
        }
        // Case-insensitive lookup fallback
        const lower = trimmed.toLowerCase();
        for (const [key, idx] of Object.entries(LEGACY_STAGE_INDEX_MAP)) {
            if (key.toLowerCase() === lower) return idx;
        }
        return -1;
    }

    /**
     * Authoritatively validates whether an order can advance from its current status to targetStage.
     */
    public static validateTransition(currentStatus: string | null | undefined, targetStage: string): StageTransitionResult {
        const curIdx = this.getStageIndex(currentStatus);
        const targetIdx = this.getStageIndex(targetStage);

        if (targetIdx === -1) {
            return {
                allowed: false,
                error: `Invalid production stage: "${targetStage}". Must be one of: ${CANONICAL_PRODUCTION_STAGES.join(', ')}.`,
                currentStageIndex: curIdx,
                targetStageIndex: targetIdx
            };
        }

        // If order has not entered factory production yet (e.g. Placed, sales_approved, Draft)
        if (curIdx === -1) {
            if (targetIdx !== 0) {
                return {
                    allowed: false,
                    error: `Initial production stage must be "${CANONICAL_PRODUCTION_STAGES[0]}". Cannot start at "${targetStage}".`,
                    currentStageIndex: curIdx,
                    targetStageIndex: targetIdx
                };
            }
            return { allowed: true, currentStageIndex: curIdx, targetStageIndex: targetIdx };
        }

        // Strictly sequential transition: targetIdx must be curIdx + 1
        if (targetIdx > curIdx + 1) {
            const nextRequiredStage = CANONICAL_PRODUCTION_STAGES[curIdx + 1] || 'Completed';
            return {
                allowed: false,
                error: `Stages must be updated sequentially. Next required stage is "${nextRequiredStage}". You cannot skip to "${targetStage}".`,
                currentStageIndex: curIdx,
                targetStageIndex: targetIdx
            };
        }

        // Disallow moving backwards unless explicitly requested (e.g. rework)
        if (targetIdx < curIdx) {
            return {
                allowed: false,
                error: `Cannot regress production stage backwards from index ${curIdx} to ${targetIdx} without supervisor rework authorization.`,
                currentStageIndex: curIdx,
                targetStageIndex: targetIdx
            };
        }

        // If targetIdx === curIdx, allowed (updating notes/photos on same stage)
        return { allowed: true, currentStageIndex: curIdx, targetStageIndex: targetIdx };
    }

    /**
     * Executes the stage transition in the database and dispatches notifications.
     */
    public static async advanceOrderStage(params: {
        orderId: number | string;
        targetStage: string;
        note?: string;
        photoUrl?: string | null;
        actorName: string;
        actorRole: string;
        actorUserId?: number | null;
    }): Promise<{ success: boolean; stage: string; photo_url: string | null; error?: string }> {
        const { orderId, targetStage, note, photoUrl, actorName, actorRole, actorUserId } = params;

        // 1. Fetch current order
        const { data: order, error: fetchErr } = await supabase
            .from('make_orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !order) {
            return { success: false, stage: targetStage, photo_url: null, error: 'Order not found' };
        }

        // 2. Validate transition
        const validation = this.validateTransition(order.status, targetStage);
        if (!validation.allowed) {
            return { success: false, stage: targetStage, photo_url: null, error: validation.error };
        }

        // 3. Photo requirement check for stages 0 through 4 (Stages 1-5 in 1-based indexing)
        if (validation.targetStageIndex >= 0 && validation.targetStageIndex <= 4) {
            const hasPhoto = !!photoUrl || !!order.current_stage_photo;
            // Encourage photo verification
            if (!hasPhoto && !note) {
                return {
                    success: false,
                    stage: targetStage,
                    photo_url: null,
                    error: `Stage "${targetStage}" requires either a completion photo or explanatory notes.`
                };
            }
        }

        const roleLabel = actorRole || 'Factory Manager';
        const formattedActor = `${actorName} (${roleLabel})`;
        const finalPhotoUrl = photoUrl || order.current_stage_photo || null;

        // 4. Record stage update in make_order_updates
        const updateRow: any = {
            order_id: orderId,
            status: targetStage,
            stage: targetStage,
            note: note || '',
            photo_url: finalPhotoUrl,
            photo_urls: finalPhotoUrl ? [finalPhotoUrl] : [],
            updated_by: formattedActor
        };
        const { error: insErr } = await supabase.from('make_order_updates').insert(updateRow);
        if (insErr) {
            console.error('[MakeProductionService] Failed to insert update:', insErr);
        }

        // 5. Update make_orders table
        const orderUpdates: any = {
            status: targetStage,
            current_stage: targetStage,
            updated_at: new Date().toISOString()
        };
        if (finalPhotoUrl) {
            orderUpdates.current_stage_photo = finalPhotoUrl;
        }
        if (actorUserId) {
            orderUpdates.factory_manager_id = actorUserId;
        }
        orderUpdates.factory_manager_name = actorName;

        const { error: updErr } = await supabase
            .from('make_orders')
            .update(orderUpdates)
            .eq('id', orderId);

        if (updErr) {
            return { success: false, stage: targetStage, photo_url: finalPhotoUrl, error: updErr.message };
        }

        // 6. Send real-time notification to Salesman and Designer
        try {
            const furnitureTitle = order.furniture_name || `Order #${orderId}`;
            const notifTitle = `Stage Update: ${furnitureTitle} → ${targetStage}`;
            const notifMsg = `${actorName} advanced order #${order.order_number || orderId} to "${targetStage}".${note ? ` Note: ${note}` : ''}`;

            const recipients: number[] = [];
            if (order.salesman_id && typeof order.salesman_id === 'number') {
                recipients.push(order.salesman_id);
            }

            if (recipients.length > 0) {
                const notifRows = recipients.map(rid => ({
                    title: notifTitle,
                    message: notifMsg,
                    recipient_id: rid,
                    sender_id: actorUserId || null,
                    action_path: '/make/track',
                    action_label: 'View Order',
                    metadata: {
                        order_id: orderId,
                        stage: targetStage,
                        photo_url: finalPhotoUrl
                    }
                }));
                await supabase.from('notifications').insert(notifRows);
            }
        } catch (notifErr) {
            console.warn('[MakeProductionService] Notification insert non-fatal error:', notifErr);
        }

        return {
            success: true,
            stage: targetStage,
            photo_url: finalPhotoUrl
        };
    }
}
