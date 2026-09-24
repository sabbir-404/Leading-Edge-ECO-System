import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MakeOrderService } from '../../electron/services/make/MakeOrderService';
import { supabase } from '../../electron/supabase';

vi.mock('../../electron/supabase', () => ({
    supabase: {
        from: vi.fn()
    }
}));

describe('MAKE V1.1 — Customer Ledger Integration & Deterministic Matching', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Phone Number Normalization', () => {
        it('should normalize Bangladeshi international format +88017... to 017...', () => {
            expect(MakeOrderService.normalizePhoneNumber('+8801711223344')).toBe('01711223344');
            expect(MakeOrderService.normalizePhoneNumber('8801812345678')).toBe('01812345678');
        });

        it('should remove spaces, dashes, parentheses and special symbols', () => {
            expect(MakeOrderService.normalizePhoneNumber('+880 (171) 122-3344')).toBe('01711223344');
            expect(MakeOrderService.normalizePhoneNumber('01912-345-678')).toBe('01912345678');
            expect(MakeOrderService.normalizePhoneNumber('016 11 22 33 44')).toBe('01611223344');
        });

        it('should handle local 11-digit numbers starting with 01', () => {
            expect(MakeOrderService.normalizePhoneNumber('01711223344')).toBe('01711223344');
        });

        it('should trim whitespace from raw inputs', () => {
            expect(MakeOrderService.normalizePhoneNumber('  01711223344  ')).toBe('01711223344');
        });

        it('should return empty string for null, undefined, or empty values', () => {
            expect(MakeOrderService.normalizePhoneNumber('')).toBe('');
            expect(MakeOrderService.normalizePhoneNumber(null as any)).toBe('');
            expect(MakeOrderService.normalizePhoneNumber(undefined as any)).toBe('');
        });
    });

    describe('Deterministic 5-Step Customer Resolution', () => {
        it('should match existing customer by reliable customer_id directly (Step 1)', async () => {
            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 45, name: 'Zahirul Islam', phone: '01711000111', email: 'zahir@example.com' },
                    error: null
                })
            });

            const customer = await MakeOrderService.resolveOrCreateCustomer({
                customerId: 45,
                customerName: 'Zahirul Islam'
            });

            expect(customer).not.toBeNull();
            expect(customer?.id).toBe(45);
            expect(customer?.name).toBe('Zahirul Islam');
        });

        it('should match existing customer by normalized phone (Step 2)', async () => {
            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 72, name: 'Rezaul Karim', phone: '01819998877' },
                    error: null
                })
            });

            const customer = await MakeOrderService.resolveOrCreateCustomer({
                customerPhone: '+880 (1819) 998-877',
                customerName: 'Rezaul Karim'
            });

            expect(customer).not.toBeNull();
            expect(customer?.id).toBe(72);
            expect(customer?.name).toBe('Rezaul Karim');
        });

        it('should match existing customer by normalized email (Step 3)', async () => {
            (supabase.from as any).mockImplementation(() => {
                return {
                    select: vi.fn().mockReturnThis(),
                    or: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    ilike: vi.fn().mockReturnThis()
                };
            });

            // Specific mock for email query
            let callCount = 0;
            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                ilike: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) return Promise.resolve({ data: null }); // phone check
                    return Promise.resolve({ data: { id: 91, name: 'Dr. Hasan', email: 'hasan@clinic.bd' } });
                })
            });

            const customer = await MakeOrderService.resolveOrCreateCustomer({
                customerPhone: '01700000000',
                customerEmail: 'Hasan@Clinic.BD',
                customerName: 'Dr. Hasan'
            });

            expect(customer).not.toBeNull();
            expect(customer?.id).toBe(91);
        });

        it('should match existing customer by unique name when phone/email not matched (Step 4)', async () => {
            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                limit: vi.fn().mockImplementation((n: number) => {
                    if (n === 2) {
                        return Promise.resolve({ data: [{ id: 110, name: 'Leading Edge Interior Design' }] });
                    }
                    return { maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
                }),
                ilike: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null })
            });

            const customer = await MakeOrderService.resolveOrCreateCustomer({
                customerName: 'Leading Edge Interior Design'
            });

            expect(customer).not.toBeNull();
            expect(customer?.id).toBe(110);
            expect(customer?.name).toBe('Leading Edge Interior Design');
        });

        it('should create new customer when no match exists (Step 5)', async () => {
            (supabase.from as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                limit: vi.fn().mockImplementation((n: number) => {
                    if (n === 2) return Promise.resolve({ data: [] });
                    return { maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
                }),
                ilike: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                insert: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: { id: 999, name: 'Brand New Client', phone: '01511223344' },
                            error: null
                        })
                    })
                })
            });

            const customer = await MakeOrderService.resolveOrCreateCustomer({
                customerName: 'Brand New Client',
                customerPhone: '01511223344'
            });

            expect(customer).not.toBeNull();
            expect(customer?.id).toBe(999);
            expect(customer?.name).toBe('Brand New Client');
        });
    });
});
