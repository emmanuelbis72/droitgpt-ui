import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function Analyse() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('analyseHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const simulateProgress = () => {
    setProgress(0);
    let value = 0;
    const interval = setInterval(() => {
      value += Math.random() * 10;
      if (value >= 98) {
        clearInterval(interval);
      }
      setProgress(Math.min(value, 98));
    }, 200);
    return interval;
  };

  const handleAnalyse = async () => {
    if (!file) return setError('Veuillez sélectionner un fichier.');
    setError('');
    setLoading(true);
    setAnalysis('');

    const formData = new FormData();
    formData.append('file', file);

    const interval = simulateProgress();

    try {
      const res = await fetch('https://droitgpt-analysepdf.onrender.com/analyse-document', {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const raw = await res.text();
        throw new Error(`❌ Réponse inattendue : ${raw.slice(0, 100)}...`);
      }

      const data = await res.json();
      setAnalysis(data.analysis || '❌ Analyse vide.');

      const record = {
        filename: file.name,
        timestamp: new Date().toLocaleString(),
        content: data.analysis,
      };
      const updatedHistory = [record, ...history.slice(0, 9)];
      setHistory(updatedHistory);
      localStorage.setItem('analyseHistory', JSON.stringify(updatedHistory));
    } catch (err) {
      setError(err.message);
    }

    clearInterval(interval);
    setProgress(100);
    setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 500);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('📄 Analyse Juridique – DroitGPT', 20, 20);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'normal');
    const lines = doc.splitTextToSize(analysis, 170);
    doc.text(lines, 20, 35);
    doc.save('analyse_juridique.pdf');
  };

  const handleResetHistory = () => {
    localStorage.removeItem('analyseHistory');
    setHistory([]);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold">📂 Analyse de document juridique</h2>

      <input
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileChange}
        className="w-full p-2 border"
      />

      <button
        onClick={handleAnalyse}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 w-full rounded"
      >
        {loading ? 'Analyse en cours...' : 'Analyser le document'}
      </button>

      {loading && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2 overflow-hidden">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && <p className="text-red-600 text-sm">❌ {error}</p>}

      {analysis && (
        <div className="mt-4 border rounded bg-white shadow p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-lg">📋 Aperçu de l’analyse</h3>
            <button
              onClick={handleDownloadPDF}
              className="text-sm text-blue-600 underline"
            >
              Télécharger en PDF
            </button>
          </div>
          <div className="border border-gray-300 p-3 rounded bg-gray-50 whitespace-pre-wrap text-sm">
            {analysis}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">🕘 Historique des analyses</h3>
            <button
              onClick={handleResetHistory}
              className="text-sm text-red-600 underline"
            >
              Réinitialiser l’historique
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            {history.map((item, index) => (
              <li key={index} className="p-3 border rounded bg-gray-100">
                <p className="font-medium">📄 {item.filename}</p>
                <p className="text-gray-500 text-xs">🗓️ {item.timestamp}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-blue-600">Voir l’analyse</summary>
                  <pre className="mt-2 whitespace-pre-wrap">{item.content}</pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-6">
        <Link
          to="/"
          className="block text-center w-full bg-gray-300 hover:bg-gray-400 text-black py-2 rounded"
        >
          ⬅️ Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}
