// src/components/ChoroplethMap.jsx
// -------------------------------------------------------------
// Carte choroplèthe + Légende + Hover détaillé
// Ajouts & réglages :
//  - Sécu: `isActive` peut être booléen OU fonction (évite crash)
//  - Hover: taille d'échantillon (dernière année + total pays filtré)
//  - Tuile info: total échantillon global (toutes lignes filtrées)
//  - Rappel OMS pliable: définition "inactif"
//  - Affiche aussi la covariable `perurb` (part de population urbaine)
// Props :
//  - dataMap: Map(iso3 -> { value, latest:{year, male, female, overall} })
//  - isActive: (iso3)=>bool   OU booléen (sera ignoré si non-fonction)
//  - covExtra: Map(iso3 -> covariates row) (facultatif)
//  - legend: 'bottom' | 'none' (facultatif, défaut 'bottom')
//  - rowsByIso: Map(iso3 -> rows filtrées) (facultatif, pour échantillons)
//  - totalSample: number (facultatif, pour tuile info)
// -------------------------------------------------------------

import React, { useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import * as d3 from 'd3'
import { formatPct, normISO3 } from '../lib/utils'

// GeoJSON (feature.id = ISO3)
const WORLD_GEOJSON = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'

export default function ChoroplethMap({
  dataMap,
  isActive,
  covExtra,
  legend = 'bottom',
  rowsByIso = null,
  totalSample = null
}) {
  const [hover, setHover] = useState(null) // { iso3, name, x, y }
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState([0, 15])
  const [showOMS, setShowOMS] = useState(false) // toggle rappel OMS
  const wrapRef = useRef(null)

  // Palette (10% -> 60%+)
  const color = useMemo(() => d3.scaleSequential(d3.interpolateYlOrRd).domain([0.1, 0.6]), [])

  const getFill = (iso3) => {
    const v = dataMap?.get(iso3)?.value
    return v != null ? color(v) : '#334155'
  }

  function updateHover(evt, iso3, name) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ iso3, name, x: evt.clientX - rect.left, y: evt.clientY - rect.top })
  }

  // Helpers locaux pour échantillons (si rowsByIso fourni)
  const yearOf = (d) => {
    const toNum = v => (Number.isFinite(+v) ? +v : null)
    return toNum(d.midyear) ?? toNum(d.endyear) ?? toNum(d.beginyear)
  }

  return (
    <div className="relative" ref={wrapRef}>
      {/* Contrôles de zoom */}
      <div className="absolute right-3 top-3 z-30 flex gap-2">
        <button onClick={() => setZoom(z => Math.max(z / 1.4, 1))} className="rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-sm">–</button>
        <button onClick={() => { setZoom(1); setCenter([0, 15]) }} className="rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-sm">Reset</button>
        <button onClick={() => setZoom(z => Math.min(z * 1.4, 8))} className="rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-sm">+</button>
      </div>

      <ComposableMap projectionConfig={{ scale: 175 }} width={1200} height={620} className="mx-auto" style={{ width: '100%', height: 'auto' }}>
        <ZoomableGroup zoom={zoom} center={center} onMoveEnd={({ zoom, coordinates }) => { setZoom(zoom); setCenter(coordinates) }}>
          <Geographies geography={WORLD_GEOJSON}>
            {({ geographies }) => geographies.map(geo => {
              const iso3 = normISO3(geo.id)
              const name = geo.properties?.name || iso3
              // ✅ Sécu: isActive peut être une fonction OU non
              const active = (typeof isActive === 'function') ? isActive(iso3) : true
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(e) => updateHover(e, iso3, name)}
                  onMouseLeave={() => setHover(null)}
                  onMouseMove={(e) => updateHover(e, iso3, name)}
                  style={{
                    default: { fill: getFill(iso3), outline: 'none', stroke: 'rgba(255,255,255,0.06)', strokeWidth: 0.5, opacity: active ? 1 : 0.35 },
                    hover:   { fill: getFill(iso3), outline: 'none', stroke: 'white', strokeWidth: 0.8, opacity: 1 },
                    pressed: { fill: getFill(iso3), outline: 'none' }
                  }}
                />
              )
            })}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip (passe au-dessus de tout) */}
      <div className="absolute inset-0 pointer-events-none z-20">
        <HoverCard hover={hover} dataMap={dataMap} covExtra={covExtra} rowsByIso={rowsByIso} />
      </div>

      {/* Bas de composant : légende + tuiles d’info */}
      {legend === 'bottom' && (
        <div className="relative z-10 mt-3 space-y-3">
          <Legend />

          {/* Tuile: Total échantillons (si fourni) */}
          {Number.isFinite(+totalSample) && (
            <div className="card p-3">
              <div className="text-xs uppercase text-slate-400">Taille d’échantillon totale</div>
              <div className="text-lg font-semibold">{Intl.NumberFormat('fr-FR').format(Math.round(totalSample))}</div>
              <div className="text-slate-400 text-xs">Somme des tailles d’échantillon sur tous les enregistrements visibles (selon filtres)</div>
            </div>
          )}

          {/* Rappel OMS (pliable) */}
          <div className="card p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Définition “inactif” (OMS)</div>
              <button className="text-xs underline text-slate-300" onClick={() => setShowOMS(v => !v)}>
                {showOMS ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showOMS && (
              <p className="mt-2 text-sm text-slate-300">
                L’OMS considère comme <em>inactifs physiquement</em> les adultes qui ne respectent pas les recommandations
                d’au moins <strong>150 minutes d’activité physique d’intensité modérée par semaine</strong>. Les estimations
                récentes indiquent qu’environ <strong>31&nbsp;%</strong> des adultes dans le monde étaient inactifs en 2022,
                en hausse d’environ 5 points depuis 2010. Si la tendance se poursuit, la part pourrait atteindre
                <strong> ~35&nbsp;% d’ici 2030</strong>.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Legend() {
  const n = 100
  const stops = Array.from({ length: n }, (_, i) => i / (n - 1)).map(t => ({
    offset: `${t * 100}%`,
    color: d3.interpolateYlOrRd(t),
  }))

  return (
    <div className="card p-3 w-full">
      <div className="text-sm font-semibold mb-2">Part insuffisamment active</div>
      <div className="w-full">
        {/* Responsive 100% width */}
        <svg viewBox="0 0 280 14" preserveAspectRatio="none" className="w-full h-[14px]" aria-hidden>
          <defs>
            <linearGradient id="gradh" x1="0" x2="1" y1="0" y2="0">
              {stops.map((s, i) => (<stop key={i} offset={s.offset} stopColor={s.color} />))}
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="280" height="14" fill="url(#gradh)" rx="6" />
        </svg>
      </div>
      <div className="flex justify-between text-xs text-slate-300">
        <span>10%</span><span>60%+</span>
      </div>
    </div>
  )
}

function HoverCard({ hover, dataMap, covExtra, rowsByIso }) {
  if (!hover) return null
  const { iso3, name, x, y } = hover
  const item = dataMap?.get(iso3)
  const style = { left: (x + 16) + 'px', top: (y + 16) + 'px', maxWidth: '360px' }

  // Récupération des lignes filtrées pour ce pays (si fournies)
  const rows = rowsByIso?.get(iso3) ?? null
  const toNum = v => (Number.isFinite(+v) ? +v : null)
  const yearOf = d => toNum(d.midyear) ?? toNum(d.endyear) ?? toNum(d.beginyear)

  // Échantillons par pays (selon filtres)
  const totalCountrySample = rows ? rows.map(r => toNum(r.samplesize) ?? 0).reduce((a,b)=>a+b, 0) : null

  // Dernière année connue
  const latestYear = item?.latest?.year ?? (() => {
    if (!rows?.length) return null
    const ys = Array.from(new Set(rows.map(yearOf).filter(Boolean))).sort((a,b)=>a-b)
    return ys.at(-1) ?? null
  })()

  // Échantillon à la dernière année
  const latestYearSample = (latestYear != null && rows)
    ? rows.filter(r => yearOf(r) === latestYear)
        .map(r => toNum(r.samplesize) ?? 0)
        .reduce((a,b)=>a+b, 0)
    : null

  const cv = covExtra?.get(iso3)
  const covLines = []
  if (cv) {
    const friendly = {
      wbinc21: 'Groupe de revenu (BM)',
      regionname: 'Région',
      whoreg6: 'Région OMS',
      gdp_per_capita: 'PIB/hab.',
      population: 'Population',
      life_expectancy: 'Espérance de vie',
      perurb: '% pop. urbaine' // <- nouvel affichage
    }
    for (const k of Object.keys(friendly)) {
      if (cv[k] !== undefined && cv[k] !== null && cv[k] !== '') covLines.push([friendly[k], cv[k]])
    }
  }

  if (!item) {
    return (
      <div className="absolute card p-4 text-sm" style={style}>
        <div className="font-semibold">{name} <span className="text-slate-400">({iso3})</span></div>
        <div className="text-slate-300">Pas de données</div>
        {covLines.length ? (
          <div className="mt-2 text-xs text-slate-400">
            {covLines.map(([k, v]) => <div key={k}><span className="text-slate-500">{k}:</span> {String(v)}</div>)}
          </div>
        ) : null}
      </div>
    )
  }

  const { latest, value } = item

  return (
    <div className="absolute card p-4 text-sm min-w-[280px]" style={style}>
      <div className="font-semibold">{name} <span className="text-slate-400">({iso3})</span></div>
      <div className="text-slate-300">
        Moyenne toutes années/sexes : <span className="text-slate-100">{formatPct(value)}</span>
      </div>

      {/* Bloc "dernière année" (si dispo) */}
      {latest && (
        <div className="mt-2">
          <div className="text-xs uppercase tracking-wider text-slate-400">Dernières données ({latest.year})</div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="card p-2 text-center">
              <div className="text-[10px] text-slate-400">Hommes</div>
              <div className="font-semibold">{formatPct(latest.male)}</div>
            </div>
            <div className="card p-2 text-center">
              <div className="text-[10px] text-slate-400">Femmes</div>
              <div className="font-semibold">{formatPct(latest.female)}</div>
            </div>
            <div className="card p-2 text-center">
              <div className="text-[10px] text-slate-400">Global</div>
              <div className="font-semibold">{formatPct(latest.overall)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Échantillons (si rowsByIso fourni) */}
      {rows && (
        <div className="mt-2 text-xs text-slate-300 space-y-1">
          {Number.isFinite(+latestYearSample) && (
            <div>
              <span className="text-slate-400">Taille d’échantillon (dernière année)&nbsp;:</span>{' '}
              <span className="font-medium">{Intl.NumberFormat('fr-FR').format(Math.round(latestYearSample))}</span>
              {latestYear != null && <span className="text-slate-500"> ({latestYear})</span>}
            </div>
          )}
          {Number.isFinite(+totalCountrySample) && (
            <div>
              <span className="text-slate-400">Total (toutes années/sexes visibles)&nbsp;:</span>{' '}
              <span className="font-medium">{Intl.NumberFormat('fr-FR').format(Math.round(totalCountrySample))}</span>
            </div>
          )}
        </div>
      )}

      {/* Covariables (si dispo) */}
      {covLines.length ? (
        <div className="mt-2 text-xs text-slate-400">
          {covLines.map(([k, v]) => <div key={k}><span className="text-slate-500">{k}:</span> {String(v)}</div>)}
        </div>
      ) : null}
    </div>
  )
}
