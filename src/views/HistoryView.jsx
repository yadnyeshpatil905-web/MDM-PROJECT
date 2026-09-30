import React, { useState } from 'react';
import { 
  History, 
  Search, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock 
} from 'lucide-react';

export default function HistoryView({ logs = [] }) {
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = logs.filter(log => {
    const matchesFilter = 
      filter === 'ALL' ? true :
      filter === 'GRANTED' ? log.result === 'GRANTED' :
      filter === 'DENIED' ? log.result === 'DENIED' : true;

    const matchesSearch = 
      (log.userId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.reason || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.id || '').toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const exportCSV = () => {
    const header = "Log ID,Timestamp,User ID,BPM,Beat Count,Match Score,Result,Reason,Device\n";
    const rows = filteredLogs.map(l => 
      `"${l.id}","${l.timestamp}","${l.userId}",${l.bpm},${l.beats},${l.score}%,"${l.result}","${l.reason}","${l.device}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ppg-auth-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Header and Controls */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-bold text-white">
              Authentication Audit History
            </h2>
          </div>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            Log of all biometric validation and unlock attempts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* History Table */}
      <div className="pro-card border border-zinc-800 bg-[#101014] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#0a0a0c] border-b border-zinc-800 text-zinc-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">BPM</th>
                <th className="px-4 py-3">Beats</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 text-zinc-400">
                      {row.timestamp}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {row.userId}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {row.bpm > 0 ? `${row.bpm} BPM` : '--'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {row.beats}
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-200">
                      {row.score}%
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        row.result === 'GRANTED'
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                          : 'bg-rose-950/60 text-rose-300 border-rose-800'
                      }`}>
                        {row.result === 'GRANTED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>GRANTED</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-rose-400" />
                            <span>DENIED</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                      {row.reason}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-600 font-mono text-xs">
                    No authentication records logged yet. Connect Arduino and place finger on sensor to log attempts.
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
