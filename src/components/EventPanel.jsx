import React from 'react'

const styles = {
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '400px',
    height: '100%',
    background: '#16161f',
    borderLeft: '1px solid #2a2a3a',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    overflowY: 'auto',
  },
  header: {
    padding: '24px 24px 0',
    position: 'sticky',
    top: 0,
    background: '#16161f',
    zIndex: 1,
    paddingBottom: '16px',
    borderBottom: '1px solid #2a2a3a',
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '20px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px 8px',
    borderRadius: '4px',
  },
  eventType: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#7c6af7',
    marginBottom: '8px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#f0f0f0',
    lineHeight: 1.3,
    marginBottom: '4px',
    paddingRight: '28px',
  },
  artist: {
    fontSize: '14px',
    color: '#aaa',
    marginBottom: '0',
  },
  body: {
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  infoRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#555',
  },
  value: {
    fontSize: '14px',
    color: '#ddd',
  },
  description: {
    fontSize: '14px',
    color: '#bbb',
    lineHeight: 1.6,
  },
  divider: {
    height: '1px',
    background: '#2a2a3a',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#666',
    marginBottom: '10px',
  },
  sourceLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: '#1e1e2e',
    borderRadius: '8px',
    textDecoration: 'none',
    color: '#c8c0ff',
    fontSize: '13px',
    marginBottom: '8px',
    border: '1px solid #2a2a4a',
    wordBreak: 'break-all',
    transition: 'background 0.15s',
  },
  noTicketLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: '#1e2a1e',
    borderRadius: '8px',
    textDecoration: 'none',
    color: '#90c090',
    fontSize: '13px',
    marginBottom: '8px',
    border: '1px solid #2a4a2a',
    wordBreak: 'break-all',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    background: '#2a2a4a',
    color: '#9090ff',
    marginLeft: '8px',
  },
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const [m, d, y] = dateStr.split('-')
  const date = new Date(+y, +m - 1, +d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(t) {
  if (!t) return null
  return t.replace(/^0/, '').toUpperCase()
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

export default function EventPanel({ event, onClose }) {
  if (!event) return null

  const ticketSources = [1, 2, 3, 4]
    .map(i => event[`tickets_source_${i}`])
    .filter(Boolean)

  const infoSources = [1, 2, 3, 4]
    .map(i => event[`no_tickets_source_${i}`])
    .filter(Boolean)

  const startTime = formatTime(event.start_time)
  const endTime = formatTime(event.end_time)
  const timeStr = startTime
    ? endTime ? `${startTime} – ${endTime}` : startTime
    : null

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
        <div style={styles.eventType}>
          {event.event_type || 'Concert'}
          {event.multi_day_event && <span style={styles.badge}>Multi-day</span>}
        </div>
        <div style={styles.title}>{event.event_title}</div>
        <div style={styles.artist}>{event.artist}</div>
      </div>

      <div style={styles.body}>
        {/* Date & Time */}
        <div style={styles.infoRow}>
          <div style={styles.label}>Date</div>
          <div style={styles.value}>{formatDate(event.date)}</div>
        </div>

        {timeStr && (
          <div style={styles.infoRow}>
            <div style={styles.label}>Time</div>
            <div style={styles.value}>{timeStr}</div>
          </div>
        )}

        {/* Venue */}
        <div style={styles.infoRow}>
          <div style={styles.label}>Venue</div>
          <div style={styles.value}>{event.venue}</div>
        </div>

        {/* Description */}
        {event.description && (
          <>
            <div style={styles.divider} />
            <div>
              <div style={styles.sectionTitle}>About</div>
              <div style={styles.description}>{event.description}</div>
            </div>
          </>
        )}

        {/* Ticket sources */}
        {ticketSources.length > 0 && (
          <>
            <div style={styles.divider} />
            <div>
              <div style={styles.sectionTitle}>🎟 Buy Tickets</div>
              {ticketSources.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={styles.sourceLink}>
                  <span>↗</span>
                  <span>{getDomain(url)}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {/* Info sources */}
        {infoSources.length > 0 && (
          <>
            <div style={styles.divider} />
            <div>
              <div style={styles.sectionTitle}>ℹ More Info</div>
              {infoSources.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={styles.noTicketLink}>
                  <span>↗</span>
                  <span>{getDomain(url)}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {/* Entry metadata */}
        <div style={styles.divider} />
        <div style={styles.infoRow}>
          <div style={styles.label}>Entry ID</div>
          <div style={{ ...styles.value, fontFamily: 'monospace', fontSize: '12px', color: '#555' }}>
            {event.event_entry_id}
          </div>
        </div>
      </div>
    </div>
  )
}
