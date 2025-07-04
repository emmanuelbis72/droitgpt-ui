import { useState } from 'react';

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
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

      if (!response.ok || !response.body) throw new Error('Erreur de réponse du serveur');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let aiText = '';
      const assistantMsg = { from: 'assistant', text: '' };
      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        aiText += decoder.decode(value, { stream: true });
        assistantMsg.text = aiText;
        setMessages([...updatedMessages]); // force refresh
      }
    } catch (err) {
      setMessages(prev => [...prev, { from: 'assistant', text: '❌ Erreur serveur' }]);
    }

    setLoading(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="space-y-2 h-[70vh] overflow-y-auto bg-gray-100 p-4 rounded shadow">
        {messages.map((msg, i) => (
          <div key={i} className={msg.from === 'user' ? 'text-right' : 'text-left'}>
            <p className={msg.from === 'user'
              ? 'bg-blue-200 inline-block px-2 py-1 rounded'
              : 'bg-white inline-block px-2 py-1 rounded'}>
              <span dangerouslySetInnerHTML={{ __html: msg.text }} />
            </p>
          </div>
        ))}
        {loading && <p className="italic text-gray-500">Assistant est en train d’écrire...</p>}
      </div>

      <div className="mt-4 flex">
        <input
          type="text"
          classNa
