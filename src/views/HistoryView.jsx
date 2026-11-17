import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { api } from '../services/api';

export default function HistoryView({ logs: propLogs = [] }) {
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState(propLogs);
  const [loading, setLoading] = useState(false);

  const fetchHistoryLogs = async () => {
    try {
      setLoading(true);
      const res = await api.getHistory();
      if (res && res.logs) {
        setLogs(res.logs);
      }
    } catch (err) {
      console.warn('Could not fetch backend history:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryLogs();
    const interval = setInterval(fetchHistoryLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Merge any real-time prop logs if provided
  useEffect(() => {
    if (propLogs.length > 0) {
      setLogs(prev => {
        const ids = new Set(prev.map(p => p.id));
        const newOnes = propLogs.filter(p => !ids.has(p.id));
        return [...newOnes, ...prev];
      });
    }
  }, [propLogs]);

  const filteredLogs = logs.filter(log => {
    const matchesFilter = 
      filter === 'ALL' ? true :
      filter === 'GRANTED' ? (log.result === 'success' || log.result === 'GRANTED') :
      filter === 'DENIED' ? (log.result === 'denied' || log.result === 'failure' || log.result === 'lockout' || log.result === 'DENIED' || log.result === 'LOCKED_OUT') : true;

    const matchesSearch = 
      (log.userId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.reason || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.id || '').toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const exportCSV = () => {
    const header = "Log ID,Timestamp,User ID,Biometric Result,PIN Result,Final Result,Reason,Device\n";
    const rows = filteredLogs.map(l => 
      `"${l.id}","${l.timestamp}","${l.userId}","${l.biometricResult || '--'}","${l.pinResult || '--'}","${l.result}","${l.reason}","${l.device || 'ARDUINO-UNO'}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ppg-vault-audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Header and Controls */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">
              Authentication Audit & Vault History
            </h2>
          </div>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            Append-only audit trail: Step 1 Biometrics + Step 2 PIN Outcomes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Refresh Button */}
          <button
            onClick={fetchHistoryLogs}
            disabled={loading}
            className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Filters */}
          <div className="flex items-center bg-[#0a0a0c] p-0.5 rounded border border-zinc-800 font-mono text-xs">
            {['ALL', 'GRANTED', 'DENIED'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === f 
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0a0a0c] border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs font-mono text-white focus:outline-none focus:border-zinc-600 w-44"
            />
          </div>

          {/* Export CSV button */}
          <button
            onClick={exportCSV}
            className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-mono text-xs flex items-center space-x-1"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* History Table */}
      <div className="pro-card border border-zinc-800 bg-[#101014] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#0a0a0c] border-b border-zinc-800 text-zinc-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User Identity</th>
                <th className="px-4 py-3">Biometric</th>
                <th className="px-4 py-3">Vault PIN</th>
                <th className="px-4 py-3">Final Decision</th>
                <th className="px-4 py-3">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                      {new Date(row.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white max-w-xs truncate">
                      {row.userId}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                        row.biometricResult === 'success' || row.biometricResult === 'SUCCESS' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' :
                        row.biometricResult === 'failure' || row.biometricResult === 'FAILED' ? 'bg-rose-950/60 text-rose-300 border-rose-800' :
                        'bg-zinc-900 text-zinc-400 border-zinc-800'
                      }`}>
                        {row.biometricResult || '--'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                        row.pinResult === 'success' || row.pinResult === 'SUCCESS' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' :
                        row.pinResult === 'failure' || row.pinResult === 'FAILED' ? 'bg-rose-950/60 text-rose-300 border-rose-800' :
                        row.pinResult === 'lockout' || row.pinResult === 'LOCKED_OUT' ? 'bg-amber-950/60 text-amber-300 border-amber-800' :
                        'bg-zinc-900 text-zinc-400 border-zinc-800'
                      }`}>
                        {row.pinResult || '--'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        row.result === 'success' || row.result === 'GRANTED'
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                          : row.result === 'lockout' || row.result === 'LOCKED_OUT'
                          ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                          : 'bg-rose-950/60 text-rose-300 border-rose-800'
                      }`}>
                        {row.result === 'success' || row.result === 'GRANTED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>GRANTED</span>
                          </>
                        ) : row.result === 'lockout' || row.result === 'LOCKED_OUT' ? (
                          <>
                            <ShieldAlert className="w-3 h-3 text-amber-400" />
                            <span>LOCKED OUT</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-rose-400" />
                            <span>DENIED</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-sm truncate">
                      {row.reason}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-600 font-mono text-xs">
                    No authentication audit records found matching query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
