// Normalize venue names by stripping city/state suffixes for grouping
const VENUE_SUFFIX_RE = /,?\s*(new york(?: city)?|nyc|brooklyn|queens|bronx|manhattan|staten island)(,?\s*(ny|new york))?\s*$/i

export function normalizeVenue(venue) {
  return (venue || '')
    .replace(VENUE_SUFFIX_RE, '')
    .toLowerCase()
    .trim()
    .replace(/,$/, '')
    .trim()
}

export function cleanVenueName(venue) {
  return (venue || '')
    .replace(VENUE_SUFFIX_RE, '')
    .trim()
    .replace(/,$/, '')
    .trim()
}

// DB dates are "MM-DD-YYYY"; HTML date inputs use "YYYY-MM-DD"
export function dbToInput(mmddyyyy) {
  if (!mmddyyyy) return ''
  const [m, d, y] = mmddyyyy.split('-')
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

export function inputToDb(yyyymmdd) {
  if (!yyyymmdd) return ''
  const [y, m, d] = yyyymmdd.split('-')
  return `${m}-${d}-${y}`
}

// Compare two "MM-DD-YYYY" strings chronologically
export function compareDates(a, b) {
  const toNum = s => {
    const parts = (s || '').split('-')
    if (parts.length < 3) return 0
    const [m, d, y] = parts
    if (!m || !d || !y) return 0
    return parseInt(`${y}${m.padStart(2,'0')}${d.padStart(2,'0')}`) || 0
  }
  return toNum(a) - toNum(b)
}

export function formatDisplayDate(mmddyyyy) {
  if (!mmddyyyy) return '—'
  const [m, d, y] = mmddyyyy.split('-')
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  })
}

export function formatTime(t) {
  if (!t) return null
  return t.replace(/^0/, '').toUpperCase()
}
