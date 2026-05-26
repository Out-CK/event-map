const CACHE_KEY = 'concert_map_geocache_v2'
export const NYC_CENTER = { lat: 40.7549, lng: -73.9840 }
const RATE_LIMIT_MS = 1100

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {}
}

let lastRequestTime = 0
async function nominatim(query) {
  const now = Date.now()
  const wait = RATE_LIMIT_MS - (now - lastRequestTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestTime = Date.now()

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`
  const res = await fetch(url, { headers: { 'User-Agent': 'ConcertMap/1.0' } })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data = await res.json()
  return data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
}

function cleanVenue(venue) {
  return venue
    .replace(/,?\s*(new york(?: city)?|nyc|brooklyn|queens|bronx|manhattan|staten island)(,?\s*(ny|new york))?$/i, '')
    .trim().replace(/,$/, '').trim()
}

/**
 * Geocode a list of events. Prefers the stored `address` field over venue name.
 * Results are cached in localStorage by cache key (address or venue).
 */
export async function geocodeEvents(events, onProgress) {
  const cache = loadCache()

  // Build a map: event → cache key to look up
  const eventKeys = events.map(e => e.address || e.venue)
  const missing = [...new Set(eventKeys)].filter(k => !(k in cache))

  let done = eventKeys.filter(k => k in cache).length
  const total = events.length
  onProgress(done, total)

  for (const key of missing) {
    try {
      // Try the key directly first (works well for full addresses),
      // then fall back to appending NYC
      let coords = await nominatim(key)
      if (!coords) coords = await nominatim(`${cleanVenue(key)}, New York City, NY`)
      cache[key] = coords || NYC_CENTER
    } catch {
      cache[key] = NYC_CENTER
    }
    done++
    onProgress(done, total)
    saveCache(cache)
  }

  return { cache, eventKeys }
}
