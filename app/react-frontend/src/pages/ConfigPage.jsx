import React, { useState, useEffect, useCallback } from 'react';

// Maps FAISS index names → model names used in the evaluation CSV
const FAISS_TO_EVAL_MODEL = {
  word2vec:   'w2v',
  bert_multi: 'bert',
  bge_m3:     'bge',
  e5_large:   'e5',
};

function faissToEvalModel(faissName) {
  return FAISS_TO_EVAL_MODEL[faissName] || faissName;
}

const SOG_DISPLAY = {
  "Weight 1 — Relevance   (0.7, 0.1, 0.1, 0.1)": [0.7, 0.1, 0.1, 0.1],
  "Weight 2 — Balanced    (0.4, 0.2, 0.2, 0.2)": [0.4, 0.2, 0.2, 0.2],
  "Weight 3 — Serendipity (0.1, 0.2, 0.4, 0.3)": [0.1, 0.2, 0.4, 0.3],
  "Weight 4 — Diversity   (0.1, 0.3, 0.3, 0.3)": [0.1, 0.3, 0.3, 0.3],
  "None (Disable SOG)": []
};

function getLabelForWeights(w) {
  if (!w || w.length === 0) return 'None (Disable SOG)';
  const matched = Object.keys(SOG_DISPLAY).find(
    key => JSON.stringify(SOG_DISPLAY[key]) === JSON.stringify(w)
  );
  return matched || 'Custom';
}

function getWeightProfile(label) {
  if (label.includes('Weight 1')) return 'weight_1';
  if (label.includes('Weight 2')) return 'weight_2';
  if (label.includes('Weight 3')) return 'weight_3';
  if (label.includes('Weight 4')) return 'weight_4';
  if (label === 'Custom') return 'custom';
  return 'None';
}

