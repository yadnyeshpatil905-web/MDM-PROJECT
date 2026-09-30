import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, Send, Check, Copy } from 'lucide-react';

export default function SerialConsole({
  serialLogs = [],
  isConnected = false,
  onClear = () => {},
  onSendCommand = () => {}
}) {
  const terminalEndRef = useRef(null);
  const [inputVal, setInputVal] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLogs]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    onSendCommand(inputVal);
    setInputVal('');
  };

  const handleCopyLogs = () => {
    const text = serialLogs.map(l => `[${l.time}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pro-card p-4 border border-zinc-800 bg-[#101014] flex flex-col h-64">
      
      {/* Console Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
        <div className="flex items-center space-x-2">
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-mono text-xs font-semibold text-zinc-200">
            Serial Monitor (9600 Baud)
          </span>
          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
            isConnected ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
          }`}>
            {isConnected ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleCopyLogs}
            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs border border-zinc-800"
            title="Copy logs"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={onClear}
            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs border border-zinc-800"
            title="Clear logs"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Terminal Stream Body */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] p-2.5 space-y-1 bg-[#09090b] rounded mt-2 border border-zinc-800/60">
        {serialLogs.length > 0 ? (
          serialLogs.map((log, idx) => {
            const isGranted = log.text.includes('ACCESS GRANTED') || log.text.includes('SUCCESS');
            const isDenied = log.text.includes('DENIED') || log.text.includes('NO MATCH');
            
            return (
              <div key={idx} className="flex items-start space-x-2 leading-relaxed">
                <span className="text-zinc-600 text-[10px] select-none shrink-0">{log.time}</span>
                <span className={`break-all ${
                  isGranted ? 'text-emerald-400 font-semibold' :
                  isDenied ? 'text-rose-400' :
                  'text-zinc-300'
                }`}>
                  {log.text}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-zinc-600 italic py-6 text-center text-xs">
            {isConnected ? 'Waiting for finger on sensor...' : 'Connect Arduino UNO via USB.'}
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Input Bar */}
      <form onSubmit={handleSend} className="flex items-center space-x-2 mt-2">
        <input
          type="text"
          placeholder={isConnected ? "Send serial command (e.g. START, RESET)..." : "Connect Arduino to send commands"}
          disabled={!isConnected}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          className="flex-1 bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputVal.trim()}
          className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-mono text-xs border border-zinc-700 flex items-center space-x-1"
        >
          <Send className="w-3 h-3" />
          <span>Send</span>
        </button>
      </form>

    </div>
  );
}
