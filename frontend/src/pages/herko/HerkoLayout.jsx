import React from 'react'
import { Outlet } from 'react-router-dom'
import Header from '../../components/herko/Header'
import '../../styles/herko.css'

export default function HerkoLayout() {
  return (
    <div className="herko-layout">
      <Header />
      <main className="herko-main">
        <Outlet />
      </main>
    </div>
  )
}
