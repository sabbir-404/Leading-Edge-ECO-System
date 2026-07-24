import { createClient } from '@supabase/supabase-js';

const config = {
  url: "https://ildkkgjrolcjijwfokek.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM",
  nasUrl: "http://100.88.85.6:3001"
};

const nasFetch = (input, init) => {
  let url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/rest/v1/')) {
    url = url.replace('/rest/v1/', '/');
  }
  return fetch(url, init);
};

const supabase = createClient(config.nasUrl, config.anonKey, {
  global: {
    fetch: nasFetch
  }
});

async function run() {
  console.log('--- Testing Non-existent Single Query ---');
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*, user_groups(permissions,is_active)')
      .eq('auth_id', '00000000-0000-0000-0000-000000000000') // non-existent
      .single();
    console.log('Data:', data);
    console.log('Error:', error);
    if (error) {
      console.log('Error Type:', typeof error);
      console.log('Error Keys:', Object.keys(error));
      console.log('Error Code:', error.code);
      console.log('Error Message:', error.message);
    }
  } catch (e) {
    console.error('Exception:', e);
  }
}

run();