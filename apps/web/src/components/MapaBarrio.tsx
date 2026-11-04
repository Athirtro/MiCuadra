import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { NegocioResumen, Punto } from '../lib/api'
import { emojiCategoria } from '../lib/negocio'
import type { Yo } from '../lib/useUbicacion'

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

// Punto azul con una flecha que gira hacia donde miras (brújula) o caminas (GPS).
const ICONO_YO = L.divIcon({
  className: '',
  html:
    '<span class="yo" aria-hidden="true">' +
    '<svg class="yo-flecha" viewBox="0 0 40 40" width="40" height="40">' +
    '<path d="M20 3 L31 33 L20 26 L9 33 Z" fill="#2f7cf6" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>' +
    '</svg></span>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

/** "Estás aquí": punto azul (o flecha, si se sabe el rumbo) con el círculo de precisión del GPS. */
function EstoyAqui({ yo }: { yo: Yo }) {
  const centro: [number, number] = [yo.punto.lat, yo.punto.lng]
  const marcador = useRef<L.Marker>(null)
  // Girar el ícono existente en vez de recrearlo: la brújula cambia muchas veces por segundo.
  useEffect(() => {
    const el = marcador.current?.getElement()?.querySelector<HTMLElement>('.yo')
    if (!el) return
    el.dataset.rumbo = yo.rumbo === null ? 'no' : 'si'
    if (yo.rumbo !== null) el.style.setProperty('--rumbo', `${Math.round(yo.rumbo)}deg`)
  }, [yo.rumbo])
  return (
    <>
      {yo.precision < 500 && (
        <Circle
          center={centro}
          radius={yo.precision}
          interactive={false}
          pathOptions={{ color: '#2f7cf6', weight: 1, opacity: 0.4, fillOpacity: 0.12 }}
        />
      )}
      <Marker ref={marcador} position={centro} icon={ICONO_YO} interactive={false} keyboard={false} zIndexOffset={1000} />
    </>
  )
}

/** Botón flotante para volver a tu posición. */
function BotonCentrarme({ yo, alPedir }: { yo: Yo | null; alPedir: () => void }) {
  const mapa = useMap()
  return (
    <button
      type="button"
      aria-label="Centrar el mapa en mi ubicación"
      title="Mi ubicación"
      onClick={(e) => {
        e.stopPropagation()
        if (yo) mapa.flyTo([yo.punto.lat, yo.punto.lng], Math.max(mapa.getZoom(), 17), { duration: 0.6 })
        alPedir()
      }}
      className="tap absolute right-3 bottom-8 z-[1000] grid place-items-center rounded-full bg-surface text-ink shadow-2"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" fill={yo ? '#2f7cf6' : 'none'} stroke={yo ? '#2f7cf6' : 'currentColor'} />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/** Camino a pie: línea azul con borde blanco; el mapa se encuadra para verlo completo. */
function Camino({ trazado, margenArriba = 150 }: { trazado: [number, number][]; margenArriba?: number }) {
  const mapa = useMap()
  useEffect(() => {
    if (trazado.length > 1)
      mapa.flyToBounds(L.latLngBounds(trazado), {
        // Arriba queda la tarjeta del camino: más margen para que no tape el final.
        paddingTopLeft: [32, margenArriba],
        paddingBottomRight: [32, 40],
        maxZoom: 18,
        duration: 0.6,
      })
  }, [mapa, trazado, margenArriba])
  return (
    <>
      <Polyline positions={trazado} interactive={false} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline positions={trazado} interactive={false} pathOptions={{ color: '#2f7cf6', weight: 5, lineCap: 'round', lineJoin: 'round' }} />
    </>
  )
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
  /** Posición en vivo de la persona; null si no dio permiso. */
  yo?: Yo | null
  /** Camino a pie hasta el negocio elegido. */
  camino?: [number, number][] | null
  alPedirUbicacion?: () => void
  className?: string
}

export function MapaBarrio({ centro, radioM, negocios, alElegir, alMover, yo = null, camino = null, alPedirUbicacion, className }: Props) {
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
      {camino && <Camino trazado={camino} />}
      <Marcadores negocios={negocios} alElegir={alElegir} />
      {yo && <EstoyAqui yo={yo} />}
      {alPedirUbicacion && <BotonCentrarme yo={yo} alPedir={alPedirUbicacion} />}
    </MapContainer>
  )
}

/** Mini mapa estático del perfil. */
interface PropsMini {
  punto: Punto
  color: string
  emoji: string
  /** Con camino, el mapa crece y se puede mover para seguirlo. */
  camino?: [number, number][] | null
  yo?: Yo | null
}

export function MiniMapa({ punto, color, emoji, camino = null, yo = null }: PropsMini) {
  const conCamino = Boolean(camino)
  return (
    <MapContainer
      // Leaflet no cambia estas opciones después de crear el mapa: con camino se crea otro.
      key={conCamino ? 'camino' : 'fijo'}
      center={[punto.lat, punto.lng]}
      zoom={17}
      className={conCamino ? 'h-80 w-full' : 'h-44 w-full'}
      dragging={conCamino}
      scrollWheelZoom={false}
      doubleClickZoom={conCamino}
      touchZoom={conCamino}
      zoomControl={false}
      keyboard={false}
    >
      <TileLayer attribution={ATRIBUCION} url={TILES} />
      <AjustarTamano />
      {camino && <Camino trazado={camino} margenArriba={32} />}
      <PinFijo punto={punto} color={color} emoji={emoji} />
      {yo && <EstoyAqui yo={yo} />}
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
    <MapContainer center={[punto.lat, punto.lng]} zoom={17} className="h-72 w-full rounded-caja" zoomControl>
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
