import React from 'react'
import { Link, useLocation } from 'react-router-dom'
export default function Nav() {
  const { pathname } = useLocation()
  const link = (to, label) => (
    <Link to={to} className={`px-3 py-1 rounded-lg transition ${pathname===to?'bg-white/10 text-white':'text-slate-300 hover:text-white hover:bg-white/5'}`}>{label}</Link>
  )
  return <nav className="flex gap-2 items-center">{link('/', 'Carte principale')}{link('/covariates', 'Explorateur')}</nav>
}
