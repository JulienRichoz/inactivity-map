import React, { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import ChoroplethMap from '../components/ChoroplethMap'
import { aggregateRows, formatPct, normISO3 } from '../lib/utils'
import { motion } from 'framer-motion'
import { Filter } from 'lucide-react'
import Nav from '../components/Nav'
import { assetUrl } from '../lib/utils'


export default function CovariatesPage() {
  // --- ÉTAT ---
  const [rows, setRows] = useState(null)        // données PINA
  const [dataMap, setDataMap] = useState(null)  // agrégat pour la carte
  const [covars, setCovars] = useState(null)    // covariables par pays
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filtres avancés
  const [income, setIncome] = useState(['H','UM','LM','L'])  // groupe revenu BM
  const [gender, setGender] = useState('both')               // 'both' | 'M' | 'F'
  const [ageRange, setAgeRange] = useState([0, 100])         // bornes âge
  const [yearRange, setYearRange] = useState([2000, 2030])   // bornes année (survey)
  const [surveyModes, setSurveyModes] = useState([])         // survey_admin multi
  const [questionCats, setQuestionCats] = useState([])       // questionnaire_cat multi
  const [adminLevels, setAdminLevels] = useState(['N','R','U']) // <- nouveau
  const [perurbRange, setPerurbRange] = useState([0,100])    // <- nouveau : % urbain (covariates)

  // Fourchette % insuffisants (préfiltre)
  const [pctRange, setPctRange] = useState([0, 1])

  // --- CHARGEMENT ---
  useEffect(() => {
    async function load() {
      try {
        // Charge fichier principal
        const csv = await d3.csv(assetUrl('data/pina_dataset.csv'), d3.autoType)
        csv.forEach(d => { d.iso3 = normISO3(d.iso3) })
        setRows(csv)
        setDataMap(aggregateRows(csv))

        // Charge covariables (WB income, perurb, etc.)
        const cv = await d3.csv(assetUrl('data/covariates.csv'), d3.autoType)
        cv.forEach(d => { d.iso3 = normISO3(d.iso3) })
        setCovars(cv)

        // Ranges auto
        const ages = csv.flatMap(d => [d.startage, d.endage]).filter(v => v != null && isFinite(v))
        const years = csv.flatMap(d => [d.beginyear, d.midyear, d.endyear]).filter(v => v != null && isFinite(v))
        setAgeRange([Math.floor(d3.min(ages) ?? 0), Math.ceil(d3.max(ages) ?? 100)])
        setYearRange([Math.floor(d3.min(years) ?? 2000), Math.ceil(d3.max(years) ?? 2030)])

        // perurb min/max depuis covariates
        const purb = cv.map(d => d.perurb).filter(v => v != null && isFinite(v))
        if (purb.length) setPerurbRange([Math.floor(d3.min(purb)), Math.ceil(d3.max(purb))])

        // Options dropdowns
        setSurveyModes(Array.from(new Set(csv.map(d => d.survey_admin).filter(Boolean))).sort())
        setQuestionCats(Array.from(new Set(csv.map(d => d.questionnaire_cat).filter(Boolean))).sort())

      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Map ISO3 -> covariates row
  const covByIso = useMemo(() => covars ? new Map(covars.map(d => [d.iso3, d])) : null, [covars])

  // Helpers curseur %
  const clamp01 = v => Math.max(0, Math.min(1, v))
  const setMin = v => setPctRange(([min, max]) => [Math.min(Math.max(0, v), max), max])
  const setMax = v => setPctRange(([min, max]) => [min, Math.max(min, Math.min(1, v))])

  // Conversions utilitaires
  const yearOf = d => (Number.isFinite(+d.midyear) ? +d.midyear : (Number.isFinite(+d.endyear) ? +d.endyear : (Number.isFinite(+d.beginyear) ? +d.beginyear : null)))
  const overlapsAge = (d, minA, maxA) => {
    const a0 = Number.isFinite(+d.startage) ? +d.startage : null
    const a1 = Number.isFinite(+d.endage) ? +d.endage : null
    if (a0 == null && a1 == null) return true
    const s = a0 ?? a1 ?? 0
    const e = a1 ?? a0 ?? 100
    return !(e < minA || s > maxA)
  }

  // --- FILTRAGE LIGNE-À-LIGNE ---
  const filteredRows = useMemo(() => {
    if (!rows) return []
    const modeSet = new Set(surveyModes.length ? surveyModes : rows.map(d => d.survey_admin).filter(Boolean))
    const qcSet = new Set(questionCats.length ? questionCats : rows.map(d => d.questionnaire_cat).filter(Boolean))
    const gSel = gender === 'both' ? null : (gender === 'M' ? 'MALE' : 'FEMALE')
    const adminSet = new Set(adminLevels)

    return rows.filter(d => {
      const iso = d.iso3

      // Income (via covariates)
      if (covByIso) {
        const r = covByIso.get(iso)
        if (!r || !r.wbinc21 || !income.includes(r.wbinc21)) return false

        // Filtre perurb (si dispo)
        if (r.perurb != null && isFinite(r.perurb)) {
          if (r.perurb < perurbRange[0] || r.perurb > perurbRange[1]) return false
        }
      }

      // % insuffisants (préfiltre)
      if (d.fail_meet_recs == null || !isFinite(d.fail_meet_recs)) return false
      if (d.fail_meet_recs < pctRange[0] || d.fail_meet_recs > pctRange[1]) return false

      // Sexe
      if (gSel && String(d.sexstring).toUpperCase() !== gSel) return false

      // Âge
      if (!overlapsAge(d, ageRange[0], ageRange[1])) return false

      // Années
      const y = yearOf(d)
      if (y == null || y < yearRange[0] || y > yearRange[1]) return false

      // Type d'enquête
      if (d.survey_admin && !modeSet.has(d.survey_admin)) return false

      // Catégorie de questionnaire
      if (d.questionnaire_cat && !qcSet.has(d.questionnaire_cat)) return false

      // Niveau administratif (N/R/U)
      if (d.adminlevel && !adminSet.has(String(d.adminlevel).toUpperCase())) return false

      return true
    })
  }, [rows, covByIso, income, pctRange, gender, ageRange, yearRange, surveyModes, questionCats, adminLevels, perurbRange])

  // --- AGRÉGATIONS POUR LA CARTE & STATISTIQUES ---
  const filteredMap = useMemo(() => aggregateRows(filteredRows), [filteredRows])

  // Groupement ISO3 -> lignes (pour échantillons par pays dans le hover)
  const rowsByIso = useMemo(
    () => new Map(d3.group(filteredRows, d => normISO3(d.iso3))),
    [filteredRows]
  )

  // Total échantillon global (toutes lignes filtrées)
  const totalSample = useMemo(
    () => filteredRows.map(r => Number.isFinite(+r.samplesize) ? +r.samplesize : 0).reduce((a,b)=>a+b, 0),
    [filteredRows]
  )

  // Couverture : nombre de pays présents après filtres
  const coverage = useMemo(() => {
    const countries = new Set(filteredRows.map(d => d.iso3))
    return { countries: countries.size }
  }, [filteredRows])

  return (
    <div className="min-h-screen">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <Nav />
        <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} transition={{duration:0.6}}
          className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="h-10 w-10 rounded-2xl bg-violet-400/10 flex items-center justify-center">
            <Filter className="h-5 w-5 text-violet-300" />
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase">Explorateur</div>
            <div className="text-xl font-semibold">Carte + filtres avancés</div>
          </div>
        </motion.div>
      </header>

      <main className="px-6 sm:px-10">
        {/* PANNEAU DE FILTRES */}
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Revenu (WB) */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">Revenu (Banque mondiale)</div>
            <div className="flex flex-wrap gap-2">
              {['H','UM','LM','L'].map(code => (
                <button key={code}
                  onClick={() => setIncome(prev => prev.includes(code) ? prev.filter(v => v!==code) : [...prev, code])}
                  className={"px-2.5 py-1.5 rounded-xl border text-sm " + (income.includes(code) ? "bg-white/10 border-white/20" : "border-white/5 hover:border-white/10")}>
                  {({H:'Haut','UM':'Moyen sup.','LM':'Moyen inf.','L':'Faible'})[code]}
                </button>
              ))}
            </div>
          </div>

          {/* Niveau administratif N/R/U */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">Niveau administratif</div>
            <div className="flex flex-wrap gap-2">
              {['N','R','U'].map(level => (
                <button key={level}
                  onClick={() => setAdminLevels(prev => prev.includes(level) ? prev.filter(v => v!==level) : [...prev, level])}
                  className={"px-2.5 py-1.5 rounded-xl border text-sm " + (adminLevels.includes(level) ? "bg-white/10 border-white/20" : "border-white/5 hover:border-white/10")}>
                  {({N:'National', R:'Régional', U:'Urbain'})[level]}
                </button>
              ))}
            </div>
          </div>

          {/* Sexe & âge */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">Sexe</div>
            <div className="flex gap-2">
              {['both','M','F'].map(g => (
                <button key={g}
                  onClick={() => setGender(g)}
                  className={"px-3 py-1.5 rounded-xl border text-sm " + (gender===g ? "bg-white/10 border-white/20" : "border-white/5 hover:border-white/10")}>
                  {{both:'Tous',M:'Hommes',F:'Femmes'}[g]}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-slate-400 text-xs uppercase">Tranche d'âge</div>
              <div className="mt-2 flex items-center gap-3">
                <input type="number" className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 w-20" value={ageRange[0]} min={0} max={ageRange[1]}
                  onChange={e => setAgeRange([+e.target.value, ageRange[1]])} />
                <div className="text-slate-400">à</div>
                <input type="number" className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 w-20" value={ageRange[1]} min={ageRange[0]} max={100}
                  onChange={e => setAgeRange([ageRange[0], +e.target.value])} />
              </div>
            </div>
          </div>

          {/* Années */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">Année d'enquête</div>
            <div className="mt-2 flex items-center gap-3">
              <input type="number" className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 w-24" value={yearRange[0]} onChange={e => setYearRange([+e.target.value, yearRange[1]])} />
              <div className="text-slate-400">à</div>
              <input type="number" className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 w-24" value={yearRange[1]} onChange={e => setYearRange([yearRange[0], +e.target.value])} />
            </div>
          </div>

          {/* Type d’enquête */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">Type d'enquête (survey_admin)</div>
            <select multiple className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 w-full min-h-[120px]" value={surveyModes} onChange={e => setSurveyModes(Array.from(e.target.selectedOptions).map(o => o.value))}>
              {Array.from(new Set(rows?.map(d => d.survey_admin).filter(Boolean) ?? [])).sort().map(mode =>
                <option key={mode} value={mode}>{mode}</option>
              )}
            </select>
            <div className="mt-2 text-xs text-slate-400">Astuce : Ctrl/Cmd+clic pour (dé)sélectionner.</div>
          </div>

          {/* Questionnaire */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">Type de questionnaire</div>
            <select multiple className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 w-full min-h-[120px]" value={questionCats} onChange={e => setQuestionCats(Array.from(e.target.selectedOptions).map(o => o.value))}>
              {Array.from(new Set(rows?.map(d => d.questionnaire_cat).filter(Boolean) ?? [])).sort().map(cat =>
                <option key={cat} value={cat}>{cat}</option>
              )}
            </select>
          </div>

          {/* perurb : % de population urbaine (covariates) */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">% population urbaine (perurb)</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-8">Min</span>
                <input type="range" min="0" max="100" step="1" value={perurbRange[0]}
                  onChange={e => setPerurbRange([+e.target.value, perurbRange[1]])} className="w-full" />
                <span className="w-14 text-right">{perurbRange[0]}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-8">Max</span>
                <input type="range" min="0" max="100" step="1" value={perurbRange[1]}
                  onChange={e => setPerurbRange([perurbRange[0], +e.target.value])} className="w-full" />
                <span className="w-14 text-right">{perurbRange[1]}%</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-1">Filtre appliqué via le pays (covariates.csv → perurb).</div>
          </div>

          {/* Filtre % insuffisants (approx.) */}
          <div className="card p-4">
            <div className="text-slate-400 text-xs uppercase mb-2">% insuffisants (approx.)</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-8">Min</span>
                <input type="range" min="0" max="1" step="0.01" value={pctRange[0]} onChange={e => setMin(+e.target.value)} className="w-full" />
                <span className="w-14 text-right">{formatPct(pctRange[0])}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-8">Max</span>
                <input type="range" min="0" max="1" step="0.01" value={pctRange[1]} onChange={e => setMax(+e.target.value)} className="w-full" />
                <span className="w-14 text-right">{formatPct(pctRange[1])}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CARTE */}
        <section className="max-w-6xl mx-auto card p-3 sm:p-6 mt-4">
          {loading && <div className="p-6 text-center text-slate-300">Chargement…</div>}
          {error && <div className="p-6 text-center text-rose-400">Erreur : {error}</div>}
          {!loading && !error && filteredMap && (
            <ChoroplethMap
              dataMap={filteredMap}
              covExtra={covByIso}
              isActive={(iso3) => filteredMap?.has(iso3)}
              rowsByIso={rowsByIso}
              totalSample={totalSample}
            />
          )}
        </section>

        {/* STATISTIQUES */}
        <section className="max-w-6xl mx-auto grid sm:grid-cols-3 gap-4 mt-6">
          <div className="card p-5">
            <div className="text-slate-400 text-xs uppercase">Couverture</div>
            <div className="text-2xl font-semibold">{coverage.countries}</div>
            <div className="text-slate-300 text-sm">pays avec données</div>
          </div>

          <TopCountries rows={filteredRows} />

          <div className="card p-5">
            <div className="text-slate-400 text-xs uppercase">Moyenne (selon filtres) — dernière année par pays</div>
            <GlobalStats rows={filteredRows} />
          </div>
        </section>

        <footer className="max-w-6xl mx-auto mt-10 mb-8 text-xs text-slate-400">
          Basé sur <a className="underline hover:text-slate-200" href="https://www.who.int/fr/news-room/fact-sheets/detail/physical-activity" target="_blank" rel="noreferrer">les fiches d'information OMS</a> et votre jeu de données PINA.
        </footer>
      </main>
    </div>
  )
}

// ----- Helpers UI -----
function GlobalStats({ rows }) {
  if (!rows?.length) return <div className="text-slate-300">—</div>
  const toNum = v => (Number.isFinite(+v) ? +v : null)
  const yearOf = d => toNum(d.midyear) ?? toNum(d.endyear) ?? toNum(d.beginyear)
  const byIso = d3.group(rows, d => normISO3(d.iso3))
  const latestOverall = [], males=[], females=[]
  for (const [, items] of byIso) {
    const years = Array.from(new Set(items.map(yearOf).filter(Boolean))).sort((a,b)=>a-b)
    const latest = years.at(-1) ?? null
    if (latest == null) continue
    const lrows = items.filter(d => yearOf(d) === latest)
    const vals = lrows.map(d => toNum(d.fail_meet_recs)).filter(v => v != null)
    if (vals.length) latestOverall.push(d3.mean(vals))
    const m = lrows.filter(d => normISO3(d.sexstring) === 'MALE').map(d => toNum(d.fail_meet_recs)).filter(v => v != null)
    const f = lrows.filter(d => normISO3(d.sexstring) === 'FEMALE').map(d => toNum(d.fail_meet_recs)).filter(v => v != null)
    if (m.length) males.push(d3.mean(m)); if (f.length) females.push(d3.mean(f))
  }
  const world = d3.mean(latestOverall), male = d3.mean(males), female = d3.mean(females)
  const gapPct = (male!=null && female!=null) ? (Math.round(female*100) - Math.round(male*100)) : null
  return (
    <div className="mt-2 space-y-1">
      <div><span className="text-slate-400">Global</span> <span className="float-right font-semibold">{formatPct(world)}</span></div>
      <div><span className="text-slate-400">Hommes</span> <span className="float-right">{formatPct(male)}</span></div>
      <div><span className="text-slate-400">Femmes</span> <span className="float-right">{formatPct(female)}</span></div>
      {Number.isFinite(gapPct) && <div className="text-slate-400 mt-1">Écart femmes-hommes : {gapPct}%</div>}
    </div>
  )
}

function TopCountries({ rows }) {
  const toNum = v => (Number.isFinite(+v) ? +v : null)
  const yearOf = d => toNum(d.midyear) ?? toNum(d.endyear) ?? toNum(d.beginyear)
  const byIso = d3.group(rows ?? [], d => normISO3(d.iso3))
  const list = []
  for (const [iso3, items] of byIso) {
    const years = Array.from(new Set(items.map(yearOf).filter(Boolean))).sort((a,b)=>a-b)
    const latest = years.at(-1) ?? null
    if (latest == null) continue
    const lrows = items.filter(d => yearOf(d) === latest)
    const vals = lrows.map(d => toNum(d.fail_meet_recs)).filter(v => v != null && isFinite(v))
    if (!vals.length) continue
    list.push({ iso3, pct: d3.mean(vals) })
  }
  list.sort((a,b) => d3.descending(a.pct, b.pct))
  list.splice(10)
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
