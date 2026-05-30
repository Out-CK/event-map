import React, { useEffect, useState, useMemo } from 'react'
import MapView from './components/MapView.jsx'
import VenuePanel from './components/VenuePanel.jsx'
import EventPanel from './components/EventPanel.jsx'
import { fetchEventsByType } from './lib/supabase.js'
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

const TABS = [
  {
    id: 'concert',
    label: '🎵 Concerts',
    accentColor: '#7c6af7',
    markerColor: '#7c6af7',
    markerBorder: '#a89cf7',
    multiColor: '#f4a24a',
    multiBorder: '#f9c07a',
    searchPlaceholder: 'Artist, venue, or title…',
    statLabel: 'concerts',
  },
  {
    id: 'class',
    label: '🎨 Classes',
    accentColor: '#2ec4b6',
    markerColor: '#2ec4b6',
    markerBorder: '#5fd4cc',
    multiColor: '#f4a24a',
    multiBorder: '#f9c07a',
    searchPlaceholder: 'Instructor, venue, or class…',
    statLabel: 'classes',
  },
]

const S = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f14' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: '52px', background: '#16161f',
    borderBottom: '1px solid #2a2a3a', flexShrink: 0, zIndex: 500,
  },
  logo: { fontSize: '15px', fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.3px' },
  stats: { fontSize: '13px', color: '#555' },
  tabBar: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '0 20px', height: '44px', background: '#16161f',
    borderBottom: '1px solid #2a2a3a', flexShrink: 0, zIndex: 499,
  },
  tab: {
    padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', border: 'none', background: 'transparent',
    color: '#666', transition: 'all 0.15s',
  },
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
  errorBox: { color: '#ff6b6b', background: '#2a1a1a', border: '1px solid #4a2a2a', borderRadius: '8px', padding: '16px 24px', fontSize: '14px' },
}

