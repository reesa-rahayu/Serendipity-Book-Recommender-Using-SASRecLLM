import React, { useState } from 'react';
import RecommendationGrid from '../components/RecommendationGrid';

export default function SearchPage({ onBookSelect }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), top_k: Number(topK) })
      });
      
      if (res.ok) {
        const data = await res.json();
        setResults(data.books || []);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("Search failed", err);
      setResults([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <span className="inline-block px-3 py-1 mb-3 text-xs font-bold text-indigo-800 bg-indigo-100 rounded-full">Pencarian Semantik</span>
        <h2 className="text-3xl font-bold mb-2 tracking-tight">Cari Buku</h2>
        <p className="text-gray-500">Gunakan kata kunci konsep atau topik — bukan hanya judul persis.</p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-12">
        <div className="flex-grow">
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: pengantar kecerdasan buatan, ekonomi pembangunan..."
            className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-colors"
          />
        </div>
        <div className="w-full md:w-32">
          <input 
            type="number"
            min="5"
            max="30"
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:bg-white text-center"
          />
        </div>
        <button 
          type="submit"
          disabled={loading}
          className="px-8 py-4 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {loading ? 'Mencari...' : 'Cari'}
        </button>
      </form>

      {hasSearched && (
        <div className="mb-6 border-b border-gray-100 pb-4">
          <span className="text-sm font-semibold bg-gray-100 text-gray-700 px-3 py-1 rounded-md">
            {results.length} hasil ditemukan
          </span>
        </div>
      )}

      {!hasSearched ? (
        <div className="py-20 text-center flex flex-col items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <div className="text-4xl mb-4 opacity-50">🔍</div>
          <div className="font-semibold text-gray-800 mb-1">Masukkan kata kunci di atas</div>
          <div className="text-sm text-gray-500">
            Contoh: "manajemen keuangan", "hukum pidana", "pengantar statistika"
          </div>
        </div>
      ) : (
        <RecommendationGrid books={results} onBookSelect={onBookSelect} />
      )}
    </div>
  );
}
