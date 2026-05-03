import React from 'react';

export default function UserProfile({ npm, userInfo }) {
  const profileItems = [
    { label: "Nama Lengkap", value: userInfo?.nama || "—" },
    { label: "NPM", value: npm },
    { label: "Fakultas", value: userInfo?.fakultas || "—" },
    { label: "Jurusan", value: userInfo?.jurusan || "—" },
    { label: "Role", value: userInfo?.role ? userInfo.role.charAt(0).toUpperCase() + userInfo.role.slice(1) : "—" },
    { label: "Jenjang", value: userInfo?.jenjang || "—" },
  ];

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Profil Pengguna</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
        {profileItems.map((item, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              {item.label}
            </span>
            <span className="text-sm font-medium text-gray-900">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
