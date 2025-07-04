import React, { useState, useEffect } from 'react';

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

  // ⏳ Animation des points de chargement "..."
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
    <div className="flex justify-center items-center min-h-screen bg-[#ece5dd] p-2">
      <div className="flex flex-col w-full max-w-md h-[95vh] bg-white rounded shadow border overflow-hidden">

        {/* Header */}
        <div className="bg-green-700 text-white text-center py-2 text-sm font-semibold">
          DroitGPT – Assistant juridique congolais
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#ece5dd]">
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

        {/* Footer */}
        <div className="p-2 flex flex-col gap-2 bg-white border-t">
          <div className="flex justify-end text-xs text-gray-700 mb-1">
            <button
              onClick={handleReset}
              className="text-red-600 underline text-xs"
            >
              Réinitialiser
            </button>
          </div>

          <div className="flex">
            <input
              type="text"
              className="flex-1 p-2 border rounded-l text-sm focus:outline-none"
              placeholder="Écrire ici..."
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
