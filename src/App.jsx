import React, { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import ChoroplethMap from './components/ChoroplethMap'
import { aggregateRows, formatPct, normISO3 } from './lib/utils'
import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import Nav from './components/Nav'

export default function App() {
  const [rows, setRows] = useState(null)
  const [dataMap, setDataMap] = useState(null)
  const [covars, setCovars] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filtres simples
  const [income, setIncome] = useState(['H','UM','LM','L'])    // revenu BM
  const [pctRange, setPctRange] = useState([0, 1])       // fourchette % insuffisance (moyenne toutes années/sexes)

  useEffect(() => {
    async function load() {
      try {
        const csv = await d3.csv('/data/pina_dataset.csv', d3.autoType)
        csv.forEach(d => { d.iso3 = normISO3(d.iso3) })
        setRows(csv); setDataMap(aggregateRows(csv))
        const cv = await d3.csv('/data/covariates.csv', d3.autoType)
        cv.forEach(d => { d.iso3 = normISO3(d.iso3) })
        setCovars(cv)
      } catch (e) { setError(String(e)) } finally { setLoading(false) }
    }
    load()
  }, [])

  const covByIso = useMemo(() => covars ? new Map(covars.map(d => [d.iso3, d])) : null, [covars])

  function passesIncome(iso3) {
    if (!covByIso) return true
    const r = covByIso.get(iso3)
    if (!r || !r.wbinc21) return false
    return income.includes(r.wbinc21)
  }

  function passesPct(iso3) {
    const v = dataMap?.get(iso3)?.value
    if (v == null || !isFinite(v)) return false
    return v >= pctRange[0] && v <= pctRange[1]
  }

  // Predicate utilisé par la carte (désature les pays hors match)
  function isActive(iso3) {
    return passesIncome(iso3) && passesPct(iso3)
  }

  // Lignes filtrées pour stats & top
  const filteredRows = useMemo(() => {
    if (!rows || !covByIso || !dataMap) return rows
    return rows.filter(r => passesIncome(r.iso3) && passesPct(r.iso3))
  }, [rows, covByIso, dataMap, income, pctRange])

  const coverage = useMemo(() => ({ countries: dataMap ? dataMap.size : 0 }), [dataMap])

  const globalStats = useMemo(() => {
    if (!filteredRows) return null
    const grouped = d3.group(filteredRows, d => d.iso3)
    const latestOverall = [], males = [], females = []
    for (const [iso3, items] of grouped) {
      const yearOf = d => d.midyear ?? d.endyear ?? d.beginyear
      const years = Array.from(new Set(items.map(yearOf).filter(Boolean))).sort((a,b)=>a-b)
      const latest = years.at(-1) ?? null
      if (latest == null) continue
      const lrows = items.filter(d => (d.midyear ?? d.endyear ?? d.beginyear) === latest)
      const vals = lrows.map(d => d.fail_meet_recs).filter(v => v != null && isFinite(v))
      if (vals.length) latestOverall.push(d3.mean(vals))
      const m = lrows.filter(d => normISO3(d.sexstring) === 'MALE').map(d => d.fail_meet_recs).filter(v => v != null && isFinite(v))
      const f = lrows.filter(d => normISO3(d.sexstring) === 'FEMALE').map(d => d.fail_meet_recs).filter(v => v != null && isFinite(v))
      if (m.length) males.push(d3.mean(m)); if (f.length) females.push(d3.mean(f))
    }
    const world = d3.mean(latestOverall), male = d3.mean(males), female = d3.mean(females)
    // Écart calculé sur les pourcentages arrondis => pas de 8 vs 9
    const gapPct = (male!=null && female!=null) ? (Math.round(female*100) - Math.round(male*100)) : null
    return { world, male, female, gapPct }
  }, [filteredRows])

  const covExtraMap = useMemo(() => covByIso, [covByIso])

  // Helpers curseur %
  const clamp01 = v => Math.max(0, Math.min(1, v))
  const setMin = v => setPctRange(([min, max]) => [Math.min(clamp01(v), max), max])
  const setMax = v => setPctRange(([min, max]) => [min, Math.max(min, clamp01(v))])

  return (
    <div className="min-h-screen">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <Nav />
        <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} transition={{duration:0.6}}
          className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="h-10 w-10 rounded-2xl bg-emerald-400/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Inactivité physique – Carte mondiale</h1>
            <p className="text-slate-300 text-sm">Part estimée de la population n'atteignant pas les recommandations d'activité physique (source : OMS).</p>
          </div>
        </motion.div>
        <div className="w-32" />
      </header>

      <main className="px-4 sm:px-10">
        {/* Filtres compacts */}
        <div className="max-w-6xl mx-auto mb-3 flex flex-col gap-2">
          <div className="inline-flex gap-2 card p-2 items-center">
            <span className="text-xs text-slate-400">Revenu (BM)</span>
            {['H','UM','LM','L'].map(code => (
              <button key={code}
                onClick={() => setIncome(prev => prev.includes(code) ? prev.filter(v=>v!==code) : [...prev, code])}
                className={`px-2 py-1 rounded-lg text-sm border ${income.includes(code) ? 'bg-white/10 text-white border-white/20' : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10'}`}>
                {code}
              </button>
            ))}
            <button onClick={() => setIncome(['H','UM','LM','L'])} className="ml-2 text-xs underline text-slate-300 hover:text-white">Tous</button>
          </div>

          {/* Fourchette % insuffisance (double curseur) */}
          <div className="card p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">Fourchette % insuffisance (moyenne toutes années/sexes)</div>
              <div className="text-sm text-slate-200 font-medium">
                {Math.round(pctRange[0]*100)}% → {Math.round(pctRange[1]*100)}%
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-8">Min</span>
                <input type="range" min="0" max="1" step="0.01" value={pctRange[0]} onChange={e => setMin(+e.target.value)} className="w-full" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-8">Max</span>
                <input type="range" min="0" max="1" step="0.01" value={pctRange[1]} onChange={e => setMax(+e.target.value)} className="w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Carte */}
        <section className="max-w-6xl mx-auto card p-3 sm:p-6">
          {loading && <div className="p-6 text-center text-slate-300">Chargement…</div>}
          {error && <div className="p-6 text-center text-rose-400">Erreur : {error}</div>}
          {!loading && !error && dataMap && (
            <ChoroplethMap dataMap={dataMap} isActive={isActive} covExtra={covExtraMap} legend="bottom" />
          )}
        </section>

        {/* Stats */}
        <section className="max-w-6xl mx-auto grid sm:grid-cols-3 gap-4 mt-6">
          <div className="card p-5">
            <div className="text-slate-400 text-xs uppercase">Couverture</div>
            <div className="text-2xl font-semibold">{coverage.countries}</div>
            <div className="text-slate-300 text-sm">pays avec données</div>
          </div>

          <TopCountries rows={filteredRows} />

          <div className="card p-5">
            <div className="text-slate-400 text-xs uppercase">Moyenne (selon filtres) — dernière année par pays</div>
            {globalStats ? (
              <div className="mt-2 space-y-1">
                <div><span className="text-slate-400">Global</span> <span className="float-right font-semibold">{formatPct(globalStats.world)}</span></div>
                <div><span className="text-slate-400">Hommes</span> <span className="float-right">{formatPct(globalStats.male)}</span></div>
                <div><span className="text-slate-400">Femmes</span> <span className="float-right">{formatPct(globalStats.female)}</span></div>
                {Number.isFinite(globalStats.gapPct) && <div className="text-xs text-slate-400 mt-1">Écart femmes-hommes : {globalStats.gapPct}%</div>}
              </div>
            ) : <div className="text-slate-300">—</div>}
          </div>
        </section>

        <footer className="max-w-6xl mx-auto mt-10 mb-8 text-xs text-slate-400">
          Basé sur <a className="underline hover:text-slate-200" href="https://www.who.int/fr/news-room/fact-sheets/detail/physical-activity" target="_blank" rel="noreferrer">les fiches d'information OMS</a> et votre jeu de données PINA.
        </footer>
      </main>
    </div>
  )
}

