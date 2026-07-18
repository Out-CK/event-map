import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function fetchEventsByType(eventType) {
  const buildQuery = () => {
    let q = supabase
      .from('event_entry_database_v2')
      .select('*')
      .not('date', 'like', '<%')  // exclude malformed dates like <UNKNOWN>
      .not('date', 'is', null)
      .order('date', { ascending: true })
      .order('event_entry_id', { ascending: true })  // stable order across pages
    if (eventType !== 'all') q = q.eq('event_type', eventType)
    return q
  }

  // The 'all' tab exceeds PostgREST's 1000-row page; fetch every page.
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}
