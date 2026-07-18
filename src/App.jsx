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

// True if the event's genre matches any selected chip. Case-insensitive, and
// compound genres ("Shoegaze/Rock", "pop rock") match on any component word.
// Events with no genre only match the "Other" chip.
function genreMatches(eventGenre, selectedGenres) {
  if (selectedGenres.length === 0) return true
  const raw = (eventGenre || 'Other').toLowerCase()
  const words = raw.split(/[\s/,;+]+/).filter(Boolean)
  return selectedGenres.some(sel => {
    const s = sel.toLowerCase()
    return raw === s || words.includes(s)
  })
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
  {
    id: 'eating',
    label: '🍜 Eating',
    accentColor: '#6ab04c',
    markerColor: '#6ab04c',
    markerBorder: '#93d175',
    multiColor: '#f4a24a',
    multiBorder: '#f9c07a',
    searchPlaceholder: 'Dinner, festival, or venue…',
    statLabel: 'food events',
    genres: [],
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
  filterPanel: {
    position: 'absolute', top: '100%', left: 0, marginTop: '6px',
    background: '#16161f', border: '1px solid #2a2a3a', borderRadius: '10px',
    padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px',
    width: '340px', zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  sectionLabel: {
    fontSize: '11px', fontWeight: 700, color: '#666', textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  rowWrap: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  filterBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '16px', height: '16px', borderRadius: '8px', fontSize: '10px',
    fontWeight: 700, padding: '0 4px', marginLeft: '6px',
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

function FiltersDropdown({
  accentColor, genres, quickDate, onQuickDate, dateFrom, dateTo, onFromChange,
  onToChange, genreFilters, onGenresChange, freeOnly, onFreeChange,
  justAnnounced, onJustAnnouncedChange, buzzingOnly, onBuzzingChange,
  onReset, activeCount,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleGenre(genre) {
    if (genreFilters.includes(genre)) {
      onGenresChange(genreFilters.filter(g => g !== genre))
    } else {
      onGenresChange([...genreFilters, genre])
    }
  }

  const active = activeCount > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{
          ...S.genreBtn,
          ...(active ? { background: `${accentColor}18`, borderColor: `${accentColor}44`, color: accentColor } : {}),
        }}
        onClick={() => setOpen(!open)}
      >
        Filters
        {active && (
          <span style={{ ...S.filterBadge, background: accentColor, color: '#0f0f14' }}>
            {activeCount}
          </span>
        )}
        {' '}{open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={S.filterPanel}>
          <div>
            <div style={{ ...S.sectionLabel, marginBottom: '8px' }}>When</div>
            <div style={S.rowWrap}>
              <button
                style={{ ...S.quickBtn, ...(quickDate === 'today' ? S.quickBtnActive : {}) }}
                onClick={() => onQuickDate('today')}
              >
                Today
              </button>
              <button
                style={{ ...S.quickBtn, ...(quickDate === 'weekend' ? S.quickBtnActive : {}) }}
                onClick={() => onQuickDate('weekend')}
              >
                This Weekend
              </button>
            </div>
            <div style={{ ...S.rowWrap, marginTop: '8px' }}>
              <span style={S.separator}>from</span>
              <input type="date" style={{ ...S.input, ...S.dateInput }} value={dateFrom} onChange={onFromChange} />
              <span style={S.separator}>to</span>
              <input type="date" style={{ ...S.input, ...S.dateInput }} value={dateTo} onChange={onToChange} />
            </div>
          </div>

          <div>
            <div style={{ ...S.sectionLabel, marginBottom: '8px' }}>Price</div>
            <button
              style={{
                ...S.genreChip,
                ...(freeOnly ? { ...S.genreChipActive, background: `${accentColor}22`, borderColor: `${accentColor}66`, color: accentColor } : {}),
              }}
              onClick={() => onFreeChange(!freeOnly)}
            >
              🎟 Free events only
            </button>
          </div>

          <div>
            <div style={{ ...S.sectionLabel, marginBottom: '8px' }}>Discovery</div>
            <div style={S.rowWrap}>
              <button
                style={{
                  ...S.genreChip,
                  ...(justAnnounced ? { ...S.genreChipActive, background: `${accentColor}22`, borderColor: `${accentColor}66`, color: accentColor } : {}),
                }}
                onClick={() => onJustAnnouncedChange(!justAnnounced)}
              >
                🆕 Just announced
              </button>
              <button
                style={{
                  ...S.genreChip,
                  ...(buzzingOnly ? { ...S.genreChipActive, background: `${accentColor}22`, borderColor: `${accentColor}66`, color: accentColor } : {}),
                }}
                onClick={() => onBuzzingChange(!buzzingOnly)}
              >
                🔥 Buzzing
              </button>
            </div>
          </div>

          {genres.length > 0 && (
            <div>
              <div style={{ ...S.sectionLabel, marginBottom: '8px' }}>Genre</div>
              <div style={S.rowWrap}>
                {genres.map(g => (
                  <button
                    key={g}
                    style={{
                      ...S.genreChip,
                      ...(genreFilters.includes(g) ? { ...S.genreChipActive, background: `${accentColor}22`, borderColor: `${accentColor}66`, color: accentColor } : {}),
                    }}
                    onClick={() => toggleGenre(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button style={{ ...S.clearBtn, alignSelf: 'flex-start' }} onClick={onReset}>
            Reset all filters
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [activeTabId, setActiveTabId] = useState('concert')
  const [eventsByTab, setEventsByTab] = useState({ concert: [], comedy: [], theater: [], class: [], art: [], eating: [] })
  const [geocacheByTab, setGeocacheByTab] = useState({ concert: {}, comedy: {}, theater: {}, class: {}, art: {}, eating: {} })
  const [loadingByTab, setLoadingByTab] = useState({ concert: true, comedy: false, theater: false, class: false, art: false, eating: false })
  const [errorByTab, setErrorByTab] = useState({ concert: null, comedy: null, theater: null, class: null, art: null, eating: null })
  const [loadedTabs, setLoadedTabs] = useState(new Set())

  // Filters
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultDates().from)
  const [dateTo, setDateTo] = useState(defaultDates().to)
  const [genreFilters, setGenreFilters] = useState([])
  const [quickDate, setQuickDate] = useState(null) // 'today' | 'weekend' | null
  const [justAnnounced, setJustAnnounced] = useState(false) // added in the last 7 days
  const [buzzingOnly, setBuzzingOnly] = useState(false) // listed by 2+ sources
  const [freeOnly, setFreeOnly] = useState(false)

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
    setFreeOnly(false)
    setJustAnnounced(false)
    setBuzzingOnly(false)
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
    const announcedCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return events.filter(e => {
      if (fromDb && compareDates(e.date, fromDb) < 0) return false
      if (toDb && compareDates(e.date, toDb) > 0) return false
      if (freeOnly && e.is_free !== true) return false
      if (justAnnounced && (!e.created_at || new Date(e.created_at).getTime() < announcedCutoff)) return false
      if (buzzingOnly && (e.seen_sources?.length ?? 0) < 2) return false
      if (!genreMatches(e.genre, genreFilters)) return false
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
  }, [events, search, dateFrom, dateTo, genreFilters, freeOnly, justAnnounced, buzzingOnly])

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
    setFreeOnly(false)
    setJustAnnounced(false)
    setBuzzingOnly(false)
  }

  const totalMapped = venueGroups.length
  const totalEvents = filteredEvents.length
  const defaults = defaultDates()
  const datesCustomized = !quickDate && (dateFrom !== defaults.from || dateTo !== defaults.to)
  const activeFilterCount =
    (quickDate || datesCustomized ? 1 : 0) + genreFilters.length + (freeOnly ? 1 : 0) +
    (justAnnounced ? 1 : 0) + (buzzingOnly ? 1 : 0)
  const hasFilters = search.trim() || activeFilterCount > 0

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
        <a
          href="/feed"
          style={{
            ...S.tab,
            marginLeft: 'auto',
            textDecoration: 'none',
            color: '#e05c6d',
            background: '#e05c6d18',
            border: '1px solid #e05c6d44',
          }}
        >
          🗽 Discovery
        </a>
      </div>

      <div style={S.mapArea}>
        <div style={S.filterBar}>
          <input
            style={{ ...S.input, ...S.searchInput }}
            placeholder={activeTab.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <FiltersDropdown
            accentColor={activeTab.accentColor}
            genres={activeTab.genres}
            quickDate={quickDate}
            onQuickDate={applyQuickDate}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onFromChange={handleDateChange(setDateFrom)}
            onToChange={handleDateChange(setDateTo)}
            genreFilters={genreFilters}
            onGenresChange={setGenreFilters}
            freeOnly={freeOnly}
            onFreeChange={setFreeOnly}
            justAnnounced={justAnnounced}
            onJustAnnouncedChange={setJustAnnounced}
            buzzingOnly={buzzingOnly}
            onBuzzingChange={setBuzzingOnly}
            onReset={resetDates}
            activeCount={activeFilterCount}
          />
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
