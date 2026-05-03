import React, { useState } from 'react';

export default function LandingPage({ onLogin }) {
  const [inputNpm, setInputNpm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputNpm.trim()) return;
    setLoading(true);
    await onLogin(inputNpm.trim());
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Sistem Rekomendasi Buku </h1>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Bersifat Serendipity</h2>
        <h2 className="text-xl font-bold tracking-tight mb-2">Perpustakaan UPN Veteran Jawa Timur</h2>
        <p className="text-gray-500 mb-8 mt-8">Masukkan NPM untuk memulai rekomendasi personal</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input 
            type="text" 
            placeholder="Contoh: 20191010001" 
            value={inputNpm}
            onChange={(e) => setInputNpm(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-center text-lg w-full"
            required
          />
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Memeriksa data...' : 'Cari Rekomendasi'}
          </button>
        </form>
      </div>
    </div>
  );
}
