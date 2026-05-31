import React, { useEffect, useState, useMemo, useRef } from 'react'
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

function todayRange() {
  const t = new Date().toISOString().slice(0, 10)
  return { from: t, to: t }
}

function weekendRange() {
  const today = new Date()
  const day = today.getDay() // 0=Sun, 5=Fri, 6=Sat
  const fri = new Date(today)
  const sun = new Date(today)
  if (day <= 4) {
    fri.setDate(today.getDate() + (5 - day))
    sun.setDate(today.getDate() + (7 - day))
  } else if (day === 5) {
    sun.setDate(today.getDate() + 2)
  } else if (day === 6) {
    fri.setDate(today.getDate() - 1)
    sun.setDate(today.getDate() + 1)
  } else {
    fri.setDate(today.getDate() - 2)
  }
  const fmt = d => d.toISOString().slice(0, 10)
  return { from: fmt(fri), to: fmt(sun) }
}

const CONCERT_GENRES = [
  'Alternative', 'Blues', 'Classical', 'Country', 'Electronic',
  'Experimental', 'Folk', 'Gospel', 'Hip-Hop', 'Indie', 'Jazz',
  'Latin', 'Metal', 'Other', 'Pop', 'Punk', 'R&B', 'Reggae', 'Rock', 'World',
]

const ART_GENRES = [
  'Ceramics', 'Contemporary', 'Drawing', 'Installation', 'Mixed Media',
  'Modern', 'Other', 'Painting', 'Performance', 'Photography', 'Printmaking',
  'Sculpture', 'Street Art', 'Textile', 'Video Art',
]

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
    genres: CONCERT_GENRES,
  },
  {
    id: 'comedy',
    label: '🎤 Comedy',
    accentColor: '#e05c8a',
    markerColor: '#e05c8a',
    markerBorder: '#f08aae',
    multiColor: '#f4a24a',
    multiBorder: '#f9c07a',
    searchPlaceholder: 'Comedian, venue, or show…',
    statLabel: 'shows',
    genres: [],
  },
  {
    id: 'theater',
    label: '🎭 Theater',
    accentColor: '#c0392b',
    markerColor: '#c0392b',
    markerBorder: '#e05c4e',
    multiColor: '#f4a24a',
    multiBorder: '#f9c07a',
    searchPlaceholder: 'Show, theater, or production…',
    statLabel: 'productions',
    genres: [],
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
    genres: [],
  },
  {
    id: 'art',
    label: '🖼 Art',
    accentColor: '#e8a045',
    markerColor: '#e8a045',
    markerBorder: '#f0bc72',
    multiColor: '#f4a24a',
    multiBorder: '#f9c07a',
    searchPlaceholder: 'Artist, gallery, or exhibition…',
    statLabel: 'exhibitions',
    genres: ART_GENRES,
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
  quickBtn: {
    background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '6px',
    color: '#aaa', fontSize: '12px', padding: '7px 12px', cursor: 'pointer',
    transition: 'all 0.15s',
  },
  quickBtnActive: {
    background: '#2a2a4a', border: '1px solid #5a5a8a', color: '#c8c0ff',
  },
  genreBtn: {
    background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '6px',
    color: '#aaa', fontSize: '12px', padding: '7px 12px', cursor: 'pointer',
    position: 'relative',
  },
  genreDropdown: {
    position: 'absolute', top: '100%', left: 0, marginTop: '6px',
    background: '#16161f', border: '1px solid #2a2a3a', borderRadius: '10px',
    padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px',
    width: '320px', zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  genreChip: {
    padding: '5px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: 500,
    cursor: 'pointer', border: '1px solid #2a2a3a', background: '#1e1e2e',
    color: '#888', transition: 'all 0.12s', whiteSpace: 'nowrap',
  },
  genreChipActive: {
    background: '#2a2a5a', border: '1px solid #6a6aaa', color: '#d0d0ff',
  },
  loadingOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(15,15,20,0.88)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000, gap: '16px',
  },
  loadingText: { color: '#aaa', fontSize: '14px' },
  errorBox: { color: '#ff6b6b', background: '#2a1a1a', border: '1px solid #4a2a2a', borderRadius: '8px', padding: '16px 24px', fontSize: '14px' },
  emptyState: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    zIndex: 950, textAlign: 'center', pointerEvents: 'none',
  },
  emptyText: { color: '#555', fontSize: '16px', fontWeight: 600, marginBottom: '8px' },
  emptySub: { color: '#3a3a4a', fontSize: '13px' },
}

