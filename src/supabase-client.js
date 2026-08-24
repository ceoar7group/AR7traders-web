// One Supabase browser client for the whole app.
//
// The CRM and the public website live in the same bundle. If each created its
// own client they would fight over the same auth storage key and Supabase
// would warn about "multiple GoTrueClient instances". So it is created once
// here and imported by both.
import {createClient} from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
    })
  : null;

export const hasSupabase = !!supabase;
