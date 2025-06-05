
import React from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-black">
      <h1 className="text-2xl font-bold mb-4">Bienvenue sur DroitGPT</h1>
      <Link to="/chat" className="px-4 py-2 bg-green-600 text-white rounded-xl">
        Accéder au Chat
      </Link>
    </div>
  )
}
