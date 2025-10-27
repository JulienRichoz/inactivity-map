import * as d3 from 'd3'

// Build asset URL that works in dev (/), on GitHub Pages (/inactivity-map/), or with a relative base (./)
export function assetUrl(p) {
  const base =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.BASE_URL) || '/';

  // If base is an absolute URL (protocol or protocol-relative), we can use URL()
  if (/^https?:\/\//i.test(base) || base.startsWith('//')) {
    return new URL(p.replace(/^\/+/, ''), base).toString();
  }

  // For path-only bases like "/" or "./", do a safe string join (no URL()!)
  const b = base.replace(/\/+$/, '');
  const rel = p.replace(/^\/+/, '');
  return `${b}/${rel}`;
}

export function normISO3(v) { return (v ?? '').toString().trim().toUpperCase() }
export function aggregateRows(rows) {
  const byIso = d3.group(rows, d => normISO3(d.iso3))
  const out = new Map()
  const toNum = v => (Number.isFinite(+v) ? +v : null)
  for (const [iso3, items] of byIso) {
    const vals = items.map(d => toNum(d.fail_meet_recs)).filter(v => v != null)
    const meanAll = d3.mean(vals)
    const yearOf = d => toNum(d.midyear) ?? toNum(d.endyear) ?? toNum(d.beginyear)
    const byYear = d3.group(items, yearOf)
    const years = Array.from(byYear.keys()).filter(y => y != null).sort((a, b) => a - b)
    const latestYear = years.at(-1) ?? null
    let male = null, female = null, overall = null
    if (latestYear != null) {
      const lr = byYear.get(latestYear) || []
      const m = lr.filter(r => normISO3(r.sexstring) === 'MALE').map(r => toNum(r.fail_meet_recs)).filter(v => v != null)
      const f = lr.filter(r => normISO3(r.sexstring) === 'FEMALE').map(r => toNum(r.fail_meet_recs)).filter(v => v != null)
      male = m.length ? d3.mean(m) : null
      female = f.length ? d3.mean(f) : null
      const both = lr.map(r => toNum(r.fail_meet_recs)).filter(v => v != null)
      overall = both.length ? d3.mean(both) : null
    }
    out.set(iso3, { iso3, value: meanAll, latest: latestYear != null ? { year: latestYear, male, female, overall } : null })
  }
  return out
}
export function formatPct(v) { return (v == null || !isFinite(v)) ? '—' : d3.format('.0%')(v) }
