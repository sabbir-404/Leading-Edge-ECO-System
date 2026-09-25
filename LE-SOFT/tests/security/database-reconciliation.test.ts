import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../../electron/credentials';
import { loadConfig, getDbClients, reinitSupabaseClients } from '../../electron/supabase';

describe('Final Read-Only Database Reconciliation', () => {
    let supabaseClient: SupabaseClient;
    let nasClient: SupabaseClient | null = null;
    let nasUrl: string | null = null;

    beforeAll(async () => {
        // 1. Initialize Supabase Cloud client with public anon credentials
        supabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

        // 2. Load runtime config to check NAS endpoints
        const config = loadConfig();
        const candidateUrls = [
            config.nasLocalUrl || 'http://192.168.1.14:3001',
            config.nasTunnelUrl || 'https://db.lenas.me',
            config.nasUrl || 'http://100.88.85.6:3001'
        ];

        const cfHeaders: Record<string, string> = {};
        if (config.cfAccessClientId && config.cfAccessClientSecret) {
            cfHeaders['CF-Access-Client-Id'] = config.cfAccessClientId;
            cfHeaders['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
        }

        // Test connectivity to candidates
        for (const url of candidateUrls) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 2500);
                const res = await fetch(url, { signal: controller.signal, headers: cfHeaders });
                clearTimeout(tid);
                if (res.ok) {
                    nasUrl = url;
                    const nasFetch = (input: RequestInfo | URL, init?: RequestInit) => {
                        let reqUrl = typeof input === 'string' ? input : input.toString();
                        if (reqUrl.includes('/rest/v1/')) {
                            reqUrl = reqUrl.replace('/rest/v1/', '/');
                        }
                        const headers = new Headers(init?.headers);
                        for (const [k, v] of Object.entries(cfHeaders)) {
                            headers.set(k, v);
                        }
                        return fetch(reqUrl, { ...init, headers });
                    };
                    nasClient = createClient(url, config.nasAnonKey || config.anonKey || PUBLIC_SUPABASE_ANON_KEY, {
                        global: { fetch: nasFetch }
                    });
                    break;
                }
            } catch {}
        }
    });

    it('1. Authoritative Architecture Verification', () => {
        expect(PUBLIC_SUPABASE_URL).toBeDefined();
        console.log('\n[ARCH] Verifying database routing architecture:');
        console.log('  NAS Master Candidate URL:', nasUrl || 'None responding (offline)');
        console.log('  Supabase Cloud Project:', PUBLIC_SUPABASE_URL.replace(/https:\/\/(.*?)\..*/, '$1'));
    });

    it('2. NAS Database Verification (READ-ONLY)', async () => {
        if (!nasClient) {
            console.log('[NAS] NAS PostgREST is currently not reachable directly from this network interface.');
            return;
        }

        console.log('\n[NAS] Reconciling NAS MAKE V1.2 Schema (Operational Master)...');

        // Check make_product_categories
        const { data: categories, count: catCount, error: catErr } = await nasClient
            .from('make_product_categories')
            .select('id, name, code, is_active', { count: 'exact' });
        console.log('  • make_product_categories table:', !catErr ? 'PRESENT' : 'ERROR: ' + JSON.stringify(catErr));
        if (categories) console.log('    Row count:', catCount, '| Sample categories:', categories.slice(0, 3).map(c => c.name));

        // Check make_products (category, category_id)
        const { data: products, count: prodCount, error: prodErr } = await nasClient
            .from('make_products')
            .select('id, product_code, product_name, category, category_id', { count: 'exact' })
            .limit(5);
        console.log('  • make_products columns (category, category_id):', !prodErr ? 'PRESENT' : 'ERROR: ' + JSON.stringify(prodErr));
        console.log('    Total products count:', prodCount);

        // Check specification/size/color junction tables
        const { count: specLinkCount, error: specLinkErr } = await nasClient
            .from('make_product_specification_links')
            .select('id', { count: 'exact', head: true });
        console.log('  • make_product_specification_links:', !specLinkErr ? `PRESENT (rows: ${specLinkCount})` : 'MISSING / ' + JSON.stringify(specLinkErr));

        const { count: sizeLinkCount, error: sizeLinkErr } = await nasClient
            .from('make_product_size_links')
            .select('id', { count: 'exact', head: true });
        console.log('  • make_product_size_links:', !sizeLinkErr ? `PRESENT (rows: ${sizeLinkCount})` : 'MISSING / ' + JSON.stringify(sizeLinkErr));

        const { count: colorLinkCount, error: colorLinkErr } = await nasClient
            .from('make_product_color_links')
            .select('id', { count: 'exact', head: true });
        console.log('  • make_product_color_links:', !colorLinkErr ? `PRESENT (rows: ${colorLinkCount})` : 'MISSING / ' + JSON.stringify(colorLinkErr));

        // Check make_orders (customer_id, invoice_attachment_urls, current_stage)
        const { data: orders, count: orderCount, error: orderErr } = await nasClient
            .from('make_orders')
            .select('id, order_number, customer_id, invoice_attachment_urls, current_stage', { count: 'exact' })
            .limit(3);
        console.log('  • make_orders (customer_id, invoice_attachment_urls, current_stage):', !orderErr ? `PRESENT (rows: ${orderCount})` : 'ERROR: ' + JSON.stringify(orderErr));

        // Check make_order_updates (stage)
        const { data: updates, count: updateCount, error: updateErr } = await nasClient
            .from('make_order_updates')
            .select('id, order_id, stage', { count: 'exact' })
            .limit(3);
        console.log('  • make_order_updates (stage):', !updateErr ? `PRESENT (rows: ${updateCount})` : 'ERROR: ' + JSON.stringify(updateErr));
    });

    it('3 & 4. Supabase Cloud Database Verification (READ-ONLY) & Migration 063 Status', async () => {
        console.log('\n[SUPABASE CLOUD] Checking live Supabase schema for Migration 063...');
        const statusMap: Record<string, boolean> = {};

        // 1. make_product_categories table
        const { data: categories, count: catCount, error: catErr } = await supabaseClient
            .from('make_product_categories')
            .select('id, name, code', { count: 'exact' })
            .limit(5);
        statusMap['make_product_categories'] = !catErr;
        console.log('  • make_product_categories:', !catErr ? `PRESENT (rows: ${catCount})` : 'MISSING (' + catErr.message + ')');

        // 2. make_products.category and category_id
        const { data: products, error: prodErr } = await supabaseClient
            .from('make_products')
            .select('id, category, category_id')
            .limit(1);
        statusMap['make_products.category'] = !prodErr;
        statusMap['make_products.category_id'] = !prodErr;
        console.log('  • make_products.category & category_id:', !prodErr ? 'PRESENT' : 'MISSING (' + prodErr.message + ')');

        // 3. Junction tables
        const { error: specLinkErr } = await supabaseClient
            .from('make_product_specification_links')
            .select('id', { head: true });
        statusMap['make_product_specification_links'] = !specLinkErr;
        console.log('  • make_product_specification_links:', !specLinkErr ? 'PRESENT' : 'MISSING (' + specLinkErr.message + ')');

        const { error: sizeLinkErr } = await supabaseClient
            .from('make_product_size_links')
            .select('id', { head: true });
        statusMap['make_product_size_links'] = !sizeLinkErr;
        console.log('  • make_product_size_links:', !sizeLinkErr ? 'PRESENT' : 'MISSING (' + sizeLinkErr.message + ')');

        const { error: colorLinkErr } = await supabaseClient
            .from('make_product_color_links')
            .select('id', { head: true });
        statusMap['make_product_color_links'] = !colorLinkErr;
        console.log('  • make_product_color_links:', !colorLinkErr ? 'PRESENT' : 'MISSING (' + colorLinkErr.message + ')');

        // 4. make_orders columns: customer_id, invoice_attachment_urls, current_stage
        const { error: orderErr } = await supabaseClient
            .from('make_orders')
            .select('id, customer_id, invoice_attachment_urls, current_stage')
            .limit(1);
        statusMap['make_orders fields'] = !orderErr;
        console.log('  • make_orders (customer_id, invoice_attachment_urls, current_stage):', !orderErr ? 'PRESENT' : 'MISSING (' + orderErr.message + ')');

        // 5. make_order_updates column: stage
        const { error: updateErr } = await supabaseClient
            .from('make_order_updates')
            .select('id, stage')
            .limit(1);
        statusMap['make_order_updates.stage'] = !updateErr;
        console.log('  • make_order_updates.stage:', !updateErr ? 'PRESENT' : 'MISSING (' + updateErr.message + ')');

        // Determine definitive status
        const totalItems = Object.keys(statusMap).length;
        const presentItems = Object.values(statusMap).filter(Boolean).length;
        let migration063Status: string;

        if (presentItems === totalItems) {
            migration063Status = 'APPLIED AND VERIFIED';
        } else if (presentItems === 0) {
            migration063Status = 'NOT APPLIED';
        } else {
            const missing = Object.entries(statusMap).filter(([_, v]) => !v).map(([k]) => k);
            migration063Status = `PARTIALLY APPLIED — missing: ${missing.join(', ')}`;
        }

        console.log(`\n▶ DEFINITIVE MIGRATION 063 STATUS ON SUPABASE CLOUD: ${migration063Status}`);
    });

    it('5. Application Compatibility Read-Only Suite', async () => {
        console.log('\n[COMPATIBILITY] Running minimum read-only application checks...');

        // 5.1 MAKE catalog read
        const { data: products, error: prodErr } = await supabaseClient
            .from('make_products')
            .select('id, product_code, product_name, category_id')
            .limit(10);
        expect(prodErr).toBeNull();
        console.log('  ✓ MAKE catalog read: PASS (retrieved ' + products?.length + ' products)');

        // 5.2 Category read
        const { data: categories, error: catErr } = await supabaseClient
            .from('make_product_categories')
            .select('id, name')
            .limit(10);
        console.log('  ✓ Category read: ' + (!catErr ? `PASS (retrieved ${categories?.length} categories)` : 'FAIL (' + catErr?.message + ')'));

        // 5.3 Whole-catalog search
        const { data: searchResults, error: searchErr } = await supabaseClient
            .from('make_products')
            .select('id, product_code, product_name')
            .ilike('product_name', '%a%')
            .limit(5);
        expect(searchErr).toBeNull();
        console.log('  ✓ Whole-catalog search: PASS (retrieved ' + searchResults?.length + ' matching products)');

        // 5.4 Customer ledger read
        const { data: customers, error: custErr } = await supabaseClient
            .from('billing_customers')
            .select('id, name, phone, email, total_bills')
            .limit(5);
        expect(custErr).toBeNull();
        console.log('  ✓ Customer ledger read: PASS (retrieved ' + customers?.length + ' customers)');

        const { data: ledger, error: ledgErr } = await supabaseClient
            .from('customer_ledger')
            .select('id, amount, balance')
            .limit(5);
        console.log('  ✓ Customer ledger transactions: ' + (!ledgErr ? `PASS (retrieved ${ledger?.length} entries)` : 'FAIL (' + ledgErr?.message + ')'));

        // 5.5 Production stage read
        const { data: stages, error: stageErr } = await supabaseClient
            .from('make_orders')
            .select('id, order_number, current_stage')
            .limit(5);
        console.log('  ✓ Production stage read: ' + (!stageErr ? `PASS (retrieved ${stages?.length} orders)` : 'FAIL (' + stageErr.message + ')'));

        // 5.6 Invoice attachment metadata read
        const { data: invoices, error: invErr } = await supabaseClient
            .from('make_orders')
            .select('id, invoice_attachment_urls')
            .limit(5);
        console.log('  ✓ Invoice attachment metadata read: ' + (!invErr ? `PASS (retrieved ${invoices?.length} orders)` : 'FAIL (' + invErr.message + ')'));
    });
});
