import React, { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const NYC_CENTER = [40.7549, -73.9840]

// Slightly shift markers at the same location so they don't stack exactly
function jitter(lat, lng, existingPositions) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  const count = existingPositions.get(key) || 0
  existingPositions.set(key, count + 1)
  if (count === 0) return [lat, lng]
  const angle = (count * 137.5 * Math.PI) / 180  // golden angle spread
  const radius = 0.0003 * Math.ceil(count / 6)
  return [lat + radius * Math.sin(angle), lng + radius * Math.cos(angle)]
}

function PanToSelected({ selectedEvent, geocache }) {
  const map = useMap()
  React.useEffect(() => {
    if (!selectedEvent) return
    const coords = geocache[selectedEvent.venue]
    if (coords) map.panTo([coords.lat, coords.lng], { animate: true, duration: 0.5 })
  }, [selectedEvent, geocache, map])
  return null
}

export default function MapView({ events, geocache, selectedEvent, onSelectEvent }) {
  const markers = useMemo(() => {
    const positions = new Map()
    return events
      .filter(e => geocache[e.venue])
      .map(e => {
        const { lat, lng } = geocache[e.venue]
        const [jLat, jLng] = jitter(lat, lng, positions)
        return { event: e, lat: jLat, lng: jLng }
      })
  }, [events, geocache])

  return (
    <MapContainer
      center={NYC_CENTER}
      zoom={13}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />

      <PanToSelected selectedEvent={selectedEvent} geocache={geocache} />

      {markers.map(({ event, lat, lng }) => {
        const isSelected = selectedEvent?.event_entry_id === event.event_entry_id
        return (
          <CircleMarker
            key={event.event_entry_id}
            center={[lat, lng]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              fillColor: isSelected ? '#ffffff' : '#7c6af7',
              fillOpacity: isSelected ? 1 : 0.85,
              color: isSelected ? '#ffffff' : '#a89cf7',
              weight: isSelected ? 2 : 1,
            }}
            eventHandlers={{ click: () => onSelectEvent(event) }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
              <div style={{ fontSize: '12px', maxWidth: '220px' }}>
                <div style={{ fontWeight: 700, marginBottom: '2px' }}>{event.event_title}</div>
                <div style={{ color: '#aaa' }}>{event.date}{event.start_time ? ` · ${event.start_time}` : ''}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
