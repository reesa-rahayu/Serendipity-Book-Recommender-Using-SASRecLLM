import React, { useState, useEffect } from 'react';
import UserProfile from '../components/UserProfile';
import RecommendationGrid from '../components/RecommendationGrid';

export default function Dashboard({ npm, userType, userInfo, setUserInfo, initialColdRecs, onBookSelect }) {
  const [recs, setRecs] = useState({ books: [], user_serendipity_score: 0 });
  const [history, setHistory] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [topK, setTopK] = useState(10);
  const [activeTab, setActiveTab] = useState('rekomendasi');

  // Edit profile states for cold user
  const [isEditing, setIsEditing] = useState(false);
  const [editNama, setEditNama] = useState(userInfo?.nama || '');
  const [editFak, setEditFak] = useState(userInfo?.fakultas || '');
  const [editJur, setEditJur] = useState(userInfo?.jurusan || '');
  const [editJenjang, setEditJenjang] = useState(userInfo?.jenjang || '');

  const fetchRecs = async (k) => {
    try {
      setLoadingRecs(true);
      // If we're cold start and this is initial load, we use initialColdRecs
      // But if topK changed, we'd theoretically need to re-fetch from POST /recommend/cold
      // which requires liked_book_ids. We don't have it saved. 
      // For simplicity, we just fetch warm if possible, or gracefully fail/skip for cold.
      
      let endpoint = `http://localhost:8000/recommend/warm?npm=${npm}&top_k=${k}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setRecs(data);
      }
    } catch (err) {
      console.error("Failed to fetch recs", err);
    } finally {
      setLoadingRecs(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`http://localhost:8000/user/history?npm=${npm}&top_n=30`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.books || []);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (userType === 'cold' && initialColdRecs && topK === 10) {
      setRecs(initialColdRecs);
      setLoadingRecs(false);
    } else if (npm) {
      fetchRecs(topK);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npm, topK]);

  useEffect(() => {
    if (activeTab === 'riwayat' && history.length === 0 && npm && userType === 'warm') {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleProfileSave = (e) => {
    e.preventDefault();
    setUserInfo({
      ...userInfo,
      nama: editNama,
      fakultas: editFak,
      jurusan: editJur,
      jenjang: editJenjang
    });
    setIsEditing(false);
  };

  return (
    <div>
      {/* Profile Section */}
      <div className="mb-8">
        {userType === 'cold' && isEditing ? (
          <form onSubmit={handleProfileSave} className="bg-gray-50 p-6 rounded-xl border border-gray-200 max-w-2xl">
            <h3 className="font-bold mb-4">Edit Profil</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input value={editNama} onChange={e=>setEditNama(e.target.value)} placeholder="Nama" className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
              <input value={editJenjang} onChange={e=>setEditJenjang(e.target.value)} placeholder="Jenjang (Contoh: S1, S2, D3)" className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
              <input value={editFak} onChange={e=>setEditFak(e.target.value)} placeholder="Fakultas" className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
              <input value={editJur} onChange={e=>setEditJur(e.target.value)} placeholder="Jurusan" className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold">Simpan</button>
              <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold">Batal</button>
            </div>
          </form>
        ) : (
          <div className="flex justify-between items-start">
            <UserProfile npm={npm} userInfo={userInfo} />
            {userType === 'cold' && (
              <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50">
                Edit Profil
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Tabs */}
      <div className="flex gap-8 border-b border-gray-200 mb-8">
        <button 
          onClick={() => setActiveTab('rekomendasi')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'rekomendasi' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Rekomendasi Anda
        </button>
        <button 
          onClick={() => setActiveTab('riwayat')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'riwayat' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Riwayat Peminjaman
        </button>
      </div>

      {activeTab === 'rekomendasi' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                ${userType === 'warm' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                {userType} Start
              </span>
              {userType === 'cold' && recs.source && (
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                  ${recs.source === 'cold_faiss' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                  {recs.source === 'cold_faiss' ? 'Similarity Based' : 'Demographic Based'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 uppercase">Jumlah</label>
              <input 
                type="number" 
                value={topK} 
                onChange={(e) => setTopK(Number(e.target.value))} 
                step={5} min={5} max={30}
                className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-black"
              />
            </div>
          </div>
          
          {userType === 'cold' && userInfo?.chosen_books && userInfo.chosen_books.length > 0 && (
            <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <h4 className="text-sm font-bold mb-3 text-gray-700">Buku yang Anda Pilih:</h4>
              <div className="flex flex-wrap gap-2">
                {userInfo.chosen_books.map((b, i) => (
                  <button 
                    key={i}
                    onClick={() => onBookSelect(b)}
                    className="text-left bg-white border border-gray-200 px-3 py-2 rounded-lg hover:border-black transition-colors max-w-xs"
                  >
                    <p className="text-xs font-semibold text-gray-900 line-clamp-1">{b.judul_buku}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-1">{b.penulis}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {loadingRecs ? (
            <div className="text-center py-12 text-gray-400">Memuat rekomendasi...</div>
          ) : (
            <RecommendationGrid 
              books={recs.books} 
              serendipityScore={recs.user_serendipity_score} 
              onBookSelect={onBookSelect}
            />
          )}
        </div>
      )}

      {activeTab === 'riwayat' && (
        <div>
          {userType === 'cold' ? (
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500">
              Riwayat peminjaman tidak tersedia untuk pengguna baru.
            </div>
          ) : (
            <>
              {loadingHistory ? (
                <div className="text-center py-12 text-gray-400">Memuat riwayat...</div>
              ) : (
                <RecommendationGrid 
                  books={history} 
                  onBookSelect={onBookSelect}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
