import { useState, useRef, useEffect } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatContainerRef = useRef(null);

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

      if (!response.ok || !data?.text) {
        throw new Error('Erreur dans la réponse du serveur.');
      }

      setMessages((prev) => [...prev, { from: 'assistant', text: data.text }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { from: 'assistant', text: '❌ Erreur serveur. Veuillez réessayer.' },
      ]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <div className="flex flex-col h-screen bg-[#e5ddd5]">
      <div
        className="flex-1 overflow-y-auto p-4"
        ref={chatContainerRef}
      >
        {messages.map((msg, i) => (
          <div key={i} className={`mb-3 flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-2 rounded-xl shadow
                ${msg.from === 'user'
                  ? 'bg-[#dcf8c6] text-right rounded-br-none'
                  : 'bg-white text-left rounded-bl-none'}`}
            >
              <span dangerouslySetInnerHTML={{ __html: msg.text }} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-center text-gray-500 italic mt-2">
            Assistant est en train d’écrire...
          </div>
        )}
      </div>

      <div className="p-2 bg-[#f0f0f0] flex">
        <input
          type="text"
          className="flex-1 border border-gray-300 rounded-l-full px-4 py-2 focus:outline-none"
          placeholder="Écris ta question juridique ici..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          className="bg-green-600 text-white px-6 rounded-r-full"
          onClick={handleSend}
          disabled={loading}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
