import React, { useEffect, useState, useMemo } from 'react'
import MapView from './components/MapView.jsx'
import VenuePanel from './components/VenuePanel.jsx'
import EventPanel from './components/EventPanel.jsx'
import { fetchAllEvents } from './lib/supabase.js'
import { geocodeEvents } from './lib/geocoder.js'
import { normalizeVenue, cleanVenueName, compareDates, dbToInput, inputToDb } from './lib/utils.js'

// Default date range: today → 60 days out
function defaultDates() {
  const today = new Date()
  const future = new Date(today)
  future.setDate(future.getDate() + 60)
  const fmt = d => d.toISOString().slice(0, 10)
  return { from: fmt(today), to: fmt(future) }
}

const S = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f14' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: '52px', background: '#16161f',
    borderBottom: '1px solid #2a2a3a', flexShrink: 0, zIndex: 500,
  },
  logo: { fontSize: '15px', fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.3px' },
  stats: { fontSize: '13px', color: '#555' },
  mapArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  filterBar: {
    position: 'absolute', top: '12px', left: '12px', zIndex: 900,
    display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
  },
  input: {
    background: '#16161f', border: '1px solid #2a2a3a', borderRadius: '8px',
    color: '#f0f0f0', fontSize: '13px', padding: '7px 11px', outline: 'none',
    colorScheme: 'dark',
  },
  searchInput: { width: '200px' },
  dateInput: { width: '140px' },
  separator: { color: '#444', fontSize: '12px', userSelect: 'none' },
  clearBtn: {
    background: '#2a2a3a', border: 'none', borderRadius: '6px',
    color: '#aaa', fontSize: '12px', padding: '7px 12px', cursor: 'pointer',
  },
  loadingOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(15,15,20,0.88)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000, gap: '16px',
  },
  loadingText: { color: '#aaa', fontSize: '14px' },
  progressBar: { width: '240px', height: '4px', background: '#2a2a3a', borderRadius: '2px', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#7c6af7', borderRadius: '2px', transition: 'width 0.3s ease' },
  errorBox: { color: '#ff6b6b', background: '#2a1a1a', border: '1px solid #4a2a2a', borderRadius: '8px', padding: '16px 24px', fontSize: '14px' },
}

export default function App() {
  const [events, setEvents] = useState([])
  const [geocache, setGeocache] = useState({})        // event_entry_id → {lat, lng}
  const [loading, setLoading] = useState(true)
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultDates().from)
  const [dateTo, setDateTo] = useState(defaultDates().to)

  // Panel state: null | { type:'venue', venue } | { type:'event', event, backVenue }
  const [panel, setPanel] = useState(null)

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        const data = await fetchAllEvents()
        setEvents(data)
        setGeocodeProgress({ done: 0, total: data.length })
        const { cache, eventKeys } = await geocodeEvents(data, (done, total) => {
          setGeocodeProgress({ done, total })
        })
        const perEvent = {}
        data.forEach((e, i) => { perEvent[e.event_entry_id] = cache[eventKeys[i]] })
        setGeocache(perEvent)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Apply filters: search + date range
  const filteredEvents = useMemo(() => {
    const fromDb = inputToDb(dateFrom)
    const toDb = inputToDb(dateTo)
    return events.filter(e => {
      if (fromDb && compareDates(e.date, fromDb) < 0) return false
      if (toDb && compareDates(e.date, toDb) > 0) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          e.event_title?.toLowerCase().includes(q) ||
          e.artist?.toLowerCase().includes(q) ||
          e.venue?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [events, search, dateFrom, dateTo])

  // Group filtered events by normalized venue → one marker per venue
  const venueGroups = useMemo(() => {
    const map = new Map()
    for (const e of filteredEvents) {
      const norm = normalizeVenue(e.venue)
      if (!map.has(norm)) {
        map.set(norm, {
          key: norm,
          displayName: cleanVenueName(e.venue),
          address: e.address || null,
          coords: geocache[e.event_entry_id],
          events: [],
        })
      } else {
        // Update coords if this entry has them and the group doesn't
        const g = map.get(norm)
        if (!g.coords && geocache[e.event_entry_id]) g.coords = geocache[e.event_entry_id]
        if (!g.address && e.address) g.address = e.address
      }
      map.get(norm).events.push(e)
    }
    // Sort events within each group by date then start_time
    for (const g of map.values()) {
      g.events.sort((a, b) => compareDates(a.date, b.date) || (a.start_time || '').localeCompare(b.start_time || ''))
    }
    return Array.from(map.values()).filter(g => g.coords)
  }, [filteredEvents, geocache])

  const selectedVenueKey = panel?.type === 'venue' ? panel.venue.key
    : panel?.type === 'event' ? panel.backVenue?.key : null

  function openVenue(venue) {
    setPanel({ type: 'venue', venue })
  }
  function openEvent(event, backVenue) {
    setPanel({ type: 'event', event, backVenue })
  }
  function goBack() {
    if (panel?.backVenue) setPanel({ type: 'venue', venue: panel.backVenue })
    else setPanel(null)
  }
  function closePanel() { setPanel(null) }

  const pct = geocodeProgress.total > 0
    ? Math.round((geocodeProgress.done / geocodeProgress.total) * 100) : 100

  const totalMapped = venueGroups.length
  const totalEvents = filteredEvents.length

  function resetDates() {
    const d = defaultDates()
    setDateFrom(d.from)
    setDateTo(d.to)
    setSearch('')
  }

  return (
    <div style={S.root}>
      <div style={S.topbar}>
        <div style={S.logo}>🎵 NYC Concert Map</div>
        <div style={S.stats}>
          {loading
            ? geocodeProgress.total > 0 ? `Geocoding… ${geocodeProgress.done}/${geocodeProgress.total}` : 'Loading…'
            : `${totalEvents} events · ${totalMapped} venues`}
        </div>
      </div>

      <div style={S.mapArea}>
        <div style={S.filterBar}>
          <input
            style={{ ...S.input, ...S.searchInput }}
            placeholder="Artist, venue, or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span style={S.separator}>from</span>
          <input
            type="date"
            style={{ ...S.input, ...S.dateInput }}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span style={S.separator}>to</span>
          <input
            type="date"
            style={{ ...S.input, ...S.dateInput }}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
          <button style={S.clearBtn} onClick={resetDates}>Reset</button>
        </div>

        <MapView
          venueGroups={venueGroups}
          selectedVenueKey={selectedVenueKey}
          onSelectVenue={openVenue}
        />

        {loading && (
          <div style={S.loadingOverlay}>
            {error
              ? <div style={S.errorBox}>Error: {error}</div>
              : <>
                  <div style={S.loadingText}>
                    {geocodeProgress.total > 0
                      ? `Geocoding venues… ${geocodeProgress.done} / ${geocodeProgress.total}`
                      : 'Fetching events…'}
                  </div>
                  <div style={S.progressBar}>
                    <div style={{ ...S.progressFill, width: `${pct}%` }} />
                  </div>
                </>
            }
          </div>
        )}

        {panel?.type === 'venue' && (
          <VenuePanel
            venue={panel.venue}
            onSelectEvent={e => openEvent(e, panel.venue)}
            onClose={closePanel}
          />
        )}
        {panel?.type === 'event' && (
          <EventPanel
            event={panel.event}
            onBack={goBack}
            onClose={closePanel}
          />
        )}
      </div>
    </div>
  )
}