function GenreMultiSelect({ genres, selected, onChange, accentColor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(genre) {
    if (selected.includes(genre)) {
      onChange(selected.filter(g => g !== genre))
    } else {
      onChange([...selected, genre])
    }
  }

  const label = selected.length === 0
    ? 'All Genres'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} genres`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{
          ...S.genreBtn,
          ...(selected.length > 0 ? { background: `${accentColor}18`, borderColor: `${accentColor}44`, color: accentColor } : {}),
        }}
        onClick={() => setOpen(!open)}
      >
        {label} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={S.genreDropdown}>
          {genres.map(g => (
            <button
              key={g}
              style={{
                ...S.genreChip,
                ...(selected.includes(g) ? { ...S.genreChipActive, background: `${accentColor}22`, borderColor: `${accentColor}66`, color: accentColor } : {}),
              }}
              onClick={() => toggle(g)}
            >
              {g}
            </button>
          ))}
          {selected.length > 0 && (
            <button
              style={{ ...S.genreChip, color: '#ff6b6b', borderColor: '#4a2a2a' }}
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [activeTabId, setActiveTabId] = useState('concert')
  const [eventsByTab, setEventsByTab] = useState({ concert: [], comedy: [], theater: [], class: [], art: [] })
  const [geocacheByTab, setGeocacheByTab] = useState({ concert: {}, comedy: {}, theater: {}, class: {}, art: {} })
  const [loadingByTab, setLoadingByTab] = useState({ concert: true, comedy: false, theater: false, class: false, art: false })
  const [errorByTab, setErrorByTab] = useState({ concert: null, comedy: null, theater: null, class: null, art: null })
  const [loadedTabs, setLoadedTabs] = useState(new Set())

  // Filters
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultDates().from)
  const [dateTo, setDateTo] = useState(defaultDates().to)
  const [genreFilters, setGenreFilters] = useState([])
  const [quickDate, setQuickDate] = useState(null) // 'today' | 'weekend' | null

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

  useEffect(() => { loadTab('concert') }, [])

  function switchTab(tabId) {
    setActiveTabId(tabId)
    setPanel(null)
    setSearch('')
    setGenreFilters([])
    setQuickDate(null)
    loadTab(tabId)
  }

  function applyQuickDate(type) {
    if (quickDate === type) {
      // Toggle off — restore defaults
      const d = defaultDates()
      setDateFrom(d.from)
      setDateTo(d.to)
      setQuickDate(null)
      return
    }
    const range = type === 'today' ? todayRange() : weekendRange()
    setDateFrom(range.from)
    setDateTo(range.to)
    setQuickDate(type)
  }

  function handleDateChange(setter) {
    return (e) => {
      setter(e.target.value)
      setQuickDate(null) // manual date change clears quick filter
    }
  }

  const events = eventsByTab[activeTabId]
  const geocache = geocacheByTab[activeTabId]
  const loading = loadingByTab[activeTabId]
  const error = errorByTab[activeTabId]

  const filteredEvents = useMemo(() => {
    const fromDb = inputToDb(dateFrom)
    const toDb = inputToDb(dateTo)
    return events.filter(e => {
      if (fromDb && compareDates(e.date, fromDb) < 0) return false
      if (toDb && compareDates(e.date, toDb) > 0) return false
      if (genreFilters.length > 0 && e.genre && !genreFilters.includes(e.genre)) return false
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
  }, [events, search, dateFrom, dateTo, genreFilters])

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
    setGenreFilters([])
    setQuickDate(null)
  }

  const totalMapped = venueGroups.length
  const totalEvents = filteredEvents.length
  const hasFilters = search.trim() || genreFilters.length > 0 || quickDate

  return (
    <div style={S.root}>
      <div style={S.topbar}>
        <div style={S.logo}>🗽 NYC Events</div>
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
          <button
            style={{ ...S.quickBtn, ...(quickDate === 'today' ? S.quickBtnActive : {}) }}
            onClick={() => applyQuickDate('today')}
          >
            Today
          </button>
          <button
            style={{ ...S.quickBtn, ...(quickDate === 'weekend' ? S.quickBtnActive : {}) }}
            onClick={() => applyQuickDate('weekend')}
          >
            This Weekend
          </button>
          <span style={S.separator}>from</span>
          <input
            type="date"
            style={{ ...S.input, ...S.dateInput }}
            value={dateFrom}
            onChange={handleDateChange(setDateFrom)}
          />
          <span style={S.separator}>to</span>
          <input
            type="date"
            style={{ ...S.input, ...S.dateInput }}
            value={dateTo}
            onChange={handleDateChange(setDateTo)}
          />
          {activeTab.genres.length > 0 && (
            <GenreMultiSelect
              genres={activeTab.genres}
              selected={genreFilters}
              onChange={setGenreFilters}
              accentColor={activeTab.accentColor}
            />
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

        {/* Empty state */}
        {!loading && !error && totalEvents === 0 && (
          <div style={S.emptyState}>
            <div style={S.emptyText}>No {activeTab.statLabel} found</div>
            <div style={S.emptySub}>
              {hasFilters
                ? 'Try adjusting your filters or search term'
                : 'No events in this date range'}
            </div>
          </div>
        )}

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
            searchQuery={search}
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
