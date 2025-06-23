import React from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-black">
      <h1 className="text-2xl font-bold mb-4">Bienvenue sur DroitGPT</h1>
      
      <div className="mb-4 text-center">
        <p className="text-sm text-gray-700">
          Contactez-nous à :
        </p>
        <p className="text-sm">
          <a
            href="mailto:info@droitgpt.com"
            className="text-blue-600 hover:underline"
          >
            info@droitgpt.com
          </a>
          <span className="mx-2 text-gray-400">|</span>
          <span className="text-green-700 font-medium">
            +243 816 307 451
          </span>
        </p>
      </div>

      <Link to="/chat" className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700">
        Accéder au Chat
      </Link>
    </div>
  )
}
