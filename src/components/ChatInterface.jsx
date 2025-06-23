import React, { useState, useEffect, useRef } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: '<h2>Bonjour 👋</h2><p>Je suis <strong>DroitGPT, votre assistant juridique spécialisé dans le droit congolais</strong>. Posez-moi votre question juridique.</p>'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const newMessages = [...messages, { from: 'user', text: input }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('https://droitgpt-indexer.onrender.com/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();

      // Réponse HTML directe depuis le backend
      setMessages([...newMessages, { from: 'bot', text: data.answer }]);
    } catch {
      setMessages([...newMessages, {
        from: 'bot',
        text: '<p>❌ <strong>Une erreur est survenue.</strong> Veuillez réessayer.</p>'
      }]);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl overflow-hidden flex flex-col h-[80vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-xl text-sm ${
                  msg.from === 'user' ? 'bg-green-200' : 'bg-gray-200'
                }`}
              >
                {msg.from === 'bot' ? (
                  <div
                    className="prose prose-sm max-w-none text-black"
                    dangerouslySetInnerHTML={{ __html: msg.text }}
                  />
                ) : (
                  <span>{msg.text}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef}></div>
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
          <button
            onClick={sendMessage}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded-xl"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
