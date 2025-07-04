import React, { useState, useEffect } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    {
      from: 'assistant',
      text: `
        👋 <strong>Bienvenue</strong><br/>
        Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>
        Posez-moi toutes vos questions juridiques 📚⚖️
      `,
    },
  ]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!userInput.trim()) return;

    const newMessages = [...messages, { from: 'user', text: userInput }];
    setMessages(newMessages);
    setUserInput('');
    setLoading(true);

    try {
      const response = await fetch('https://droitgpt-indexer.onrender.com/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await response.json();
      const botReply = {
        from: 'assistant',
        text: data.answer || '❌ Réponse vide.',
      };
      setMessages([...newMessages, botReply]);
    } catch (err) {
      setMessages([...newMessages, { from: 'assistant', text: '❌ Erreur serveur. Veuillez réessayer.' }]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#ece5dd]">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex items-end space-x-2 max-w-[80%]">
              {msg.from === 'assistant' && (
                <img src="/bot.png" alt="bot" className="w-6 h-6 rounded-full" />
              )}
              <div
                className={`p-3 rounded-lg text-sm shadow ${
                  msg.from === 'user' ? 'bg-[#dcf8c6]' : 'bg-white'
                }`}
                dangerouslySetInnerHTML={{ __html: msg.text }}
              />
              {msg.from === 'user' && (
                <img src="/user.png" alt="user" className="w-6 h-6 rounded-full" />
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-center text-gray-500 italic">Assistant écrit...</p>}
      </div>

      <div className="p-3 bg-white flex border-t">
        <input
          type="text"
          className="flex-1 p-2 rounded-l border text-sm focus:outline-none"
          placeholder="Écrire ici..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded-r text-sm"
          onClick={handleSend}
          disabled={loading}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
