/**
 * conflictResolver.ts — Multi-Client Conflict Resolution Engine
 * Handles concurrent write collisions between multiple offline or online desktop clients.
 */

export interface ConflictRecord {
    id?: number;
    entityName: string;
    recordId: string | number;
    localPayload: any;
    remotePayload: any;
    resolvedPayload: any;
    resolutionStrategy: 'LAST_WRITE_WINS' | 'MERGE' | 'ADMIN_OVERRIDE';
    timestamp: string;
}

export class ConflictResolutionEngine {
    /**
     * Resolve conflict between local offline write and remote server record
     * Default Strategy: LAST_WRITE_WINS based on timestamp
     */
    static resolveConflict(
        entityName: string,
        recordId: string | number,
        localPayload: any,
        remotePayload: any,
        strategy: 'LAST_WRITE_WINS' | 'MERGE' | 'ADMIN_OVERRIDE' = 'LAST_WRITE_WINS'
    ): ConflictRecord {
        let resolvedPayload: any;

        if (strategy === 'MERGE') {
            resolvedPayload = { ...(remotePayload || {}), ...(localPayload || {}) };
        } else if (strategy === 'ADMIN_OVERRIDE') {
            resolvedPayload = localPayload;
        } else {
            // LAST_WRITE_WINS
            const localTime = new Date(localPayload.updated_at || localPayload.created_at || Date.now()).getTime();
            const remoteTime = new Date(remotePayload.updated_at || remotePayload.created_at || 0).getTime();
            resolvedPayload = localTime >= remoteTime ? localPayload : remotePayload;
        }

        const conflictRecord: ConflictRecord = {
            entityName,
            recordId,
            localPayload,
            remotePayload,
            resolvedPayload,
            resolutionStrategy: strategy,
            timestamp: new Date().toISOString(),
        };

        console.log(`[ConflictResolver] Resolved conflict for ${entityName} #${recordId} using ${strategy}`);
        return conflictRecord;
    }
}
