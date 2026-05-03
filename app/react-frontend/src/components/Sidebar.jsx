import React from 'react';

export default function Sidebar({ currentPage, setCurrentPage, npm, handleLogout }) {
  const navItems = [
    { id: 'landing', label: '🏠 Beranda' },
    { id: 'search', label: '🔍 Pencarian Semantik' },
    { id: 'config', label: '⚙️ Konfigurasi' },
  ];

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">Sistem Rekomendasi</h1>
        <h1 className="text-2xl font-black tracking-tight text-gray-900">Buku Serendipity</h1>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1">Perpustakaan UPNVJT</p>
      </div>
      
      <div className="flex flex-col flex-grow p-4 gap-2">
        {navItems.map(item => {
          // If we are logged in, clicking Beranda should go to dashboard if we have data, 
          // but for simplicity we can just map Beranda to dashboard if npm is set, else landing.
          let targetPage = item.id;
          if (item.id === 'landing' && npm && currentPage !== 'cold_form') {
            targetPage = 'dashboard';
          }

          const isActive = currentPage === targetPage || (item.id === 'landing' && currentPage === 'cold_form');
          
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(targetPage)}
              className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all
                ${isActive 
                  ? 'bg-white shadow-sm border border-gray-200 text-black' 
                  : 'text-gray-600 hover:bg-gray-100 hover:text-black border border-transparent'
                }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {npm && (
        <div className="p-4 border-t border-gray-200">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                👤
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase">NPM</span>
                <span className="text-sm font-bold text-gray-900">{npm}</span>
              </div>
            </div>
            
            <button
              onClick={() => setCurrentPage('dashboard')}
              className="w-full text-center text-xs font-semibold bg-gray-50 hover:bg-gray-100 py-2 rounded-lg transition-colors border border-gray-200"
            >
              Dashboard
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-center text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 py-2 rounded-lg transition-colors border border-red-100"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