export default function App() {
  const [activeTabId, setActiveTabId] = useState('concert')
  const [eventsByTab, setEventsByTab] = useState({ concert: [], class: [] })
  const [geocacheByTab, setGeocacheByTab] = useState({ concert: {}, class: {} })
  const [loadingByTab, setLoadingByTab] = useState({ concert: true, class: false })
  const [errorByTab, setErrorByTab] = useState({ concert: null, class: null })
  const [loadedTabs, setLoadedTabs] = useState(new Set())

  // Filters (shared across tabs, reset on tab switch)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultDates().from)
  const [dateTo, setDateTo] = useState(defaultDates().to)
  const [genreFilter, setGenreFilter] = useState('')

  // Panel state
  const [panel, setPanel] = useState(null)

  const activeTab = TABS.find(t => t.id === activeTabId)

  async function loadTab(tabId) {
    if (loadedTabs.has(tabId)) return
    setLoadingByTab(prev => ({ ...prev, [tabId]: true }))
    try {
      const data = await fetchEventsByType(tabId)
      const { cache } = geocodeEvents(data, () => {})
      setEventsByTab(prev => ({ ...prev, [tabId]: data }))
      setGeocacheByTab(prev => ({ ...prev, [tabId]: cache }))
      setLoadedTabs(prev => new Set([...prev, tabId]))
    } catch (e) {
      setErrorByTab(prev => ({ ...prev, [tabId]: e.message }))
    } finally {
      setLoadingByTab(prev => ({ ...prev, [tabId]: false }))
    }
  }

  // Load concerts on mount
  useEffect(() => { loadTab('concert') }, [])

  function switchTab(tabId) {
    setActiveTabId(tabId)
    setPanel(null)
    setSearch('')
    setGenreFilter('')
    loadTab(tabId)
  }

  const events = eventsByTab[activeTabId]
  const geocache = geocacheByTab[activeTabId]
  const loading = loadingByTab[activeTabId]
  const error = errorByTab[activeTabId]

  const availableGenres = useMemo(() => {
    const genres = new Set()
    for (const e of events) {
      if (e.genre) genres.add(e.genre)
    }
    return Array.from(genres).sort()
  }, [events])

  const filteredEvents = useMemo(() => {
    const fromDb = inputToDb(dateFrom)
    const toDb = inputToDb(dateTo)
    return events.filter(e => {
      if (fromDb && compareDates(e.date, fromDb) < 0) return false
      if (toDb && compareDates(e.date, toDb) > 0) return false
      if (genreFilter && e.genre !== genreFilter) return false
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
  }, [events, search, dateFrom, dateTo, genreFilter])

  const { venueGroups, unmappedCount, unmappedEventCount } = useMemo(() => {
    const map = new Map()
    for (const e of filteredEvents) {
      const norm = normalizeVenue(e.venue)
      if (!map.has(norm)) {
        map.set(norm, {
          key: norm,
          displayName: cleanVenueName(e.venue),
          address: e.address || null,
          coords: geocache[e.event_entry_id] || null,
          events: [],
        })
      } else {
        const g = map.get(norm)
        if (!g.coords && geocache[e.event_entry_id]) g.coords = geocache[e.event_entry_id]
        if (!g.address && e.address) g.address = e.address
      }
      map.get(norm).events.push(e)
    }
    for (const g of map.values()) {
      g.events.sort((a, b) => compareDates(a.date, b.date) || (a.start_time || '').localeCompare(b.start_time || ''))
    }
    const allGroups = Array.from(map.values())
    const venueGroups = allGroups.filter(g => g.coords)
    const unmappedGroups = allGroups.filter(g => !g.coords)
    const unmappedCount = unmappedGroups.length
    const unmappedEventCount = unmappedGroups.reduce((sum, g) => sum + g.events.length, 0)
    return { venueGroups, unmappedCount, unmappedEventCount }
  }, [filteredEvents, geocache])

  const selectedVenueKey = panel?.type === 'venue' ? panel.venue.key
    : panel?.type === 'event' ? panel.backVenue?.key : null

  function openVenue(venue) { setPanel({ type: 'venue', venue }) }
  function openEvent(event, backVenue) { setPanel({ type: 'event', event, backVenue }) }
  function goBack() {
    if (panel?.backVenue) setPanel({ type: 'venue', venue: panel.backVenue })
    else setPanel(null)
  }
  function closePanel() { setPanel(null) }

  function resetDates() {
    const d = defaultDates()
    setDateFrom(d.from)
    setDateTo(d.to)
    setSearch('')
    setGenreFilter('')
  }

  const totalMapped = venueGroups.length
  const totalEvents = filteredEvents.length

  return (
    <div style={S.root}>
      <div style={S.topbar}>
        <div style={S.logo}>🗽 NYC Map</div>
        <div style={S.stats}>
          {loading
            ? 'Loading…'
            : `${totalEvents} ${activeTab.statLabel} · ${totalMapped} venues${unmappedCount > 0 ? ` · ${unmappedEventCount} not located` : ''}`}
        </div>
      </div>

      <div style={S.tabBar}>
        {TABS.map(tab => {
          const isActive = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              style={{
                ...S.tab,
                background: isActive ? `${tab.accentColor}22` : 'transparent',
                color: isActive ? tab.accentColor : '#666',
                border: isActive ? `1px solid ${tab.accentColor}44` : '1px solid transparent',
              }}
              onClick={() => switchTab(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div style={S.mapArea}>
        <div style={S.filterBar}>
          <input
            style={{ ...S.input, ...S.searchInput }}
            placeholder={activeTab.searchPlaceholder}
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
          {activeTabId === 'concert' && availableGenres.length > 0 && (
            <select
              style={{ ...S.input, width: '140px' }}
              value={genreFilter}
              onChange={e => setGenreFilter(e.target.value)}
            >
              <option value=''>All Genres</option>
              {availableGenres.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
          <button style={S.clearBtn} onClick={resetDates}>Reset</button>
        </div>

        <MapView
          venueGroups={venueGroups}
          selectedVenueKey={selectedVenueKey}
          onSelectVenue={openVenue}
          accentColor={activeTab.accentColor}
          markerColor={activeTab.markerColor}
          markerBorder={activeTab.markerBorder}
          multiColor={activeTab.multiColor}
          multiBorder={activeTab.multiBorder}
        />

        {(loading || error) && (
          <div style={S.loadingOverlay}>
            {error
              ? <div style={S.errorBox}>Error: {error}</div>
              : <div style={S.loadingText}>Fetching {activeTab.statLabel}…</div>
            }
          </div>
        )}

        {panel?.type === 'venue' && (
          <VenuePanel
            venue={panel.venue}
            onSelectEvent={e => openEvent(e, panel.venue)}
            onClose={closePanel}
            accentColor={activeTab.accentColor}
          />
        )}
        {panel?.type === 'event' && (
          <EventPanel
            event={panel.event}
            onBack={goBack}
            onClose={closePanel}
            accentColor={activeTab.accentColor}
          />
        )}
      </div>
    </div>
  )
}
