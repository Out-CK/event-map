export const NYC_CENTER = { lat: 40.7549, lng: -73.9840 }

/**
 * Build a geocache from event rows that already have lat/lng stored in the DB.
 * Returns { cache: { event_entry_id → {lat, lng} | null }, eventKeys: [] }
 * eventKeys is kept for API compatibility with App.jsx.
 */
export function geocodeEvents(events, onProgress) {
  const cache = {}
  for (const e of events) {
    cache[e.event_entry_id] =
      e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : null
  }
  // eventKeys mirrors the old API: one key per event, keyed by event_entry_id
  const eventKeys = events.map(e => e.event_entry_id)
  onProgress(events.length, events.length)
  return { cache, eventKeys }
}
