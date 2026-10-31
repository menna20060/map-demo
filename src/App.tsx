import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Map as LeafletMap, Marker as LeafletMarker, DivIcon, Layer, FeatureGroup } from 'leaflet'
// الإضافات لازم تتستورد بعد leaflet
import 'leaflet.heat'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import './App.css'

type Severity = 'high' | 'medium' | 'low'
type Filter = 'all' | Severity
type BaseKey = 'streets' | 'osm' | 'satellite'

interface Infestation {
  id: number
  name: string
  pest: string
  severity: Severity
  position: [number, number]
  date: string
  area: number
}
type Item = Infestation & { icon: DivIcon }

const COLORS: Record<Severity, string> = {
  high: '#d64545',
  medium: '#e8a33d',
  low: '#3f8f5b',
}

const LABELS: Record<Severity, string> = {
  high: 'خطورة عالية',
  medium: 'خطورة متوسطة',
  low: 'خطورة منخفضة',
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'high', label: 'عالية' },
  { key: 'medium', label: 'متوسطة' },
  { key: 'low', label: 'منخفضة' },
]

const BASEMAPS: Record<BaseKey, { label: string; url: string; attribution: string }> = {
  streets: {
    label: 'شوارع',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  osm: {
    label: 'عربي',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    label: 'أقمار صناعية',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
  },
}

// دبوس SVG مع حركة نزول عند الظهور، ونبض للخطورة العالية
function pinIcon(severity: Severity, delay: number): DivIcon {
  const color = COLORS[severity]
  const pulse = severity === 'high' ? `<span class="pulse" style="background:${color}"></span>` : ''
  return L.divIcon({
    className: 'pin',
    html: `<div class="pin-inner" style="animation-delay:${delay}ms">
      ${pulse}
      <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 1C8.6 1 1 8.6 1 18c0 12.3 17 27 17 27s17-14.7 17-27C35 8.6 27.4 1 18 1z"
              fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="18" cy="18" r="6.5" fill="white"/>
      </svg>
    </div>`,
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -44],
  })
}

// بيانات تجريبية، وفي المشروع الحقيقي هتيجي من الـ API
const RAW: Infestation[] = [
  { id: 1, name: 'مزرعة الفيوم', pest: 'ذبابة بيضاء', severity: 'high', position: [29.31, 30.84], date: '25 أكتوبر 2026', area: 12 },
  { id: 2, name: 'مزرعة البحيرة', pest: 'دودة ورق', severity: 'medium', position: [30.85, 30.34], date: '24 أكتوبر 2026', area: 8 },
  { id: 3, name: 'مزرعة المنيا', pest: 'دودة القطن', severity: 'low', position: [28.11, 30.75], date: '22 أكتوبر 2026', area: 5 },
  { id: 4, name: 'مزرعة الشرقية', pest: 'حشرة المنّ', severity: 'medium', position: [30.59, 31.5], date: '23 أكتوبر 2026', area: 9 },
  { id: 5, name: 'مزرعة أسيوط', pest: 'ذبابة بيضاء', severity: 'high', position: [27.18, 31.18], date: '26 أكتوبر 2026', area: 15 },
  { id: 6, name: 'مزرعة الإسماعيلية', pest: 'دودة ورق', severity: 'low', position: [30.6, 32.27], date: '21 أكتوبر 2026', area: 4 },
]

// الشاشة العريضة: اللوحة على الجنب. الموبايل: اللوحة تحت. بنستخدمها عشان الـ popup ما يختفيش ورا اللوحة
const WIDE = typeof window === 'undefined' || window.innerWidth > 700

const ITEMS: Item[] = RAW.map((item, i) => ({ ...item, icon: pinIcon(item.severity, i * 120) }))

// ---------- نقاط الاكتشاف (من الطيارة) للـ heatmap والتجميع ----------
interface Detection {
  id: number
  farm: string
  pest: string
  severity: Severity
  position: [number, number]
}

// مولّد أرقام عشوائية ثابت عشان البيانات التجريبية ما تتغيرش مع كل تحديث
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeDetections(): Detection[] {
  const rand = mulberry32(42)
  const bell = () => (rand() + rand() + rand() + rand() - 2) / 2 // رقم بين -1 و1 متركز حوالين الصفر
  const all: Severity[] = ['high', 'medium', 'low']
  const out: Detection[] = []
  let id = 1
  RAW.forEach((farm) => {
    const count = farm.area * 8
    for (let i = 0; i < count; i++) {
      out.push({
        id: id++,
        farm: farm.name,
        pest: farm.pest,
        severity: rand() < 0.7 ? farm.severity : all[Math.floor(rand() * 3)],
        position: [farm.position[0] + bell() * 0.12, farm.position[1] + bell() * 0.12],
      })
    }
  })
  return out
}

