import { createClient } from '@supabase/supabase-js';

const url = 'https://ildkkgjrolcjijwfokek.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';

const supabase = createClient(url, anonKey);

async function check() {
    console.log('Checking billing_customers...');
    const { data, error, count } = await supabase.from('billing_customers').select('*', { count: 'exact' });
    if (error) { console.error(error); return; }
    console.log(`Total customers: ${count}`);
    console.log('Sample:', data.slice(0, 2));

    console.log('\nChecking bill_items...');
    const { count: itemCount } = await supabase.from('bill_items').select('*', { count: 'exact', head: true });
    console.log(`Total bill items: ${itemCount}`);
}

check();
