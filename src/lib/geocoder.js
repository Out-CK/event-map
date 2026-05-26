const CACHE_KEY = 'concert_map_geocache_v1'
const NYC_CENTER = { lat: 40.7549, lng: -73.9840 }
const RATE_LIMIT_MS = 1100 // Nominatim: max 1 req/sec

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

let lastRequestTime = 0

async function geocodeOne(venueName) {
  // Rate-limit to Nominatim's 1 req/sec policy
  const now = Date.now()
  const wait = RATE_LIMIT_MS - (now - lastRequestTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestTime = Date.now()

  // Strip city/state suffixes — Nominatim finds venues better without them
  const cleaned = venueName
    .replace(/,?\s*(new york(?: city)?|nyc|brooklyn|queens|bronx|manhattan|staten island)(,?\s*(ny|new york))?$/i, '')
    .trim()

  const query = encodeURIComponent(`${cleaned}, New York City, NY`)
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=us`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'ConcertMap/1.0 (internal tool)' },
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)

  const results = await res.json()
  if (results.length === 0) return null

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
}

/**
 * Geocode a list of unique venue names.
 * Results are cached in localStorage so only new venues are fetched.
 * onProgress(done, total) is called after each geocode attempt.
 */
export async function geocodeVenues(venueNames, onProgress) {
  const cache = loadCache()
  const missing = venueNames.filter(v => !(v in cache))

  let done = venueNames.length - missing.length
  const total = venueNames.length

  onProgress(done, total)

  for (const venue of missing) {
    try {
      const coords = await geocodeOne(venue)
      cache[venue] = coords || NYC_CENTER // fallback to NYC center
    } catch {
      cache[venue] = NYC_CENTER
    }
    done++
    onProgress(done, total)
    saveCache(cache)
  }

  return cache
}

export { NYC_CENTER }