function TopCountries({ rows }) {
  const [list, setList] = useState([])

  useEffect(() => {
    if (!rows) return setList([])
    const grouped = d3.group(rows, d => d.iso3)
    const arr = []
    for (const [iso3, items] of grouped) {
      const yearOf = d => d.midyear ?? d.endyear ?? d.beginyear
      const years = Array.from(new Set(items.map(yearOf).filter(Boolean))).sort((a,b)=>a-b)
      const latest = years.at(-1) ?? null
      if (latest == null) continue
      const vals = items
        .filter(d => (d.midyear ?? d.endyear ?? d.beginyear) === latest)
        .map(d => d.fail_meet_recs)
        .filter(v => v != null && isFinite(v))
      if (vals.length) arr.push({ iso3, pct: d3.mean(vals) })
    }
    arr.sort((a,b)=>d3.descending(a.pct,b.pct))
    setList(arr.slice(0, 6))
  }, [rows])

  return (
    <div className="card p-5">
      <div className="text-slate-400 text-xs uppercase">Dernières estimations (plus haut % insuffisant) — selon filtres</div>
      <ul className="mt-3 space-y-2">
        {list.map(item => (
          <li key={item.iso3} className="flex justify-between">
            <span className="font-medium">{item.iso3}</span>
            <span className="text-slate-300">{formatPct(item.pct)}</span>
          </li>
        ))}
        {!list.length && <li className="text-slate-400 text-sm">Aucun pays avec ces filtres.</li>}
      </ul>
    </div>
  )
}