const DETECTIONS = makeDetections()

const WEIGHT: Record<Severity, number> = { high: 1, medium: 0.6, low: 0.3 }

// دالتي heatLayer وmarkerClusterGroup بتيجي من الإضافات، فبنعرّف شكلهم هنا
type HeatFn = (points: [number, number, number][], options?: object) => Layer
type ClusterFn = (options?: object) => FeatureGroup

const DOTS: Partial<Record<Severity, DivIcon>> = {}
function dotIcon(severity: Severity): DivIcon {
  let icon = DOTS[severity]
  if (!icon) {
    icon = L.divIcon({
      className: 'dot-marker',
      html: `<span style="background:${COLORS[severity]}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
    })
    DOTS[severity] = icon
  }
  return icon
}

// الخريطة الحرارية: كل ما النقط تزيد وتبقى أخطر، اللون بيسخن
function HeatLayer({ points }: { points: Detection[] }) {
  const map = useMap()
  useEffect(() => {
    const heatLayer = (L as unknown as { heatLayer: HeatFn }).heatLayer
    const layer = heatLayer(
      points.map((p): [number, number, number] => [p.position[0], p.position[1], WEIGHT[p.severity]]),
      {
        radius: 30,
        blur: 24,
        maxZoom: 11,
        minOpacity: 0.35,
        gradient: { 0.2: '#8fd19e', 0.45: '#f4e285', 0.7: '#f4a259', 1: '#d64545' },
      },
    ).addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, points])
  return null
}

// تجميع النقط: لما تبقى كتير بتتجمّع في دايرة برقم، وبتتفتح بالتقريب
function ClusterLayer({ points }: { points: Detection[] }) {
  const map = useMap()
  useEffect(() => {
    const makeGroup = (L as unknown as { markerClusterGroup: ClusterFn }).markerClusterGroup
    const group = makeGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      iconCreateFunction: (cluster: { getChildCount(): number }) => {
        const n = cluster.getChildCount()
        const size = n < 10 ? 38 : n < 50 ? 46 : 56
        return L.divIcon({
          html: `<span>${n}</span>`,
          className: 'cluster',
          iconSize: [size, size],
        })
      },
    })
    points.forEach((p) => {
      const c = COLORS[p.severity]
      group.addLayer(
        L.marker(p.position, { icon: dotIcon(p.severity) }).bindPopup(
          `<div class="popup">
            <div class="popup-head"><span class="dot" style="background:${c}"></span><h3>${p.farm}</h3></div>
            <span class="badge" style="background:${c}">${LABELS[p.severity]}</span>
            <dl><div><dt>الإصابة</dt><dd>${p.pest}</dd></div></dl>
          </div>`,
          { className: 'farm-popup' },
        ),
      )
    })
    map.addLayer(group)
    return () => {
      map.removeLayer(group)
    }
  }, [map, points])
  return null
}

function fitTo(map: LeafletMap, list: Item[]) {
  if (list.length === 0) return
  map.flyToBounds(L.latLngBounds(list.map((i) => i.position)), {
    padding: [90, 90],
    maxZoom: 9,
    duration: 1.2,
  })
}

export default function App() {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [base, setBase] = useState<BaseKey>('streets')
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showFarms, setShowFarms] = useState(true)
  const [showHeat, setShowHeat] = useState(true)
  const [showClusters, setShowClusters] = useState(false)
  const markerRefs = useRef<Record<number, LeafletMarker | null>>({})

  const visible = filter === 'all' ? ITEMS : ITEMS.filter((i) => i.severity === filter)
  const detections = useMemo(
    () => (filter === 'all' ? DETECTIONS : DETECTIONS.filter((d) => d.severity === filter)),
    [filter],
  )

  // عند تغيير الفلتر (أو أول ما الخريطة تجهز) تتحرك الخريطة بسلاسة لتعرض النتائج
  useEffect(() => {
    if (!map) return
    map.closePopup()
    fitTo(map, filter === 'all' ? ITEMS : ITEMS.filter((i) => i.severity === filter))
  }, [map, filter])

  // تمرير القائمة تلقائيًا للعنصر المختار
  useEffect(() => {
    if (selectedId == null) return
    document
      .getElementById(`card-${selectedId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedId])

  // الضغط على عنصر في القائمة: الخريطة تطير للدبوس ثم يفتح الـ popup
  const focusItem = (item: Item) => {
    if (!map) return
    const zoom = Math.max(map.getZoom(), 10)
    // لو طبقة المزارع مقفولة نفتحها، والـ popup يتفتح بعد ما تنتهي الحركة
    const open = () => {
      markerRefs.current[item.id]?.openPopup()
    }
    const alreadyThere =
      showFarms && map.getCenter().distanceTo(item.position) < 100 && map.getZoom() >= zoom
    if (alreadyThere) {
      open()
      return
    }
    setShowFarms(true)
    map.once('moveend', open)
    map.flyTo(item.position, zoom, { duration: 1.2 })
  }

  const countOf = (key: Filter) =>
    key === 'all' ? ITEMS.length : ITEMS.filter((i) => i.severity === key).length

  return (
    <div className="map-wrap">
      <MapContainer
        ref={setMap}
        center={[27.0, 30.8]}
        zoom={6}
        minZoom={5}
        zoomControl={false}
        zoomSnap={0.5}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={90}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={base}
          attribution={BASEMAPS[base].attribution}
          url={BASEMAPS[base].url}
          maxZoom={18}
        />
        <ZoomControl position="bottomright" />

        {showHeat && <HeatLayer points={detections} />}
        {showClusters && <ClusterLayer points={detections} />}

        {showFarms && visible.map((item) => (
          <Marker
            key={item.id}
            position={item.position}
            icon={item.icon}
            zIndexOffset={1000}
            ref={(m) => {
              markerRefs.current[item.id] = m
            }}
            eventHandlers={{
              popupopen: () => setSelectedId(item.id),
              popupclose: () => setSelectedId((cur) => (cur === item.id ? null : cur)),
            }}
          >
            <Popup
              className="farm-popup"
              autoPanPaddingTopLeft={[40, 40]}
              autoPanPaddingBottomRight={WIDE ? [360, 40] : [40, 300]}
            >
              <div className="popup">
                <div className="popup-head">
                  <span className="dot" style={{ background: COLORS[item.severity] }} />
                  <h3>{item.name}</h3>
                </div>
                <span className="badge" style={{ background: COLORS[item.severity] }}>
                  {LABELS[item.severity]}
                </span>
                <dl>
                  <div>
                    <dt>الإصابة</dt>
                    <dd>{item.pest}</dd>
                  </div>
                  <div>
                    <dt>تاريخ الاكتشاف</dt>
                    <dd>{item.date}</dd>
                  </div>
                  <div>
                    <dt>المساحة المتأثرة</dt>
                    <dd>{item.area} فدان</dd>
                  </div>
                </dl>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* تبديل نوع الخريطة */}
      <div className="basemap" role="group" aria-label="نوع الخريطة">
        {(Object.keys(BASEMAPS) as BaseKey[]).map((k) => (
          <button key={k} className={base === k ? 'on' : ''} onClick={() => setBase(k)}>
            {BASEMAPS[k].label}
          </button>
        ))}
      </div>

      {/* زرار فتح اللوحة لما تكون مقفولة */}
      <button
        className={`toggle ${panelOpen ? 'hidden' : ''}`}
        onClick={() => setPanelOpen(true)}
        aria-label="فتح قائمة الإصابات"
      >
        ☰
      </button>

      {/* اللوحة الجانبية */}
      <aside className={`panel ${panelOpen ? '' : 'closed'}`}>
        <header className="panel-head">
          <div>
            <h1>Farmotics</h1>
            <p>خريطة الإصابات</p>
          </div>
          <button className="icon-btn" onClick={() => setPanelOpen(false)} aria-label="إغلاق">
            ✕
          </button>
        </header>

        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'on' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.key !== 'all' && <span className="dot" style={{ background: COLORS[f.key] }} />}
              {f.label}
              <b>{countOf(f.key)}</b>
            </button>
          ))}
        </div>

        <div className="layers" role="group" aria-label="الطبقات">
          {[
            { label: 'المزارع', on: showFarms, set: setShowFarms },
            { label: 'الخريطة الحرارية', on: showHeat, set: setShowHeat },
            { label: 'تجميع النقاط', on: showClusters, set: setShowClusters },
          ].map((l) => (
            <label key={l.label} className={`layer-pill ${l.on ? 'on' : ''}`}>
              <input type="checkbox" checked={l.on} onChange={(e) => l.set(e.target.checked)} />
              {l.label}
            </label>
          ))}
          <p className="hint">{detections.length} نقطة اكتشاف من الطيارة</p>
        </div>

        <ul className="list">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                id={`card-${item.id}`}
                className={`card ${selectedId === item.id ? 'active' : ''}`}
                onClick={() => focusItem(item)}
              >
                <span className="dot" style={{ background: COLORS[item.severity] }} />
                <span className="card-text">
                  <strong>{item.name}</strong>
                  <small>{item.pest}</small>
                </span>
                <span className="card-area">{item.area} فدان</span>
              </button>
            </li>
          ))}
        </ul>

        <button className="reset" onClick={() => map && fitTo(map, visible)}>
          عرض الكل على الخريطة
        </button>
      </aside>
    </div>
  )
}
