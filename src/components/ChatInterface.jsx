import React, { useState } from 'react';

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

  const detectLanguage = (text) => {
    const frWords = ['bonjour', 'tribunal', 'avocat'];
    const enWords = ['hello', 'law', 'court'];
    const swWords = ['habari', 'sheria', 'mahakama'];
    const lnWords = ['mbote', 'mobeko'];
    const kgWords = ['maboko'];
    const tshWords = ['moyo', 'ntu'];

    const lower = text.toLowerCase();
    if (frWords.some(w => lower.includes(w))) return 'fr';
    if (enWords.some(w => lower.includes(w))) return 'en';
    if (swWords.some(w => lower.includes(w))) return 'sw';
    if (lnWords.some(w => lower.includes(w))) return 'ln';
    if (kgWords.some(w => lower.includes(w))) return 'kg';
    if (tshWords.some(w => lower.includes(w))) return 'tsh';

    return 'fr'; // par défaut
  };

  const handleSend = async () => {
    if (!userInput.trim()) return;

    const newMessages = [...messages, { from: 'user', text: userInput }];
    setMessages(newMessages);
    setUserInput('');
    setLoading(true);

    try {
      const language = detectLanguage(userInput);
      const response = await fetch('https://droitgpt-indexer.onrender.com/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, lang: language }),
      });

      const data = await response.json();
      const botReply = {
        from: 'assistant',
        text: data.answer || '❌ Réponse vide.',
      };
      setMessages([...newMessages, botReply]);
    } catch (err) {
      setMessages([...newMessages, {
        from: 'assistant',
        text: '❌ Erreur serveur. Veuillez réessayer.',
      }]);
    }

    setLoading(false);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#ece5dd] p-2">
      <div className="flex flex-col w-full max-w-md h-[90vh] bg-white rounded shadow border">
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
          {loading && <p className="text-center text-gray-500 italic">Assistant écrit...</p>}
        </div>

        {/* Input */}
        <div className="p-2 flex border-t">
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
  );
}
