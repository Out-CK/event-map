import React, { useEffect, useState, useMemo, useRef } from 'react'
import MapView from './components/MapView.jsx'
import VenuePanel from './components/VenuePanel.jsx'
import EventPanel from './components/EventPanel.jsx'
import { fetchEventsByType } from './lib/supabase.js'
import { geocodeEvents } from './lib/geocoder.js'
import { normalizeVenue, cleanVenueName, compareDates, inputToDb } from './lib/utils.js'

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

// Minimum buzz_score (computed daily by the source-agent buzz scorer from
// sighting velocity, social engagement, and on-sale momentum) for 🔥 Buzzing.
const BUZZ_THRESHOLD = 1.0

const ACCENT = '#7c6af7'

const TYPES = [
  { id: 'concert', label: '🎵 Concerts', color: '#7c6af7', border: '#a89cf7' },
  { id: 'comedy', label: '🎤 Comedy', color: '#e05c8a', border: '#f08aae' },
  { id: 'theater', label: '🎭 Theater', color: '#c0392b', border: '#e05c4e' },
  { id: 'class', label: '🎨 Classes', color: '#2ec4b6', border: '#5fd4cc' },
  { id: 'art', label: '🖼 Art', color: '#e8a045', border: '#f0bc72' },
  { id: 'eating', label: '🍜 Eating', color: '#6ab04c', border: '#93d175' },
]

const TYPE_COLORS = Object.fromEntries(TYPES.map(t => [t.id, { color: t.color, border: t.border }]))

// How new is "new": announced today, or in the last 3 days. Older than 3 days
// is not new at all.
const NEW_WINDOWS = {
  today: { label: '🆕 New today', days: 1 },
  '3days': { label: '🆕 New (last 3 days)', days: 3 },
}

function announcedAtMs(e) {
  const t = e.announced_at || e.created_at
  return t ? new Date(t).getTime() : null
}

