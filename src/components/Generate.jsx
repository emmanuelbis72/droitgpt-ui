import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const documentTypes = [
  { value: '', label: 'Sélectionner un type de document' },
  { value: 'Contrat de travail à durée déterminée', label: 'Contrat de travail' },
  { value: 'Procuration simple pour acte administratif', label: 'Procuration' },
  { value: 'Statuts de société à responsabilité limitée', label: "Statuts d'une société" },
  { value: 'Contrat de bail résidentiel', label: 'Contrat de bail' },
  { value: 'Note juridique sur un litige', label: 'Note juridique' },
];

export default function Generate() {
  const [docType, setDocType] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let interval;
    if (loading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => (prev < 95 ? prev + 5 : prev));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleGenerate = async () => {
    if (!title || !content) {
      setError('Veuillez remplir le titre et le contenu à inclure.');
      return;
    }

    setLoading(true);
    setError('');
    setPdfUrl('');

    try {
      const res = await fetch('https://droitgpt-pdf-api.onrender.com/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      if (!res.ok) throw new Error('Erreur serveur lors de la génération.');

      const blob = await res.blob();
      const fileURL = window.URL.createObjectURL(blob);
      setPdfUrl(fileURL);
      setProgress(100);
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h2 className="text-2xl font-bold">📄 Génération de document juridique</h2>

      {/* Sélection de modèle type */}
      <select
        value={docType}
        onChange={(e) => {
          const selectedType = e.target.value;
          setDocType(selectedType);
          setTitle(selectedType); // auto-remplit le titre par défaut
        }}
        className="border p-2 w-full"
      >
        {documentTypes.map((doc) => (
          <option key={doc.value} value={doc.value}>
            {doc.label}
          </option>
        ))}
      </select>

      {/* Champ titre personnalisé */}
      <input
        type="text"
        name="title"
        placeholder="Titre du document (ex : Contrat de prestation de services)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border p-2 w-full"
      />

      {/* Champ contenu essentiel */}
      <textarea
        name="content"
        placeholder="Informations à inclure obligatoirement (ex : clauses, durée, parties, etc.)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="border p-2 w-full h-32"
      />

      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`px-4 py-2 w-full rounded text-white font-semibold transition ${
          loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {loading ? 'Génération en cours...' : 'Générer le document'}
      </button>

      {loading && (
        <div className="w-full bg-gray-200 rounded-full h-3 mt-3 overflow-hidden">
          <div
            className="bg-green-600 h-3 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {pdfUrl && (
        <div className="mt-4 p-4 border rounded bg-gray-100 text-center space-y-4">
          <div>
            ✅ Document prêt :
            <br />
            <a
              href={pdfUrl}
              download={`document_${title.replace(/\s+/g, '_')}.pdf`}
              className="text-blue-600 underline font-semibold block mt-2"
            >
              📥 Télécharger le document
            </a>
          </div>

          <button
            onClick={() => navigate('/')}
            className="text-sm text-green-700 underline font-semibold hover:text-green-800"
          >
            ⬅️ Retour à l'accueil
          </button>
        </div>
      )}
    </div>
  );
}
