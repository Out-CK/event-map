import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function fetchEventsByType(eventType) {
  // Only the columns the map renders — select('*') drags the multi-KB
  // webpage_contents columns along and times out the statement at ~3k rows.
  const COLUMNS = [
    'event_entry_id', 'event_title', 'description', 'artist', 'venue',
    'event_type', 'multi_day_event', 'date', 'start_time', 'end_time',
    'genre', 'is_free', 'address', 'lat', 'lng', 'media_url',
    'tickets_source_1', 'tickets_source_2', 'tickets_source_3', 'tickets_source_4',
    'no_tickets_source_1', 'no_tickets_source_2', 'no_tickets_source_3', 'no_tickets_source_4',
    'seen_sources', 'created_at', 'announced_at',
    'buzz_score', 'buzz_reasons', 'buzzing',
  ].join(',')

  const buildQuery = () => {
    let q = supabase
      .from('event_entry_database_v2')
      .select(COLUMNS)
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
