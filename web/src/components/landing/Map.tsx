export default function MapPlaceholder() {
  return (
    <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 w-full max-w-sm">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white">
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
        </div>
        <span className="text-xs font-bold text-gray-800">TrashVision</span>
        <div className="ml-auto text-[10px] text-gray-400">As of 21:32 04/15/26</div>
      </div>

      {/* Map area */}
      <div className="relative h-48 bg-gradient-to-br from-cyan-50 to-blue-100 overflow-hidden">
        {/* Simulated coastline SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 192" preserveAspectRatio="xMidYMid slice">
          {/* Water */}
          <rect width="320" height="192" fill="#bfdbfe" />
          {/* Land mass */}
          <path d="M160 0 L200 20 L220 60 L210 100 L230 140 L200 192 L140 192 L130 150 L150 100 L140 60 L160 0Z"
            fill="#d1fae5" stroke="#86efac" strokeWidth="1" />
          {/* Roads */}
          <path d="M160 10 L165 192" stroke="#94a3b8" strokeWidth="1.5" opacity="0.5" fill="none"/>
          <path d="M140 80 L220 80" stroke="#94a3b8" strokeWidth="1" opacity="0.5" fill="none"/>
          <path d="M135 120 L210 130" stroke="#94a3b8" strokeWidth="1" opacity="0.5" fill="none"/>
          {/* Heatmap blobs */}
          <ellipse cx="195" cy="90" rx="30" ry="20" fill="rgba(239,68,68,0.5)" />
          <ellipse cx="185" cy="115" rx="25" ry="15" fill="rgba(249,115,22,0.5)" />
          <ellipse cx="175" cy="75" rx="15" ry="10" fill="rgba(234,179,8,0.4)" />
          <ellipse cx="205" cy="140" rx="20" ry="12" fill="rgba(239,68,68,0.35)" />
          {/* Markers */}
          <circle cx="185" cy="90" r="4" fill="#dc2626" stroke="white" strokeWidth="1.5"/>
          <circle cx="175" cy="125" r="3" fill="#ea580c" stroke="white" strokeWidth="1.5"/>
          <circle cx="200" cy="60" r="3" fill="#ca8a04" stroke="white" strokeWidth="1.5"/>
        </svg>

        {/* Legend overlay */}
        <div className="absolute bottom-2 right-2 bg-white/80 rounded-lg px-2 py-1 text-[9px] text-gray-600 space-y-0.5 backdrop-blur-sm">
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/><span>High</span></div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"/><span>Medium</span></div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/><span>Low</span></div>
        </div>
      </div>
    </div>
  );
}