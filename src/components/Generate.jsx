import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const documentTypes = [
  { value: '', label: 'Sélectionner un type de document' },
  { value: 'contratTravail', label: 'Contrat de travail' },
  { value: 'procuration', label: 'Procuration' },
  { value: 'statuts', label: "Statuts d'une société" },
  { value: 'bail', label: 'Contrat de bail' },
  { value: 'note', label: 'Note juridique' },
];

export default function Generate() {
  const [docType, setDocType] = useState('');
  const [formData, setFormData] = useState({});
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate(); // 🔄 pour rediriger

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setPdfUrl('');

    try {
      const res = await fetch('https://droitgpt-pdf-api.onrender.com/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: docType, data: formData }),
      });

      if (!res.ok) throw new Error('Erreur serveur lors de la génération.');

      const blob = await res.blob();
      const fileURL = window.URL.createObjectURL(blob);
      setPdfUrl(fileURL);
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  };

  const renderFormFields = () => {
    switch (docType) {
      case 'contratTravail':
        return (
          <>
            <input name="employeur" placeholder="Nom de l'employeur" onChange={handleChange} className="border p-2 w-full" />
            <input name="employe" placeholder="Nom de l'employé" onChange={handleChange} className="border p-2 w-full" />
            <input name="poste" placeholder="Poste" onChange={handleChange} className="border p-2 w-full" />
            <input name="salaire" placeholder="Salaire mensuel" onChange={handleChange} className="border p-2 w-full" />
          </>
        );
      case 'procuration':
        return (
          <>
            <input name="mandant" placeholder="Nom du mandant" onChange={handleChange} className="border p-2 w-full" />
            <input name="mandataire" placeholder="Nom du mandataire" onChange={handleChange} className="border p-2 w-full" />
            <input name="objet" placeholder="Objet de la procuration" onChange={handleChange} className="border p-2 w-full" />
          </>
        );
      case 'statuts':
        return (
          <>
            <input name="nomSociete" placeholder="Nom de la société" onChange={handleChange} className="border p-2 w-full" />
            <input name="fondateur" placeholder="Nom du fondateur" onChange={handleChange} className="border p-2 w-full" />
            <input name="capital" placeholder="Capital social" onChange={handleChange} className="border p-2 w-full" />
          </>
        );
      case 'bail':
        return (
          <>
            <input name="bailleur" placeholder="Nom du bailleur" onChange={handleChange} className="border p-2 w-full" />
            <input name="locataire" placeholder="Nom du locataire" onChange={handleChange} className="border p-2 w-full" />
            <input name="adresseBien" placeholder="Adresse du bien loué" onChange={handleChange} className="border p-2 w-full" />
          </>
        );
      case 'note':
        return (
          <>
            <input name="sujet" placeholder="Sujet de la note juridique" onChange={handleChange} className="border p-2 w-full" />
            <input name="destinataire" placeholder="Destinataire" onChange={handleChange} className="border p-2 w-full" />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h2 className="text-2xl font-bold">📄 Génération de document juridique</h2>

      <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border p-2 w-full">
        {documentTypes.map((doc) => (
          <option key={doc.value} value={doc.value}>{doc.label}</option>
        ))}
      </select>

      <div className="space-y-2">{renderFormFields()}</div>

      {docType && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded w-full hover:bg-green-700"
        >
          {loading ? 'Génération en cours...' : 'Générer le document'}
        </button>
      )}

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {pdfUrl && (
        <div className="mt-4 p-4 border rounded bg-gray-100 text-center space-y-4">
          <div>
            ✅ Document prêt :
            <br />
            <a href={pdfUrl} download={`document_${docType}.pdf`} className="text-blue-600 underline font-semibold block mt-2">
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
