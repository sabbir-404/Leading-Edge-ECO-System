import crypto from 'crypto';

/**
 * crypto-audit.ts — Immudb-Style Cryptographic Merkle Hash-Chain Logger
 * Computes tamper-evident SHA-256 hash chains for system audit logs.
 */

export interface CryptographicAuditRecord {
    id: number | string;
    previousHash: string;
    payloadHash: string;
    recordHash: string;
    timestamp: string;
}

export class CryptographicAuditLogger {
    private static lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

    /**
     * Compute SHA-256 payload hash
     */
    static hashPayload(payload: any): string {
        const jsonStr = JSON.stringify(payload || {});
        return crypto.createHash('sha256').update(jsonStr).digest('hex');
    }

    /**
     * Compute record hash forming a continuous Merkle hash-chain
     */
    static createRecord(id: number | string, payload: any): CryptographicAuditRecord {
        const timestamp = new Date().toISOString();
        const payloadHash = this.hashPayload(payload);
        const recordData = `${this.lastHash}:${payloadHash}:${timestamp}:${id}`;
        const recordHash = crypto.createHash('sha256').update(recordData).digest('hex');

        const record: CryptographicAuditRecord = {
            id,
            previousHash: this.lastHash,
            payloadHash,
            recordHash,
            timestamp,
        };

        // Advance hash chain
        this.lastHash = recordHash;
        return record;
    }

    /**
     * Verify tamper-evident integrity of an audit record
     */
    static verifyRecord(record: CryptographicAuditRecord, payload: any): boolean {
        const payloadHash = this.hashPayload(payload);
        if (payloadHash !== record.payloadHash) return false;
        const expectedRecordData = `${record.previousHash}:${payloadHash}:${record.timestamp}:${record.id}`;
        const expectedRecordHash = crypto.createHash('sha256').update(expectedRecordData).digest('hex');
        return expectedRecordHash === record.recordHash;
    }
}
