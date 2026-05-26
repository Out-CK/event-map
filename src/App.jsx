import React, { useEffect, useState, useCallback } from 'react'
import MapView from './components/MapView.jsx'
import EventPanel from './components/EventPanel.jsx'
import { fetchAllEvents } from './lib/supabase.js'
import { geocodeVenues } from './lib/geocoder.js'

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0f0f14',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '52px',
    background: '#16161f',
    borderBottom: '1px solid #2a2a3a',
    flexShrink: 0,
    zIndex: 500,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '16px',
    fontWeight: 700,
    color: '#f0f0f0',
    letterSpacing: '-0.3px',
  },
  stats: {
    fontSize: '13px',
    color: '#666',
  },
  mapArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(15, 15, 20, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    gap: '16px',
  },
  loadingText: {
    color: '#aaa',
    fontSize: '14px',
  },
  progressBar: {
    width: '240px',
    height: '4px',
    background: '#2a2a3a',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#7c6af7',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  errorBox: {
    color: '#ff6b6b',
    background: '#2a1a1a',
    border: '1px solid #4a2a2a',
    borderRadius: '8px',
    padding: '16px 24px',
    fontSize: '14px',
  },
  filterBar: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    zIndex: 900,
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  filterInput: {
    background: '#16161f',
    border: '1px solid #2a2a3a',
    borderRadius: '8px',
    color: '#f0f0f0',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
    width: '220px',
  },
  clearBtn: {
    background: '#2a2a3a',
    border: 'none',
    borderRadius: '6px',
    color: '#aaa',
    fontSize: '12px',
    padding: '8px 12px',
    cursor: 'pointer',
  },
}

export default function App() {
  const [events, setEvents] = useState([])
  const [geocache, setGeocache] = useState({})
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        const data = await fetchAllEvents()
        setEvents(data)

        const uniqueVenues = [...new Set(data.map(e => e.venue).filter(Boolean))]
        setGeocodeProgress({ done: 0, total: uniqueVenues.length })

        const cache = await geocodeVenues(uniqueVenues, (done, total) => {
          setGeocodeProgress({ done, total })
        })

        setGeocache(cache)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const filteredEvents = search.trim()
    ? events.filter(e => {
        const q = search.toLowerCase()
        return (
          e.event_title?.toLowerCase().includes(q) ||
          e.artist?.toLowerCase().includes(q) ||
          e.venue?.toLowerCase().includes(q)
        )
      })
    : events

  const handleSelectEvent = useCallback((event) => {
    setSelectedEvent(prev =>
      prev?.event_entry_id === event.event_entry_id ? null : event
    )
  }, [])

  const geocodedCount = filteredEvents.filter(e => geocache[e.venue]).length
  const pct = geocodeProgress.total > 0
    ? Math.round((geocodeProgress.done / geocodeProgress.total) * 100)
    : 100

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <div style={styles.logo}>
          🎵 NYC Concert Map
        </div>
        <div style={styles.stats}>
          {loading
            ? geocodeProgress.total > 0
              ? `Geocoding venues… ${geocodeProgress.done}/${geocodeProgress.total}`
              : 'Loading events…'
            : `${geocodedCount.toLocaleString()} events mapped`
          }
        </div>
      </div>

      {/* Map area */}
      <div style={styles.mapArea}>
        {/* Filter bar */}
        <div style={styles.filterBar}>
          <input
            style={styles.filterInput}
            placeholder="Search artist, venue, or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button style={styles.clearBtn} onClick={() => setSearch('')}>Clear</button>
          )}
        </div>

        {/* Map */}
        <MapView
          events={filteredEvents}
          geocache={geocache}
          selectedEvent={selectedEvent}
          onSelectEvent={handleSelectEvent}
        />

        {/* Loading overlay */}
        {loading && (
          <div style={styles.loadingOverlay}>
            {error ? (
              <div style={styles.errorBox}>Error: {error}</div>
            ) : (
              <>
                <div style={styles.loadingText}>
                  {geocodeProgress.total > 0
                    ? `Geocoding venues… ${geocodeProgress.done} / ${geocodeProgress.total}`
                    : 'Fetching events…'}
                </div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Event detail panel */}
        {selectedEvent && (
          <EventPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>
    </div>
  )
}
