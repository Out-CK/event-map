import React, { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const NYC_CENTER = [40.7549, -73.9840]

function PanToSelected({ selectedVenueKey, venueGroups }) {
  const map = useMap()
  React.useEffect(() => {
    if (!selectedVenueKey) return
    const group = venueGroups.find(g => g.key === selectedVenueKey)
    if (group?.coords) map.panTo([group.coords.lat, group.coords.lng], { animate: true, duration: 0.5 })
  }, [selectedVenueKey, venueGroups, map])
  return null
}

export default function MapView({
  venueGroups, selectedVenueKey, onSelectVenue,
  markerColor = '#7c6af7', markerBorder = '#a89cf7',
  multiColor = '#f4a24a', multiBorder = '#f9c07a',
}) {
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

      <PanToSelected selectedVenueKey={selectedVenueKey} venueGroups={venueGroups} />

      {venueGroups.map(group => {
        const isSelected = group.key === selectedVenueKey
        const multi = group.events.length > 1
        const radius = isSelected ? 11 : multi ? Math.min(7 + group.events.length, 13) : 7

        return (
          <CircleMarker
            key={group.key}
            center={[group.coords.lat, group.coords.lng]}
            radius={radius}
            pathOptions={{
              fillColor: isSelected ? '#ffffff' : multi ? multiColor : markerColor,
              fillOpacity: isSelected ? 1 : 0.88,
              color: isSelected ? '#ffffff' : multi ? multiBorder : markerBorder,
              weight: isSelected ? 2.5 : 1.5,
            }}
            eventHandlers={{ click: () => onSelectVenue(group) }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.96}>
              <div style={{ fontSize: '12px', maxWidth: '230px' }}>
                <div style={{ fontWeight: 700, marginBottom: '2px' }}>{group.displayName}</div>
                {multi
                  ? <div style={{ color: multiColor }}>{group.events.length} events</div>
                  : <div style={{ color: '#ccc' }}>{group.events[0].artist} · {group.events[0].date}</div>
                }
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
