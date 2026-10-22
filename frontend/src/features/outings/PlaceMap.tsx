import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Place } from './model'

export function PlaceMap({ places, selected, onSelect, itinerary = false }: { places: Place[]; selected?: string; onSelect: (place: Place) => void; itinerary?: boolean }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), markers = useRef<L.LayerGroup | null>(null)
  const callback = useRef(onSelect); callback.current = onSelect
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([37.550, 127.022], 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).on('tileerror', () => setError(true)).addTo(instance)
    map.current = instance; markers.current = L.layerGroup().addTo(instance)
    const resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(container.current)
    return () => { resize.disconnect(); instance.remove(); map.current = null }
  }, [])
  useEffect(() => {
    const instance = map.current, layer = markers.current
    if (!instance || !layer) return
    layer.clearLayers()
    const points: L.LatLngTuple[] = []
    places.forEach((place, index) => {
      if (!place.coordinates) return
      points.push(place.coordinates)
      const marker = L.marker(place.coordinates, { title: place.name, icon: L.divIcon({ className: `outing-pin${selected === place.id ? ' selected' : ''}`, html: `<span><b>${index + 1}</b></span>`, iconSize: [36, 40], iconAnchor: [18, 40] }) })
      const label = document.createElement('span'); label.textContent = `${index + 1}. ${place.name}`
      marker.bindTooltip(label).on('click', () => callback.current(place)).addTo(layer)
    })
    if (itinerary && points.length > 1 && points.length === places.length) L.polyline(points, { color: '#cf442e', dashArray: '6 8', weight: 3 }).addTo(layer)
    if (points.length) instance.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 })
  }, [places, selected, itinerary])
  const missing = places.filter(p => !p.coordinates).length
  return <div className="o-map-wrap"><div className="o-map" ref={container} aria-label="장소 지도"/>
    <p className="o-map-caption">{itinerary ? '점선은 방문 순서이며 실제 이동 경로가 아니에요. ' : ''}{places.some(p => p.source === 'sample') && '예시 장소의 위치를 표시하고 있어요. '}{missing > 0 && `좌표 미확인 ${missing}곳은 지도에서 제외했어요.`}</p>
    {error && <p className="o-warning">지도 배경을 불러오지 못했어요. 장소 목록과 외부 지도 링크를 이용해 주세요.</p>}
  </div>
}
