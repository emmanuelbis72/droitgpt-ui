import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function ChatInterface() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('chatMessages');
    return saved
      ? JSON.parse(saved)
      : [{
          from: 'assistant',
          text: `👋 <strong>Bienvenue</strong><br/>Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>Posez-moi toutes vos questions juridiques 📚⚖️`,
        }];
  });

  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dots, setDots] = useState('');

  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setDots(prev => (prev.length < 3 ? prev + '.' : ''));
      }, 500);
    } else {
      setDots('');
    }
    return () => clearInterval(interval);
  }, [loading]);

  const detectLanguage = (text) => {
    const lower = text.toLowerCase();
    const dict = {
      fr: ['bonjour', 'tribunal', 'avocat'],
      en: ['hello', 'law', 'court'],
      sw: ['habari', 'sheria', 'mahakama'],
      ln: ['mbote', 'mobeko'],
      kg: ['maboko'],
      tsh: ['moyo', 'ntu'],
    };

    for (const [lang, words] of Object.entries(dict)) {
      if (words.some(w => lower.includes(w))) return lang;
    }
    return 'fr';
  };

  const handleSend = async () => {
    if (!userInput.trim()) return;

    const newMessages = [...messages, { from: 'user', text: userInput }];
    setMessages(newMessages);
    setUserInput('');
    setLoading(true);

    try {
      const lang = detectLanguage(userInput);
      const res = await fetch('https://droitgpt-indexer.onrender.com/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, lang }),
      });

      const data = await res.json();
      const reply = data.answer || '❌ Réponse vide.';
      setMessages([...newMessages, { from: 'assistant', text: reply }]);
    } catch (err) {
      setMessages([...newMessages, {
        from: 'assistant',
        text: '❌ Erreur serveur. Veuillez réessayer.',
      }]);
    }

    setLoading(false);
  };

  const handleReset = () => {
    const welcome = {
      from: 'assistant',
      text: `👋 <strong>Bienvenue</strong><br/>Je suis <strong>DroitGPT</strong>, votre assistant juridique congolais.<br/>Posez-moi toutes vos questions juridiques 📚⚖️`,
    };
    setMessages([welcome]);
    localStorage.removeItem('chatMessages');
    setUserInput('');
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#ece5dd]">
      <div className="flex flex-col w-full max-w-md h-screen bg-white rounded shadow border overflow-hidden relative">

        {/* Header */}
        <div className="bg-green-700 text-white flex items-center justify-between px-3 py-2 text-sm font-semibold">
          <span>DroitGPT – Assistant juridique congolais</span>
          <Link
            to="/"
            className="text-xs underline hover:text-gray-200"
          >
            ⬅️ Accueil
          </Link>
        </div>

        {/* Messages zone */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#ece5dd] mb-[90px]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] p-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
                  msg.from === 'user' ? 'bg-[#dcf8c6]' : 'bg-white'
                }`}
                dangerouslySetInnerHTML={{ __html: msg.text }}
              />
            </div>
          ))}
          {loading && (
            <div className="text-center text-gray-500 italic">💬 Assistant écrit{dots}</div>
          )}
        </div>

        {/* Input zone */}
        <div className="absolute bottom-0 left-0 w-full bg-white border-t p-3 pb-4">
          <div className="flex justify-between items-center mb-1 text-xs text-gray-600">
            <button
              onClick={handleReset}
              className="text-red-600 underline"
            >
              Réinitialiser
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 p-3 border rounded-l text-sm focus:outline-none"
              placeholder="Écrivez votre question ici..."
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

      </div>
    </div>
  );
}
