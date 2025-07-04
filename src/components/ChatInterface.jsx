import React, { useState } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!userInput.trim()) return;

    const userMsg = { from: 'user', text: userInput };
    setMessages((prev) => [...prev, userMsg]);
    setUserInput('');
    setLoading(true);

    try {
      const res = await fetch('https://droitgpt-indexer.onrender.com/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      const data = await res.json();
      setMessages((prev) => [...prev, { from: 'assistant', text: data.text || 'Réponse vide' }]);
    } catch (err) {
      setMessages((prev) => [...prev, { from: 'assistant', text: '❌ Erreur serveur. Veuillez réessayer.' }]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#e5ddd5]">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`mb-2 flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-lg p-2 max-w-[75%] text-sm ${msg.from === 'user' ? 'bg-[#dcf8c6]' : 'bg-white'}`}>
              <span dangerouslySetInnerHTML={{ __html: msg.text }} />
            </div>
          </div>
        ))}
        {loading && <p className="text-center italic text-gray-500">Assistant écrit...</p>}
      </div>

      <div className="flex p-2 border-t bg-white">
        <input
          type="text"
          className="flex-1 border rounded-l px-3 py-2 text-sm focus:outline-none"
          placeholder="Écrire un message..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          className="bg-green-600 text-white px-4 rounded-r text-sm"
          onClick={handleSend}
          disabled={loading}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
