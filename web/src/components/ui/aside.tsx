import { X, Shield, AlertTriangle, CheckCircle, Search } from "lucide-react";

export const SectorDrawer = ({ isOpen, onClose, selectedSector, areaStatus, onItemSelect }: any) => {
  return (
    <aside
      className={`w-96 bg-white border-l border-slate-200 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[1002] flex flex-col transition-transform duration-300 transform ${
        isOpen ? "translate-x-0" : "translate-x-full absolute right-0 h-full"
      }`}
    >
      {selectedSector ? (
        <>
          <div className="p-6 border-b border-slate-100">
            <div className="flex justify-between items-start mb-4">
              <div className="text-left">
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Sector Analysis</h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {selectedSector.properties.pointIds.length} Detections
                </p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-blue-50 p-3 rounded-xl border border-blue-100 text-left">
                <p className="text-xs font-black text-blue-400 uppercase pb-2">Validation</p>
                <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                  <Shield size={12} /> UNVERIFIED
                </div>
              </div>
              <div className={`flex-1 ${areaStatus.bg} p-3 rounded-xl border border-slate-100 text-left`}>
                <p className="text-xs font-black text-slate-500 uppercase pb-2">Severity</p>
                <div className={`flex items-center gap-1.5 ${areaStatus.color} font-bold text-xs`}>
                  <AlertTriangle size={12} /> {areaStatus.label}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedSector.properties.pointIds.map((id: string, index: number) => (
              <div
                key={id}
                onClick={() => onItemSelect({
                  id,
                  type: selectedSector.properties.types[index],
                  image: selectedSector.properties.images[index],
                })}
                className="group cursor-pointer bg-slate-100 rounded-2xl overflow-hidden hover:border-blue-400 border border-transparent transition-all text-left"
              >
                <div className="h-32 w-full overflow-hidden relative">
                  <img src={selectedSector.properties.images[index]} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute top-2 right-2 bg-[#005D90]/80 px-2 py-1 rounded text-[10px] font-black text-white">92% CONF.</div>
                </div>
                <div className="p-3 flex justify-between items-center">
                  <span className="text-[11px] font-black text-slate-800 uppercase">{selectedSector.properties.types[index]}</span>
                  <CheckCircle size={14} className="text-slate-300 group-hover:text-green-500" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-50">
          <Search size={32} className="text-slate-300 mb-4" />
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Select a grid sector</p>
        </div>
      )}
    </aside>
  );
};