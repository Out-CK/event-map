import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

const NYC_CENTER = [40.7549, -73.9840]

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function PanToSelected({ selectedVenueKey, venueGroups }) {
  const map = useMap()
  React.useEffect(() => {
    if (!selectedVenueKey) return
    const group = venueGroups.find(g => g.key === selectedVenueKey)
    if (group?.coords) map.panTo([group.coords.lat, group.coords.lng], { animate: true, duration: 0.5 })
  }, [selectedVenueKey, venueGroups, map])
  return null
}

function VenueCluster({ venueGroups, onSelectVenue, markerColor, markerBorder, multiColor, multiBorder }) {
  const map = useMap()
  const clusterRef = useRef(null)
  const cbRef = useRef(onSelectVenue)
  cbRef.current = onSelectVenue

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      animate: true,
      iconCreateFunction: (c) => {
        const count = c.getChildCount()
        const size = Math.min(32 + Math.log2(count) * 6, 52)
        return L.divIcon({
          html: `<div class="cluster-icon" style="width:${size}px;height:${size}px;background:${multiColor};border:2px solid ${multiBorder};">${count}</div>`,
          className: 'cluster-wrapper',
          iconSize: [size, size],
        })
      },
    })

    for (const group of venueGroups) {
      const multi = group.events.length > 1
      const r = multi ? Math.min(7 + group.events.length, 13) : 7
      const size = r * 2
      const fill = multi ? multiColor : (group.markerColor || markerColor)
      const border = multi ? multiBorder : (group.markerBorder || markerBorder)

      const marker = L.marker([group.coords.lat, group.coords.lng], {
        icon: L.divIcon({
          html: `<div class="venue-dot" style="width:${size}px;height:${size}px;background:${fill};border:1.5px solid ${border};"></div>`,
          className: 'venue-dot-wrapper',
          iconSize: [size, size],
          iconAnchor: [r, r],
        }),
      })

      const name = esc(group.displayName)
      const tooltipHtml = multi
        ? `<div style="font-size:12px;max-width:230px"><div style="font-weight:700;margin-bottom:2px">${name}</div><div style="color:${multiColor}">${group.events.length} events</div></div>`
        : `<div style="font-size:12px;max-width:230px"><div style="font-weight:700;margin-bottom:2px">${name}</div><div style="color:#ccc">${esc(group.events[0]?.artist || '')} · ${esc(group.events[0]?.date || '')}</div></div>`

      marker.bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -r - 4], opacity: 0.96 })
      marker.on('click', () => cbRef.current(group))

      cluster.addLayer(marker)
    }

    map.addLayer(cluster)
    clusterRef.current = cluster

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current)
        clusterRef.current = null
      }
    }
  }, [venueGroups, markerColor, markerBorder, multiColor, multiBorder, map])

  return null
}

export default function MapView({
  venueGroups, selectedVenueKey, onSelectVenue,
  markerColor = '#7c6af7', markerBorder = '#a89cf7',
  multiColor = '#f4a24a', multiBorder = '#f9c07a',
}) {
  const selectedGroup = selectedVenueKey ? venueGroups.find(g => g.key === selectedVenueKey) : null

  return (
    <MapContainer center={NYC_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={true}>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
      <PanToSelected selectedVenueKey={selectedVenueKey} venueGroups={venueGroups} />
      <VenueCluster
        venueGroups={venueGroups}
        onSelectVenue={onSelectVenue}
        markerColor={markerColor}
        markerBorder={markerBorder}
        multiColor={multiColor}
        multiBorder={multiBorder}
      />
      {selectedGroup?.coords && (
        <CircleMarker
          center={[selectedGroup.coords.lat, selectedGroup.coords.lng]}
          radius={11}
          pathOptions={{ fillColor: '#ffffff', fillOpacity: 1, color: '#ffffff', weight: 2.5 }}
        />
      )}
    </MapContainer>
  )
}
