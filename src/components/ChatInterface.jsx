
import React, { useState } from 'react'

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Bonjour 👋, je suis DroitGPT. Posez-moi votre question juridique.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
    if (!input.trim()) return
    const newMessages = [...messages, { from: 'user', text: input }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('https://ton-api-render.onrender.com/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input })
      })
      const data = await res.json()
      setMessages([...newMessages, { from: 'bot', text: data.answer }])
    } catch {
      setMessages([...newMessages, { from: 'bot', text: '❌ Une erreur est survenue. Veuillez réessayer.' }])
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl overflow-hidden flex flex-col h-[80vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs px-4 py-2 rounded-xl text-sm ${msg.from === 'user' ? 'bg-green-200' : 'bg-gray-200'}`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex gap-2 bg-white">
          <input
            className="flex-1 border rounded-xl px-4 py-2"
            placeholder="Écrivez votre question ici..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-xl">
            Envoyer
          </button>
        </div>
      </div>
    </div>
  )
}
