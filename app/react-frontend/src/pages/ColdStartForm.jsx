import React, { useState, useEffect } from 'react';

export default function ColdStartForm({ npm, onComplete }) {
  const [nama, setNama] = useState('');
  const [fakultas, setFakultas] = useState('');
  const [jurusan, setJurusan] = useState('');
  const [jenjang, setJenjang] = useState('');
  
  const [facultiesList, setFacultiesList] = useState([]);
  const [jurusanList, setJurusanList] = useState([]);
  const [clusters, setClusters] = useState({});
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchFormData = async () => {
      try {
        const [facRes, jurRes, clusterRes] = await Promise.all([
          fetch('http://localhost:8000/faculties').catch(() => null),
          fetch('http://localhost:8000/jurusan').catch(() => null),
          fetch('http://localhost:8000/books/clusters').catch(() => null)
        ]);
        
        if (facRes && facRes.ok) {
          const facData = await facRes.json();
          setFacultiesList(facData.faculties || []);
        }
        if (jurRes && jurRes.ok) {
          const jurData = await jurRes.json();
          setJurusanList(jurData.jurusan || []);
        }
        if (clusterRes && clusterRes.ok) {
          const clusterData = await clusterRes.json();
          setClusters(clusterData || {});
        }
      } catch (err) {
        console.error("Failed to load initial cold form data", err);
      } finally {
        setLoadingInitial(false);
      }
    };
    
    fetchFormData();
  }, []);

  const toggleBookSelection = (bookId) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(bookId)) {
      newSelected.delete(bookId);
    } else {
      newSelected.add(bookId);
    }
    setSelectedBooks(newSelected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const payload = {
        fakultas: fakultas || null,
        jurusan: jurusan || null,
        liked_book_ids: Array.from(selectedBooks),
        top_k: 10
      };
      
      const res = await fetch('http://localhost:8000/recommend/cold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        
        const chosenBooks = [];
        for (const bookList of Object.values(clusters)) {
          for (const b of bookList) {
            if (selectedBooks.has(b.book_id) && !chosenBooks.find(cb => cb.book_id === b.book_id)) {
              chosenBooks.push(b);
            }
          }
        }
        
        onComplete({
          nama: nama || 'Pengguna Baru',
          fakultas,
          jurusan,
          jenjang,
          role: 'mahasiswa',
          chosen_books: chosenBooks
        }, data);
      } else {
        alert("Gagal mendapatkan rekomendasi.");
      }
    } catch (err) {
      console.error("Submit error", err);
      alert("Error menghubungi backend.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return <div className="text-center py-12 text-gray-400">Memuat form profil...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 max-w-2xl">
        <span className="inline-block px-3 py-1 mb-3 text-xs font-bold text-blue-800 bg-blue-100 rounded-full">Pengguna Baru</span>
        <h2 className="text-2xl font-bold mb-2">Lengkapi Profil Anda</h2>
        <p className="text-gray-500">Kami membutuhkan sedikit informasi untuk memberikan rekomendasi terbaik.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-6 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Nama Lengkap</label>
              <input 
                type="text" 
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Nama Anda"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Jenjang (opsional)</label>
              <input 
                type="text" 
                value={jenjang || ''}
                onChange={(e) => setJenjang(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="S1, S2, D3, dll."
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Fakultas</label>
              <select 
                value={fakultas}
                onChange={(e) => setFakultas(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black bg-white"
              >
                <option value="">— Pilih Fakultas —</option>
                {facultiesList.map((f, i) => (
                  <option key={i} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Jurusan</label>
              <select 
                value={jurusan}
                onChange={(e) => setJurusan(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black bg-white"
              >
                <option value="">— Pilih Jurusan —</option>
                {jurusanList.map((j, i) => (
                  <option key={i} value={j}>{j}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />
        
        <div>
          <h3 className="text-xl font-bold mb-1">Pilih Buku yang Anda Sukai (opsional)</h3>
          <p className="text-sm text-gray-500 mb-6">Pilih beberapa buku dari kategori di bawah untuk membantu sistem merekomendasikan buku yang mirip dengan minat Anda.</p>
          
          <div className="space-y-10">
            {Object.entries(clusters).map(([clusterName, books]) => (
              <div key={clusterName}>
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">{clusterName}</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {books.map((book) => {
                    const isSelected = selectedBooks.has(book.book_id);
                    return (
                      <div 
                        key={book.book_id}
                        onClick={() => toggleBookSelection(book.book_id)}
                        className={`relative cursor-pointer group flex flex-col bg-white border rounded-xl overflow-hidden transition-all duration-200
                          ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-100 hover:border-gray-300'}
                        `}
                      >
                        <div className="relative aspect-[2/3] w-full bg-gray-50 overflow-hidden">
                          {book.image_url ? (
                            <img 
                              src={book.image_url} 
                              alt={book.judul_buku} 
                              className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? '' : 'group-hover:scale-105'}`}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full text-2xl text-gray-300">
                              📔
                            </div>
                          )}
                          
                          {/* Selection Checkbox Overlay */}
                          <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                            ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-300 backdrop-blur-sm group-hover:border-blue-400'}`}>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="p-3">
                          <h5 className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1" title={book.judul_buku}>
                            {book.judul_buku || "—"}
                          </h5>
                          <p className="text-[10px] text-gray-500 line-clamp-1">
                            {book.penulis || "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 max-w-2xl">
          <button 
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 text-lg shadow-xl shadow-black/10"
          >
            {submitting ? 'Mencari rekomendasi terbaik...' : 'Dapatkan Rekomendasi'}
          </button>
        </div>
      </form>
    </div>
  );
}
