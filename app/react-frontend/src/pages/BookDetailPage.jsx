import React, { useEffect } from 'react';

export default function BookDetailPage({ book, onBack }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-gray-500 mb-4 font-medium">Detail buku tidak tersedia.</p>
        <button onClick={onBack} className="text-sm font-bold text-gray-900 hover:text-gray-600 transition-colors">
          ← Kembali
        </button>
      </div>
    );
  }

  const {
    image_url,
    judul_buku,
    penulis,
    deskripsi,
    kategori,
    bahasa,
    tahun_terbit
  } = book;

  const tahun_str = tahun_terbit && !isNaN(parseInt(tahun_terbit)) ? parseInt(tahun_terbit) : null;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="group flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-10 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        Kembali
      </button>

      {/* Main Content Area */}
      <div className="flex flex-col md:flex-row gap-10 md:gap-14">
        
        {/* Left: Book Cover */}
        <div className="w-full md:w-1/3 shrink-0">
          <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-gray-50 border border-gray-200/60 shadow-sm relative">
            {image_url ? (
              <img 
                src={image_url} 
                alt={judul_buku} 
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                </svg>
              </div>
            )}
            {/* Subtle inner shadow for depth */}
            <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-2xl pointer-events-none"></div>
          </div>
        </div>

        {/* Right: Book Details */}
        <div className="flex-grow pt-2">
          
          {/* Tags / Metadata */}
          <div className="flex flex-wrap gap-2 mb-4">
            {kategori && kategori !== "—" && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold uppercase tracking-wider rounded-md">
                {kategori}
              </span>
            )}
            {tahun_str && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold uppercase tracking-wider rounded-md">
                {tahun_str}
              </span>
            )}
            {bahasa && bahasa !== "—" && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold uppercase tracking-wider rounded-md">
                {bahasa}
              </span>
            )}
          </div>

          {/* Title & Author */}
          <h1 className="text-3xl md:text-[34px] font-extrabold text-gray-900 tracking-tight leading-[1.2] mb-2">
            {judul_buku || "Judul Tidak Tersedia"}
          </h1>
          <p className="text-lg font-medium text-gray-500 mb-8">
            {penulis || "Penulis tidak diketahui"}
          </p>

          <hr className="border-gray-100 mb-8" />

          {/* Description */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Sinopsis / Deskripsi
            </h3>
            <p className="text-gray-700 text-[15px] leading-relaxed whitespace-pre-wrap">
              {deskripsi && deskripsi.length > 5 && deskripsi !== "—" 
                ? deskripsi 
                : <span className="italic text-gray-400">Deskripsi tidak tersedia untuk buku ini.</span>}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
