/**
 * verify-controlled-customer-test.ts
 * 
 * Strict controlled real-data verification:
 * Proves that selecting an existing customer in Place Order does NOT create a duplicate billing_customers record.
 * 
 * 1. Choose an existing customer through Place Order autocomplete ("Sabbir")
 * 2. Record: customer_id, name, phone, email
 * 3. Query billing_customers BEFORE placing order (count matching)
 * 4. Place controlled test order using selected customer via MakeOrderService.createOrder
 * 5. Query billing_customers AFTER placing order (count matching & total count)
 * 6. Verify:
 *    - matching customer count remains exactly 1
 *    - original customer_id remains unchanged
 *    - created order has that exact customer_id
 *    - no new billing_customers row was inserted
 * 7. Safely clean up only the test order; do not alter/delete the real customer
 */

import { supabase, failoverEngine } from '../electron/supabase';
import { MakeOrderService } from '../electron/services/make/MakeOrderService';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = path.resolve('C:/Users/sabbi/.gemini/antigravity-ide/brain/6dd30c0d-c5f2-4d57-9134-2bf42ffc0742');
const EVIDENCE_FILE = path.join(ARTIFACT_DIR, 'controlled_customer_test_evidence.json');

async function runControlledCustomerVerification() {
    console.log('================================================================');
    console.log('CONTROLLED REAL-DATA VERIFICATION: CUSTOMER NON-DUPLICATION TEST');
    console.log('================================================================\n');

    // Wait for failover engine / DB client ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    const activeDb = failoverEngine.getStatus().activeDb || 'nas/supabase';
    console.log(`[INIT] Active Database: ${activeDb}\n`);

    // ── STEP 1: Choose existing customer through autocomplete query ─────────────
    console.log('── STEP 1 & 2: Autocomplete & Select Existing Customer ──────────');
    const searchQuery = 'Sabbir';
    console.log(`[AUTOCOMPLETE] Searching for: "${searchQuery}" in billing_customers...`);
    
    const { data: searchResults, error: searchErr } = await supabase
        .from('billing_customers')
        .select('id, name, phone, email, address, company')
        .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .order('name')
        .limit(5);

    if (searchErr || !searchResults || searchResults.length === 0) {
        throw new Error(`Failed to find existing customer for query "${searchQuery}": ${searchErr?.message || 'No results'}`);
    }

    const selectedCustomer = searchResults.find(c => c.id === 38) || searchResults[0];
    const customerId = selectedCustomer.id;
    const customerName = selectedCustomer.name;
    const customerPhone = selectedCustomer.phone;
    const customerEmail = selectedCustomer.email;
    const customerAddress = selectedCustomer.address;

    console.log('[RECORDED CUSTOMER]:');
    console.log(`  • customer_id: ${customerId}`);
    console.log(`  • name:        ${customerName}`);
    console.log(`  • phone:       ${customerPhone}`);
    console.log(`  • email:       ${customerEmail}`);
    console.log(`  • address:     ${customerAddress}\n`);

    // ── STEP 3: Query billing_customers BEFORE placing order ────────────────────
    console.log('── STEP 3: Query billing_customers BEFORE Order ──────────────────');
    const { data: beforeById, error: beforeErr1 } = await supabase
        .from('billing_customers')
        .select('id, name, phone, email')
        .eq('id', customerId);

    const { data: beforeByPhone, error: beforeErr2 } = await supabase
        .from('billing_customers')
        .select('id, name, phone, email')
        .eq('phone', customerPhone);

    const { data: beforeAll, error: beforeErr3 } = await supabase
        .from('billing_customers')
        .select('id');

    if (beforeErr1 || beforeErr2 || beforeErr3) {
        throw new Error(`Query before order failed: ${beforeErr1?.message || beforeErr2?.message || beforeErr3?.message}`);
    }

    const countBeforeId = beforeById?.length || 0;
    const countBeforePhone = beforeByPhone?.length || 0;
    const totalCustomersBefore = beforeAll?.length || 0;

    console.log(`[BEFORE] Matching customer_id (${customerId}) count: ${countBeforeId}`);
    console.log(`[BEFORE] Matching phone (${customerPhone}) count:   ${countBeforePhone}`);
    console.log(`[BEFORE] Total billing_customers rows:               ${totalCustomersBefore}\n`);

    if (countBeforeId !== 1) {
        throw new Error(`Expected exactly 1 matching customer before test, found ${countBeforeId}`);
    }

    // ── STEP 4: Place controlled test order using selected customer ─────────────
    console.log('── STEP 4: Placing Controlled Test Order ─────────────────────────');
    const actorSession = {
        userId: 1,
        username: 'superadmin',
        fullName: 'Super Admin',
        role: 'superadmin'
    };

    const orderInput = {
        furniture_name: 'QA Controlled Verification Frame (Non-Duplication Test)',
        description: 'Controlled verification order to prove existing customer ID is reused and no duplicate billing_customers row is inserted.',
        priority: 'Normal' as const,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        shipping_address: customerAddress || 'Plot 42, Road 11, Banani, Dhaka',
        items: [
            {
                product_name: 'Controlled Verification Desk Frame',
                quantity: 1,
                item_cost_price: 5000,
                item_sale_price: 8500
            }
        ]
    };

    console.log(`[ORDER] Calling MakeOrderService.createOrder with customer_id: ${customerId}...`);
    const orderResult = await MakeOrderService.createOrder(orderInput as any, actorSession);

    if (!orderResult.success || !orderResult.id) {
        throw new Error(`MakeOrderService.createOrder failed: ${orderResult.error}`);
    }

    const createdOrderId = orderResult.id;
    const createdOrderNumber = orderResult.order_number;
    console.log(`[ORDER CREATED] ID: ${createdOrderId}, Order Number: ${createdOrderNumber}`);

    // Query back the created order header to verify stored customer_id in DB
    const { data: createdOrderRow, error: fetchOrderErr } = await supabase
        .from('make_orders')
        .select('id, order_number, customer_id, customer_name, customer_phone')
        .eq('id', createdOrderId)
        .single();

    if (fetchOrderErr || !createdOrderRow) {
        throw new Error(`Failed to fetch created order from make_orders: ${fetchOrderErr?.message}`);
    }

    console.log(`[ORDER RECORD IN DB]:`);
    console.log(`  • id:                 ${createdOrderRow.id}`);
    console.log(`  • order_number:       ${createdOrderRow.order_number}`);
    console.log(`  • order.customer_id:  ${createdOrderRow.customer_id}`);
    console.log(`  • order.customer_name:${createdOrderRow.customer_name}\n`);

    // ── STEP 5: Query billing_customers AFTER order ─────────────────────────────
    console.log('── STEP 5: Query billing_customers AFTER Order ───────────────────');
    const { data: afterById, error: afterErr1 } = await supabase
        .from('billing_customers')
        .select('id, name, phone, email')
        .eq('id', customerId);

    const { data: afterByPhone, error: afterErr2 } = await supabase
        .from('billing_customers')
        .select('id, name, phone, email')
        .eq('phone', customerPhone);

    const { data: afterAll, error: afterErr3 } = await supabase
        .from('billing_customers')
        .select('id');

    if (afterErr1 || afterErr2 || afterErr3) {
        throw new Error(`Query after order failed: ${afterErr1?.message || afterErr2?.message || afterErr3?.message}`);
    }

    const countAfterId = afterById?.length || 0;
    const countAfterPhone = afterByPhone?.length || 0;
    const totalCustomersAfter = afterAll?.length || 0;

    console.log(`[AFTER] Matching customer_id (${customerId}) count: ${countAfterId}`);
    console.log(`[AFTER] Matching phone (${customerPhone}) count:   ${countAfterPhone}`);
    console.log(`[AFTER] Total billing_customers rows:              ${totalCustomersAfter}\n`);

    // ── STEP 6: Assertions ──────────────────────────────────────────────────────
    console.log('── STEP 6: Verifications & Assertions ────────────────────────────');
    const check1 = countBeforeId === 1 && countAfterId === 1;
    const check2 = countBeforePhone === countAfterPhone;
    const check3 = totalCustomersBefore === totalCustomersAfter;
    const check4 = createdOrderRow.customer_id === customerId;
    const check5 = afterById[0].id === customerId && afterById[0].name === customerName;

    console.log(`Assertion 1 (Count matching ID remains exactly 1: ${countBeforeId} -> ${countAfterId}): ${check1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Assertion 2 (Count matching phone remains same: ${countBeforePhone} -> ${countAfterPhone}): ${check2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Assertion 3 (Total customer table rows unchanged: ${totalCustomersBefore} -> ${totalCustomersAfter}): ${check3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Assertion 4 (Created order has exact customer_id: ${createdOrderRow.customer_id} === ${customerId}): ${check4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Assertion 5 (Original customer record intact & unchanged): ${check5 ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = check1 && check2 && check3 && check4 && check5;

    // ── STEP 7: Cleanup controlled test order ───────────────────────────────────
    console.log('\n── STEP 7: Safe Cleanup of Controlled Test Order ────────────────');
    console.log(`[CLEANUP] Removing test order items for order_id: ${createdOrderId}...`);
    await supabase.from('make_order_items').delete().eq('order_id', createdOrderId);
    await supabase.from('make_order_updates').delete().eq('order_id', createdOrderId);
    const { error: delErr } = await supabase.from('make_orders').delete().eq('id', createdOrderId);

    if (delErr) {
        console.warn(`[CLEANUP WARN] Order deletion returned: ${delErr.message}`);
    } else {
        console.log(`[CLEANUP] Successfully deleted controlled test order ${createdOrderId} from make_orders.`);
    }

    // Verify order deleted
    const { data: verifyOrderDeleted } = await supabase.from('make_orders').select('id').eq('id', createdOrderId).maybeSingle();
    console.log(`[CLEANUP VERIFY] Test order removed: ${verifyOrderDeleted === null ? '✅ YES' : '❌ NO'}`);

    // Verify real customer still intact
    const { data: finalCustCheck } = await supabase.from('billing_customers').select('id, name').eq('id', customerId).single();
    console.log(`[CLEANUP VERIFY] Real customer #${customerId} (${finalCustCheck?.name}) remains intact: ${finalCustCheck ? '✅ YES' : '❌ NO'}\n`);

    const evidence = {
        testName: "Customer Non-Duplication Controlled Test",
        timestamp: new Date().toISOString(),
        customer: {
            customer_id: customerId,
            name: customerName,
            phone: customerPhone,
            email: customerEmail
        },
        counts: {
            beforeMatchingId: countBeforeId,
            afterMatchingId: countAfterId,
            beforeTotalCustomers: totalCustomersBefore,
            afterTotalCustomers: totalCustomersAfter,
            duplicateCustomerCreated: !check3
        },
        order: {
            order_id: createdOrderId,
            order_number: createdOrderNumber,
            assigned_customer_id: createdOrderRow.customer_id,
            matchesExistingCustomer: check4
        },
        cleanup: {
            testOrderDeleted: verifyOrderDeleted === null,
            realCustomerIntact: !!finalCustCheck
        },
        verdict: allPassed ? "PASSED" : "FAILED"
    };

    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`[EVIDENCE] Saved to: ${EVIDENCE_FILE}`);

    console.log('================================================================');
    if (allPassed) {
        console.log('🎉 ALL NON-DUPLICATION CHECKS PASSED:');
        console.log('   BEFORE = 1');
        console.log('   AFTER  = 1');
        console.log(`   order.customer_id = ${customerId} (existing customer_id)`);
        console.log('   duplicate customer = NO');
        console.log('================================================================\n');
        process.exit(0);
    } else {
        console.error('❌ VERIFICATION FAILED: See details above.');
        console.log('================================================================\n');
        process.exit(1);
    }
}

import { app } from 'electron';

app.whenReady().then(() => {
    runControlledCustomerVerification()
        .then(() => {
            app.quit();
            process.exit(0);
        })
        .catch(err => {
            console.error('[FATAL ERROR IN TEST]:', err);
            app.quit();
            process.exit(1);
        });
});