// ── Spinner component ─────────────────────────────────────────────────────────
function Spinner({ size = 20, color = '#6366f1' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `3px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      verticalAlign: 'middle',
    }} />
  );
}

// ── Calculation Progress UI ───────────────────────────────────────────────────
function CalcProgress({ step, total, kValues }) {
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;
  return (
    <div style={{
      background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
      border: '1px solid #4338ca',
      borderRadius: 16, padding: '28px 32px',
      color: '#e0e7ff', textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>⚙️</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
        Menghitung Evaluasi Custom Weight…
      </div>
      <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 20 }}>
        Evaluasi sedang berjalan pada {total} nilai k. Harap tunggu.
      </div>

      {/* Progress bar */}
      <div style={{ background: '#3730a3', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: 'linear-gradient(90deg,#818cf8,#6366f1)',
          width: `${pct}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ fontSize: 12, color: '#c7d2fe', marginBottom: 18 }}>
        {pct}% selesai
      </div>

      {/* k chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {kValues.map((k, i) => (
          <span key={k} style={{
            padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
            background: i < step ? '#4f46e5' : '#1e1b4b',
            color: i < step ? '#e0e7ff' : '#6366f1',
            border: `1px solid ${i < step ? '#6366f1' : '#312e81'}`,
            transition: 'all 0.3s',
          }}>
            k={k} {i < step ? '✓' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Metric badge ──────────────────────────────────────────────────────────────
function MetricBadge({ value, label }) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  const display = isNaN(num) ? '—' : num.toFixed(4);
  return (
    <div style={{ textAlign: 'center', padding: '6px 10px' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{display}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ConfigPage() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedWeightLabel, setSelectedWeightLabel] = useState('None (Disable SOG)');
  const [selectedFaiss, setSelectedFaiss] = useState('qwen');
  const [saving, setSaving] = useState(false);
  const [customWeights, setCustomWeights] = useState([0.25, 0.25, 0.25, 0.25]);

  // Eval state
  const [evalMetrics, setEvalMetrics] = useState([]);
  const [evalModels, setEvalModels] = useState([]);
  const [kValues, setKValues] = useState([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 30]);
  const [evalModel, setEvalModel] = useState('');
  const [evalTab, setEvalTab] = useState('all');

  // Custom calc state
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [customResults, setCustomResults] = useState(null);
  const [calcError, setCalcError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, healthRes, configRes, evalRes, modelsRes] = await Promise.all([
          fetch('http://localhost:8000/stats').catch(() => null),
          fetch('http://localhost:8000/health').catch(() => null),
          fetch('http://localhost:8000/config').catch(() => null),
          fetch('http://localhost:8000/eval-metrics').catch(() => null),
          fetch('http://localhost:8000/eval-metrics/models').catch(() => null),
        ]);

        if (statsRes?.ok) setStats(await statsRes.json());
        if (healthRes?.ok) setHealth(await healthRes.json());
        let activeFaiss = 'qwen';
        if (configRes?.ok) {
          const cfg = await configRes.json();
          activeFaiss = cfg.faiss_model || 'qwen';
          setSelectedFaiss(activeFaiss);
          const label = getLabelForWeights(cfg.sog_weights);
          setSelectedWeightLabel(label);
        }
        if (evalRes?.ok) {
          setEvalMetrics(await evalRes.json());
        }
        if (modelsRes?.ok) {
          const d = await modelsRes.json();
          setEvalModels(d.models || []);
          if (d.k_values) setKValues(d.k_values.sort((a, b) => a - b));
          // Map FAISS name → eval CSV model name, then fall back to first in list
          const models = d.models || [];
          const mapped = faissToEvalModel(activeFaiss);
          setEvalModel(models.includes(mapped) ? mapped : (models[0] || ''));
        }
      } catch (err) {
        console.error('Failed to load config data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Get rows for the chosen model + weight + user_type across all k ──────
  const evalRows = useCallback(() => {
    if (selectedWeightLabel === 'Custom') {
      // use customResults if available
      if (!customResults) return [];
      return customResults.filter(r => r.User_Type === evalTab);
    }
    const wp = getWeightProfile(selectedWeightLabel);
    return evalMetrics.filter(r =>
      r.Model === evalModel &&
      r.User_Type === evalTab &&
      (wp === 'None'
        ? (!r.Weight_Profile || r.Weight_Profile === 'None' || r.Weight_Profile === null)
        : r.Weight_Profile === wp)
    ).sort((a, b) => a.k - b.k);
  }, [evalMetrics, evalModel, evalTab, selectedWeightLabel, customResults]);

  // ── Custom weight calculation ─────────────────────────────────────────────
  const handleCalculateCustom = async () => {
    const sum = customWeights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.05) {
      setCalcError(`Bobot harus berjumlah 1.0 (sekarang: ${sum.toFixed(2)})`);
      return;
    }
    setCalcError(null);
    setCalcLoading(true);
    setCalcProgress(0);
    setCustomResults(null);

    try {
      const res = await fetch('http://localhost:8000/eval-metrics/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: evalModel,
          weights: customWeights,
          user_type: evalTab,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Kalkulasi gagal' }));
        setCalcError(err.detail || 'Kalkulasi gagal');
        setCalcLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.progress !== undefined) {
               const progressIndex = kValues.indexOf(data.progress);
               if (progressIndex !== -1) setCalcProgress(progressIndex + 1);
            }
            if (data.done) {
               setCustomResults(data.results || []);
               setCalcProgress(kValues.length);
            }
          } catch (e) {
            console.error('Error parsing JSON chunk:', e);
          }
        }
      }
    } catch (e) {
      setCalcError('Gagal menghubungi backend: ' + e.message);
    } finally {
      setCalcLoading(false);
    }
  };

  const handleCustomWeightChange = (index, value) => {
    const nw = [...customWeights];
    nw[index] = parseFloat(value) || 0;
    setCustomWeights(nw);
    setCustomResults(null); // invalidate previous results
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const sogToSave = selectedWeightLabel === 'Custom'
        ? customWeights
        : SOG_DISPLAY[selectedWeightLabel];

      const res = await fetch('http://localhost:8000/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sog_weights: sogToSave, faiss_model: selectedFaiss }),
      });
      if (res.ok) alert('Konfigurasi berhasil disimpan.');
      else alert('Gagal menyimpan konfigurasi.');
    } catch (err) {
      alert('Error menghubungi backend.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
        <Spinner size={28} color="#6366f1" />
        <div style={{ marginTop: 12 }}>Memuat statistik &amp; konfigurasi…</div>
      </div>
    );
  }

  const rows = evalRows();
  const isCustom = selectedWeightLabel === 'Custom';
  const weightSum = customWeights.reduce((a, b) => a + b, 0);
  const weightSumOk = Math.abs(weightSum - 1.0) <= 0.05;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .eval-row:hover { background: #f9fafb; }
        .tab-btn { border: none; background: none; cursor: pointer; padding: '6px 14px'; }
      `}</style>

      {/* ── System Health ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#f9fafb', border: '1px solid #e5e7eb',
        borderRadius: 14, marginBottom: 28,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Status Sistem</span>
        {health?.loaded
          ? <span style={{ padding: '4px 12px', background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, borderRadius: 99, border: '1px solid #86efac' }}>✓ Semua Model Aktif</span>
          : <span style={{ padding: '4px 12px', background: '#fee2e2', color: '#b91c1c', fontSize: 11, fontWeight: 700, borderRadius: 99, border: '1px solid #fca5a5' }}>✗ Memuat / Gagal</span>
        }
      </div>

      {/* ── Stats Cards ── */}
      {stats && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, color: '#111827' }}>Statistik Sistem</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              ['Total Buku', stats.total_books],
              ['Total Pengguna', stats.total_users],
              ['Transaksi', stats.total_transactions],
              ['Warm Users', stats.warm_users],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#111827' }}>{val?.toLocaleString() || 0}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Config Form ── */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, color: '#111827', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>⚙️ Konfigurasi Model</h2>
        <form onSubmit={handleSave} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Skenario SOG (Serendipity-Oriented Graph)</label>
            <select
              value={selectedWeightLabel}
              onChange={e => setSelectedWeightLabel(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14 }}
            >
              {Object.keys(SOG_DISPLAY).map(label => <option key={label} value={label}>{label}</option>)}
              <option value="Custom">Custom SOG Weight</option>
            </select>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Bobot berurutan: (Relevance, Diversity, Dissimilarity, Unpopularity)</p>
          </div>

          {selectedWeightLabel === 'Custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, background: '#f9fafb', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 20 }}>
              {['Relevance', 'Diversity', 'Dissimilarity', 'Unpopularity'].map((lbl, i) => (
                <div key={lbl}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>{lbl}</label>
                  <input
                    type="number" step="0.01" min="0" max="1"
                    value={customWeights[i]}
                    onChange={e => handleCustomWeightChange(i, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: weightSumOk ? '#15803d' : '#b91c1c', fontWeight: 600, marginTop: 4 }}>
                Jumlah bobot: {weightSum.toFixed(2)} {weightSumOk ? '✓' : '(harus = 1.0)'}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Model Embedding Aktif (FAISS)</label>
            <select
              value={selectedFaiss}
              onChange={e => {setSelectedFaiss(e.target.value);
                              setEvalModel(e.target.value)}}
              style={{ width: '100%', padding: '12px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14 }}
            >
              {stats?.faiss_models?.map(m => <option key={m} value={m}>{m}</option>) || <option value="qwen">qwen</option>}
            </select>
          </div>

          <button
            type="submit" disabled={saving}
            style={{ width: '100%', padding: '12px 0', background: '#111827', color: '#fff', fontWeight: 700, borderRadius: 12, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1, fontSize: 15 }}
          >
            {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
          </button>
        </form>
      </div>

      {/* ── Evaluation Section ── */}
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, color: '#111827', borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>📈 Hasil Evaluasi Model</h2>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', margin: '16px 0' }}>
          {/* Model picker */}
          <div style={{ flex: '1', minWidth: 140 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>MODEL</label>
            <select
              value={evalModel}
              onChange={e => setEvalModel(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13 }}
            >
              {evalModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Weight info box */}
          <div style={{ flex: '2', minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 2 }}>WEIGHT / SKENARIO</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 14px'}}>
              {selectedWeightLabel === 'Custom'
                ? `Custom (${customWeights.map(w => w.toFixed(2)).join(', ')})`
                : selectedWeightLabel}
            </div>
          </div>

          {/* User type tabs */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
            {[['all', '📊 All'], ['warm', '🔥 Warm'], ['cold', '❄️ Cold']].map(([val, lbl]) => (
              <button
                key={val} onClick={() => setEvalTab(val)}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: evalTab === val ? '#fff' : 'transparent',
                  color: evalTab === val ? '#111827' : '#9ca3af',
                  boxShadow: evalTab === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s',
                }}
              >{lbl}</button>
            ))}
          </div>
        </div>

        {/* Custom results recalc button */}
        {isCustom && !calcLoading && customResults && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button
              onClick={handleCalculateCustom}
              style={{ padding: '6px 14px', background: '#ede9fe', color: '#5b21b6', fontWeight: 700, fontSize: 12, borderRadius: 8, border: '1px solid #c4b5fd', cursor: 'pointer' }}
            >
              🔄 Hitung Ulang
            </button>
          </div>
        )}

        {/* Calc loading UI */}
        {calcLoading && (
          <div style={{ marginBottom: 20 }}>
            <CalcProgress step={calcProgress} total={kValues.length} kValues={kValues} />
          </div>
        )}

        {/* Eval table */}
        {!calcLoading && (
          <>
            {rows.length > 0 ? (
              <div style={{
                background: '#fff', border: '1px solid #f3f4f6', borderRadius: 16,
                overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                animation: 'fadeSlideIn 0.35s ease',
              }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
                  background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
                  padding: '10px 20px',
                }}>
                  {['k', 'HitRate', 'NDCG', 'unSerendipity'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                  ))}
                </div>

                {/* Rows */}
                {rows.map((row, i) => (
                  <div
                    key={row.k ?? i}
                    className="eval-row"
                    style={{
                      display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
                      padding: '12px 20px', borderBottom: i < rows.length - 1 ? '1px solid #f9fafb' : 'none',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#4f46e5' }}>@{row.k}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      {typeof row.HitRate === 'number' ? row.HitRate.toFixed(4) : '—'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      {typeof row.NDCG === 'number' ? row.NDCG.toFixed(4) : '—'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      {typeof row.unSerendipity === 'number' ? row.unSerendipity.toFixed(4) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 14,
                padding: '40px 20px', textAlign: 'center', color: '#9ca3af',
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
                {isCustom
                  ? <p style={{ fontSize: 14 }}>Data evaluasi tidak tersedia karena menggunakan konfigurasi bobot custom (SOG).</p>
                  : <p style={{ fontSize: 14 }}>Tidak ada data evaluasi untuk kombinasi ini.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
