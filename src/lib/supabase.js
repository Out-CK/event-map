import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function fetchAllEvents() {
  const { data, error } = await supabase
    .from('event_entry_database')
    .select('*')
    .not('date', 'like', '<%')  // exclude malformed dates like <UNKNOWN>
    .not('date', 'is', null)
    .order('date', { ascending: true })

  if (error) throw error
  return data
}
