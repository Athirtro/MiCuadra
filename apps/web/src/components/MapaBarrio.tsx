import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { Circle, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { NegocioResumen, Punto } from '../lib/api'
import { emojiCategoria } from '../lib/negocio'

const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function iconoNegocio(n: NegocioResumen): L.DivIcon {
  const clase = n.destacado ? 'pin pin-destacado' : 'pin'
  return L.divIcon({
    className: '',
    html: `<span class="${clase}" style="--pin:${n.categoria.color}" aria-hidden="true"><span>${emojiCategoria(n.categoria.slug)}</span></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -32],
  })
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

function Marcadores({ negocios, alElegir }: { negocios: NegocioResumen[]; alElegir: (slug: string) => void }) {
  const mapa = useMap()
  useEffect(() => {
    const grupo = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: (c) =>
        L.divIcon({ className: '', html: `<span class="cluster">${c.getChildCount()}</span>`, iconSize: [40, 40] }),
    })
    for (const n of negocios) {
      const m = L.marker([n.ubicacion.lat, n.ubicacion.lng], {
        icon: iconoNegocio(n),
        title: n.nombre,
        alt: n.nombre,
        keyboard: true,
      })
      m.bindTooltip(escapar(n.nombre), { direction: 'top', offset: [0, -30] })
      m.on('click', () => alElegir(n.slug))
      grupo.addLayer(m)
    }
    mapa.addLayer(grupo)
    return () => {
      mapa.removeLayer(grupo)
    }
  }, [mapa, negocios, alElegir])
  return null
}

/** Centra el mapa cuando cambia la ubicación de búsqueda (GPS o barrio elegido). */
function Recentrar({ centro }: { centro: Punto }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.setView([centro.lat, centro.lng], Math.max(mapa.getZoom(), 16))
  }, [mapa, centro])
  return null
}

/** Leaflet mide el contenedor al crearse; si la grilla cambia de tamaño, hay que avisarle. */
function AjustarTamano() {
  const mapa = useMap()
  useEffect(() => {
    const observador = new ResizeObserver(() => mapa.invalidateSize())
    observador.observe(mapa.getContainer())
    return () => observador.disconnect()
  }, [mapa])
  return null
}

function AlMover({ alMover }: { alMover: (centro: Punto) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = (e.target as L.Map).getCenter()
      alMover({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

interface Props {
  centro: Punto
  radioM: number
  negocios: NegocioResumen[]
  alElegir: (slug: string) => void
  alMover?: (centro: Punto) => void
  className?: string
}

export function MapaBarrio({ centro, radioM, negocios, alElegir, alMover, className }: Props) {
  return (
    <MapContainer center={[centro.lat, centro.lng]} zoom={16} className={className} zoomControl={false}>
      <TileLayer attribution={ATRIBUCION} url={TILES} maxZoom={19} />
      <Circle
        center={[centro.lat, centro.lng]}
        radius={radioM}
        pathOptions={{ color: '#1E6B4E', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04 }}
      />
      <AjustarTamano />
      <Recentrar centro={centro} />
      {alMover && <AlMover alMover={alMover} />}
      <Marcadores negocios={negocios} alElegir={alElegir} />
    </MapContainer>
  )
}

/** Mini mapa estático del perfil. */
export function MiniMapa({ punto, color, emoji }: { punto: Punto; color: string; emoji: string }) {
  return (
    <MapContainer
      center={[punto.lat, punto.lng]}
      zoom={17}
      className="h-40 w-full rounded-r"
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      zoomControl={false}
      keyboard={false}
    >
      <TileLayer attribution={ATRIBUCION} url={TILES} />
      <PinFijo punto={punto} color={color} emoji={emoji} />
    </MapContainer>
  )
}

function PinFijo({ punto, color, emoji }: { punto: Punto; color: string; emoji: string }) {
  const mapa = useMap()
  useEffect(() => {
    const m = L.marker([punto.lat, punto.lng], {
      icon: L.divIcon({
        className: '',
        html: `<span class="pin" style="--pin:${color}" aria-hidden="true"><span>${emoji}</span></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      }),
      interactive: false,
    }).addTo(mapa)
    return () => {
      m.remove()
    }
  }, [mapa, punto, color, emoji])
  return null
}

/** Pin arrastrable para que el dueño ubique su negocio (también se mueve tocando el mapa). */
export function SelectorUbicacion({
  punto,
  alCambiar,
  emoji = '📍',
}: {
  punto: Punto
  alCambiar: (p: Punto) => void
  emoji?: string
}) {
  return (
    <MapContainer center={[punto.lat, punto.lng]} zoom={17} className="h-72 w-full rounded-r" zoomControl>
      <TileLayer attribution={ATRIBUCION} url={TILES} maxZoom={19} />
      <AjustarTamano />
      <Recentrar centro={punto} />
      <PinArrastrable punto={punto} alCambiar={alCambiar} emoji={emoji} />
    </MapContainer>
  )
}

function PinArrastrable({ punto, alCambiar, emoji }: { punto: Punto; alCambiar: (p: Punto) => void; emoji: string }) {
  const mapa = useMap()
  useMapEvents({ click: (e) => alCambiar({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  useEffect(() => {
    const m = L.marker([punto.lat, punto.lng], {
      draggable: true,
      autoPan: true,
      title: 'Arrástrame hasta tu negocio',
      icon: L.divIcon({
        className: '',
        html: `<span class="pin pin-destacado" style="--pin:#C8462F" aria-hidden="true"><span>${emoji}</span></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      }),
    })
    m.on('dragend', () => {
      const p = m.getLatLng()
      alCambiar({ lat: p.lat, lng: p.lng })
    })
    m.addTo(mapa)
    return () => {
      m.remove()
    }
  }, [mapa, punto, alCambiar, emoji])
  return null
}
