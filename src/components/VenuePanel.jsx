import React from 'react'
import { formatDisplayDate, formatTime, compareDates } from '../lib/utils.js'

const S = {
  panel: {
    position: 'absolute', top: 0, right: 0, width: '400px', height: '100%',
    background: '#16161f', borderLeft: '1px solid #2a2a3a', zIndex: 1000,
    display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
  },
  header: {
    padding: '20px 24px 16px', borderBottom: '1px solid #2a2a3a',
    position: 'relative', flexShrink: 0,
  },
  closeBtn: {
    position: 'absolute', top: '14px', right: '16px',
    background: 'none', border: 'none', color: '#666', fontSize: '18px',
    cursor: 'pointer', padding: '4px 8px', borderRadius: '4px',
  },
  venueLabel: { fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' },
  venueName: { fontSize: '18px', fontWeight: 700, color: '#f0f0f0', lineHeight: 1.3, paddingRight: '32px' },
  address: { fontSize: '12px', color: '#555', marginTop: '4px' },
  addressLink: { fontSize: '12px', color: '#555', textDecoration: 'none' },
  eventCount: { fontSize: '13px', color: '#666', marginTop: '6px' },
  scrollArea: { flex: 1, overflowY: 'auto' },
  dateGroup: { padding: '0 0 8px' },
  dateHeader: {
    padding: '14px 24px 8px',
    fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
    textTransform: 'uppercase', color: '#555',
    position: 'sticky', top: 0, background: '#16161f', zIndex: 1,
    borderBottom: '1px solid #1e1e2e',
  },
  eventRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 24px', cursor: 'pointer', borderBottom: '1px solid #1e1e2e',
    transition: 'background 0.1s',
  },
  eventRowLeft: { flex: 1, minWidth: 0 },
  artist: { fontSize: '14px', fontWeight: 600, color: '#f0f0f0', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  title: { fontSize: '12px', color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  time: { fontSize: '12px', marginLeft: '12px', flexShrink: 0 },
  arrow: { fontSize: '14px', color: '#444', marginLeft: '8px', flexShrink: 0 },
  ticketBadge: {
    fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
    background: '#2a2a4a', color: '#9090ff', marginLeft: '8px', flexShrink: 0,
  },
}

// Group events by date
function groupByDate(events) {
  const groups = new Map()
  for (const e of events) {
    if (!groups.has(e.date)) groups.set(e.date, [])
    groups.get(e.date).push(e)
  }
  return Array.from(groups.entries()).sort((a, b) => compareDates(a[0], b[0]))
}

export default function VenuePanel({ venue, onSelectEvent, onClose, accentColor = '#7c6af7' }) {
  const [hoveredId, setHoveredId] = React.useState(null)
  const dateGroups = groupByDate(venue.events)
  const hasTickets = e => e.tickets_source_1

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <button style={S.closeBtn} onClick={onClose}>✕</button>
        <div style={{ ...S.venueLabel, color: accentColor }}>Venue</div>
        <div style={S.venueName}>{venue.displayName}</div>
        {venue.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(venue.address)}`}
            target="_blank" rel="noopener noreferrer"
            style={S.addressLink}
          >
            📍 {venue.address}
          </a>
        )}
        {!venue.address && <div style={S.address}>New York City</div>}
        <div style={S.eventCount}>
          {venue.events.length === 1 ? '1 event' : `${venue.events.length} events`}
        </div>
      </div>

      <div style={S.scrollArea}>
        {dateGroups.map(([date, eventsOnDate]) => (
          <div key={date} style={S.dateGroup}>
            <div style={S.dateHeader}>{formatDisplayDate(date)}</div>
            {eventsOnDate.map(event => (
              <div
                key={event.event_entry_id}
                style={{
                  ...S.eventRow,
                  background: hoveredId === event.event_entry_id ? '#1e1e2e' : 'transparent',
                }}
                onMouseEnter={() => setHoveredId(event.event_entry_id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelectEvent(event)}
              >
                {event.media_url && (
                  <img
                    src={event.media_url}
                    alt=""
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      objectFit: 'cover',
                      marginRight: '12px',
                      flexShrink: 0,
                      background: '#1e1e2e',
                    }}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                )}
                <div style={S.eventRowLeft}>
                  <div style={S.artist}>{event.artist}</div>
                  <div style={S.title}>{event.event_title}</div>
                </div>
                {formatTime(event.start_time) && (
                  <div style={{ ...S.time, color: accentColor }}>{formatTime(event.start_time)}</div>
                )}
                {hasTickets(event) && (
                  <div style={S.ticketBadge}>TIX</div>
                )}
                <div style={S.arrow}>›</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
