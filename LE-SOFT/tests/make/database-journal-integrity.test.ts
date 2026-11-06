import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseFailoverEngine } from '../../electron/services/DatabaseFailoverEngine';

describe('database failover journal durability', () => {
    const engine = DatabaseFailoverEngine.getInstance();
    let tempDir: string;

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('writes complete JSON using an atomic temp-file replacement', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-journal-'));
        const target = path.join(tempDir, 'fallback.json');
        const payload = [{ id: 'fw-1', table: 'products', status: 'pending' }];

        (engine as any).writeJsonAtomically(target, payload);

        expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual(payload);
        expect(fs.readdirSync(tempDir)).toEqual(['fallback.json']);
    });

    it('keeps the existing target intact and removes the temp file when rename fails', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-journal-'));
        const targetDirectory = path.join(tempDir, 'occupied.json');
        fs.mkdirSync(targetDirectory);

        expect(() => (engine as any).writeJsonAtomically(targetDirectory, [{ id: 'new' }])).toThrow();
        expect(fs.statSync(targetDirectory).isDirectory()).toBe(true);
        expect(fs.readdirSync(tempDir)).toEqual(['occupied.json']);
    });

    it('refuses fallback writes when the existing journal cannot be parsed', () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-journal-'));
        const corruptJournal = path.join(tempDir, 'fallback.json');
        fs.writeFileSync(corruptJournal, '{corrupt-json', 'utf-8');

        const originalPath = (engine as any).journalPath;
        const originalEntries = (engine as any).journalEntries;
        const originalLoadFailed = (engine as any).journalLoadFailed;

        try {
            (engine as any).journalPath = corruptJournal;
            (engine as any).loadJournal();

            expect((engine as any).journalLoadFailed).toBe(true);
            expect(() => engine.journalWrite({
                table: 'products',
                operation: 'insert',
                data: { id: 1 }
            } as any)).toThrow(/refusing to accept an unjournaled fallback write/i);
            expect(fs.readFileSync(corruptJournal, 'utf-8')).toBe('{corrupt-json');
        } finally {
            (engine as any).journalPath = originalPath;
            (engine as any).journalEntries = originalEntries;
            (engine as any).journalLoadFailed = originalLoadFailed;
        }
    });
});