const S = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f14' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: '52px', background: '#16161f',
    borderBottom: '1px solid #2a2a3a', flexShrink: 0, zIndex: 500,
  },
  logo: { fontSize: '15px', fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.3px' },
  topRight: { display: 'flex', alignItems: 'center', gap: '14px' },
  stats: { fontSize: '13px', color: '#555' },
  discoveryLink: {
    padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
    textDecoration: 'none', color: '#e05c6d', background: '#e05c6d18',
    border: '1px solid #e05c6d44',
  },
  mapArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  filterBar: {
    position: 'absolute', top: '12px', left: '58px', zIndex: 900,
    display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
  },
  input: {
    background: '#16161f', border: '1px solid #2a2a3a', borderRadius: '8px',
    color: '#f0f0f0', fontSize: '13px', padding: '7px 11px', outline: 'none',
    colorScheme: 'dark',
  },
  dateInput: { width: '140px' },
  separator: { color: '#444', fontSize: '12px', userSelect: 'none' },
  searchCircle: {
    width: '36px', height: '36px', borderRadius: '50%', background: '#16161f',
    border: '1px solid #2a2a3a', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: '#aaa', flexShrink: 0,
    transition: 'all 0.15s', padding: 0,
  },
  searchExpanded: {
    display: 'flex', alignItems: 'center', gap: '6px', background: '#16161f',
    border: '1px solid #2a2a3a', borderRadius: '18px', padding: '0 6px 0 12px',
    height: '36px',
  },
  searchInput: {
    background: 'transparent', border: 'none', outline: 'none', color: '#f0f0f0',
    fontSize: '13px', width: '190px',
  },
  ddBtn: {
    background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '18px',
    color: '#aaa', fontSize: '13px', fontWeight: 600, padding: '8px 14px',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  ddPanel: {
    position: 'absolute', top: '100%', left: 0, marginTop: '6px',
    background: '#16161f', border: '1px solid #2a2a3a', borderRadius: '12px',
    padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px',
    minWidth: '210px', zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  ddItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
    borderRadius: '8px', fontSize: '13px', color: '#ccc', cursor: 'pointer',
    background: 'transparent', border: 'none', textAlign: 'left', width: '100%',
  },
  ddItemActive: { background: `${ACCENT}1e`, color: '#d6cfff' },
  check: { width: '16px', textAlign: 'center', flexShrink: 0 },
  dot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  ddDivider: { height: '1px', background: '#2a2a3a', margin: '6px 4px' },
  ddLabel: {
    fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase',
    letterSpacing: '0.8px', padding: '6px 10px 2px',
  },
  filterBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '16px', height: '16px', borderRadius: '8px', fontSize: '10px',
    fontWeight: 700, padding: '0 4px', marginLeft: '6px',
    background: ACCENT, color: '#0f0f14',
  },
  clearBtn: {
    background: 'none', border: 'none', color: '#666', fontSize: '12px',
    cursor: 'pointer', padding: '6px 10px', textAlign: 'left',
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

// ── Generic dropdown shell ───────────────────────────────────────────────────

function Dropdown({ label, active, badge, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{
          ...S.ddBtn,
          ...(active ? { background: `${ACCENT}18`, borderColor: `${ACCENT}44`, color: ACCENT } : {}),
        }}
        onClick={() => setOpen(!open)}
      >
        {label}
        {badge > 0 && <span style={S.filterBadge}>{badge}</span>}
        {' '}{open ? '▴' : '▾'}
      </button>
      {open && <div style={S.ddPanel}>{children}</div>}
    </div>
  )
}

function Item({ active, onClick, children, color }) {
  return (
    <button style={{ ...S.ddItem, ...(active ? S.ddItemActive : {}) }} onClick={onClick}>
      <span style={S.check}>{active ? '✓' : ''}</span>
      {color && <span style={{ ...S.dot, background: color }} />}
      <span>{children}</span>
    </button>
  )
}

// ── Search: a circle that expands into an input ──────────────────────────────

function SearchControl({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open && !value) {
    return (
      <button style={S.searchCircle} onClick={() => setOpen(true)} title="Search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.3" y2="16.3" />
        </svg>
      </button>
    )
  }

  return (
    <div style={S.searchExpanded}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.3" y2="16.3" />
      </svg>
      <input
        ref={inputRef}
        style={S.searchInput}
        placeholder="Artist, venue, or title…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (!value) setOpen(false) }}
      />
      <button
        style={{ ...S.searchCircle, width: '24px', height: '24px', border: 'none', fontSize: '13px' }}
        onClick={() => { onChange(''); setOpen(false) }}
        title="Clear"
      >
        ✕
      </button>
    </div>
  )
}

export default function App() {
  const [events, setEvents] = useState([])
  const [geocache, setGeocache] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Controls
  const [search, setSearch] = useState('')
  const [typeFilters, setTypeFilters] = useState([]) // [] = All
  const [dateFrom, setDateFrom] = useState(defaultDates().from)
  const [dateTo, setDateTo] = useState(defaultDates().to)
  const [quickDate, setQuickDate] = useState(null) // 'today' | 'weekend' | null
  const [freeOnly, setFreeOnly] = useState(false)
  const [buzzingOnly, setBuzzingOnly] = useState(false)
  const [newWindow, setNewWindow] = useState(null) // 'today' | '3days' | null

  // Panel state
  const [panel, setPanel] = useState(null)

  useEffect(() => {
    fetchEventsByType('all')
      .then(data => {
        const { cache } = geocodeEvents(data, () => {})
        setEvents(data)
        setGeocache(cache)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleType(id) {
    setPanel(null)
    setTypeFilters(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  function selectAllTypes() {
    setPanel(null)
    setTypeFilters([])
  }

  function applyQuickDate(type) {
    if (quickDate === type) {
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
      setQuickDate(null)
    }
  }

  const filteredEvents = useMemo(() => {
    const fromDb = inputToDb(dateFrom)
    const toDb = inputToDb(dateTo)
    const newCutoff = newWindow
      ? Date.now() - NEW_WINDOWS[newWindow].days * 24 * 60 * 60 * 1000
      : null
    return events.filter(e => {
      if (typeFilters.length > 0 && !typeFilters.includes(e.event_type)) return false
      if (fromDb && compareDates(e.date, fromDb) < 0) return false
      if (toDb && compareDates(e.date, toDb) > 0) return false
      if (freeOnly && e.is_free !== true) return false
      if (buzzingOnly && (e.buzz_score ?? 0) < BUZZ_THRESHOLD) return false
      if (newCutoff) {
        const announced = announcedAtMs(e)
        if (!announced || announced < newCutoff) return false
      }
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
  }, [events, search, typeFilters, dateFrom, dateTo, freeOnly, buzzingOnly, newWindow])

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
    // Color each venue dot by its dominant category so the mix stays legible
    for (const g of allGroups) {
      const counts = {}
      for (const e of g.events) counts[e.event_type] = (counts[e.event_type] || 0) + 1
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
      const tc = TYPE_COLORS[dominant]
      if (tc) {
        g.markerColor = tc.color
        g.markerBorder = tc.border
      }
    }
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

  // Dropdown labels
  const typeLabel = typeFilters.length === 0
    ? 'All types'
    : typeFilters.length === 1
      ? TYPES.find(t => t.id === typeFilters[0])?.label ?? '1 type'
      : `${typeFilters.length} types`

  const defaults = defaultDates()
  const datesCustomized = !quickDate && (dateFrom !== defaults.from || dateTo !== defaults.to)
  const timeLabel = quickDate === 'today' ? 'Today'
    : quickDate === 'weekend' ? 'This weekend'
      : datesCustomized ? 'Custom dates' : 'Time'

  const tagCount = (freeOnly ? 1 : 0) + (buzzingOnly ? 1 : 0) + (newWindow ? 1 : 0)

  const totalMapped = venueGroups.length
  const totalEvents = filteredEvents.length
  const hasFilters = search.trim() || typeFilters.length > 0 || quickDate || datesCustomized || tagCount > 0

  return (
    <div style={S.root}>
      <div style={S.topbar}>
        <div style={S.logo}>🗽 NYC Events</div>
        <div style={S.topRight}>
          <div style={S.stats}>
            {loading
              ? 'Loading…'
              : `${totalEvents} events · ${totalMapped} venues${unmappedCount > 0 ? ` · ${unmappedEventCount} not located` : ''}`}
          </div>
          <a href="/feed" style={S.discoveryLink}>🗽 Discovery</a>
        </div>
      </div>

      <div style={S.mapArea}>
        <div style={S.filterBar}>
          <SearchControl value={search} onChange={setSearch} />

          <Dropdown label={typeLabel} active={typeFilters.length > 0}>
            <Item active={typeFilters.length === 0} onClick={selectAllTypes}>
              🗽 All
            </Item>
            <div style={S.ddDivider} />
            {TYPES.map(t => (
              <Item
                key={t.id}
                active={typeFilters.includes(t.id)}
                onClick={() => toggleType(t.id)}
                color={t.color}
              >
                {t.label}
              </Item>
            ))}
          </Dropdown>

          <Dropdown label={timeLabel} active={Boolean(quickDate || datesCustomized)}>
            <Item active={!quickDate && !datesCustomized} onClick={() => {
              const d = defaultDates()
              setDateFrom(d.from)
              setDateTo(d.to)
              setQuickDate(null)
            }}>
              Any time (next 60 days)
            </Item>
            <Item active={quickDate === 'today'} onClick={() => applyQuickDate('today')}>
              Today
            </Item>
            <Item active={quickDate === 'weekend'} onClick={() => applyQuickDate('weekend')}>
              This weekend
            </Item>
            <div style={S.ddDivider} />
            <div style={S.ddLabel}>Custom range</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px 8px' }}>
              <input type="date" style={{ ...S.input, ...S.dateInput }} value={dateFrom} onChange={handleDateChange(setDateFrom)} />
              <span style={S.separator}>→</span>
              <input type="date" style={{ ...S.input, ...S.dateInput }} value={dateTo} onChange={handleDateChange(setDateTo)} />
            </div>
          </Dropdown>

          <Dropdown label="Tags" active={tagCount > 0} badge={tagCount}>
            <Item active={freeOnly} onClick={() => setFreeOnly(!freeOnly)}>
              🎟 Free events
            </Item>
            <Item active={buzzingOnly} onClick={() => setBuzzingOnly(!buzzingOnly)}>
              🔥 Buzzing
            </Item>
            <div style={S.ddDivider} />
            <div style={S.ddLabel}>New</div>
            {Object.entries(NEW_WINDOWS).map(([key, w]) => (
              <Item
                key={key}
                active={newWindow === key}
                onClick={() => setNewWindow(newWindow === key ? null : key)}
              >
                {w.label}
              </Item>
            ))}
            {tagCount > 0 && (
              <>
                <div style={S.ddDivider} />
                <button
                  style={S.clearBtn}
                  onClick={() => { setFreeOnly(false); setBuzzingOnly(false); setNewWindow(null) }}
                >
                  Clear tags
                </button>
              </>
            )}
          </Dropdown>
        </div>

        <MapView
          venueGroups={venueGroups}
          selectedVenueKey={selectedVenueKey}
          onSelectVenue={openVenue}
          accentColor={ACCENT}
          markerColor="#9aa5ce"
          markerBorder="#c3cbe8"
          multiColor="#f4a24a"
          multiBorder="#f9c07a"
        />

        {/* Empty state */}
        {!loading && !error && totalEvents === 0 && (
          <div style={S.emptyState}>
            <div style={S.emptyText}>No events found</div>
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
              : <div style={S.loadingText}>Fetching events…</div>
            }
          </div>
        )}

        {panel?.type === 'venue' && (
          <VenuePanel
            venue={panel.venue}
            onSelectEvent={e => openEvent(e, panel.venue)}
            onClose={closePanel}
            accentColor={ACCENT}
            searchQuery={search}
            showTypes={typeFilters.length !== 1}
          />
        )}
        {panel?.type === 'event' && (
          <EventPanel
            event={panel.event}
            onBack={goBack}
            onClose={closePanel}
            accentColor={ACCENT}
          />
        )}
      </div>
    </div>
  )
}
