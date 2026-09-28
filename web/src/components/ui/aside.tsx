// web/src/components/ui/aside.tsx
import { memo, type CSSProperties } from "react";

// Direct path imports instead of the lucide-react barrel export.
import { X } from "lucide-react";
import { Shield } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { CheckCircle } from "lucide-react";
import { Search } from "lucide-react";

import { getCciColor } from "../../pages/MapView";
import type { HexbinProperties } from "../../types/types";

interface SectorFeature {
  properties: HexbinProperties;
}

interface StatusBadge {
  label: string;
  style: CSSProperties;
}

interface SelectedDetection {
  id: string;
  type: string;
  image: string;
  reporter: string;
  description: string;
  detections: {
    label: string;
    confidence: number;
    bbox: [number, number, number, number];
  }[];
}

interface SectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSector: SectorFeature | null;
  areaStatus?: StatusBadge;
  onItemSelect: (detection: SelectedDetection) => void;
}

const FALLBACK_STATUS_STYLE: CSSProperties = {
  backgroundColor: "#f8fafc",
  color: "#334155",
  borderColor: "#f1f5f9",
};

export const SectorDrawer = memo(function SectorDrawer({
  isOpen,
  onClose,
  selectedSector,
  areaStatus,
  onItemSelect,
}: SectorDrawerProps) {
  const sectorCategory = selectedSector?.properties?.pollution_category;
  const sectorColor = getCciColor(sectorCategory);

  const activeStatus: StatusBadge | undefined = sectorCategory
    ? {
        label: sectorCategory.toUpperCase(),
        style: {
          color: sectorColor,
          backgroundColor: `${sectorColor}1A`,
          borderColor: `${sectorColor}40`,
        },
      }
    : areaStatus;

  return (
    <aside
      className={`w-96 bg-[#fcfcfc] border-l border-zinc-900/10 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[1002] flex flex-col transition-transform duration-300 transform ${
        isOpen ? "translate-x-0" : "translate-x-full absolute right-0 h-full"
      }`}
    >
      {selectedSector ? (
        <>
          {/* Header Section */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex justify-between items-start mb-4">
              <div className="text-left">
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                  Sector Analysis
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {selectedSector.properties.pointIds.length} Detections
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                aria-label="Close sector drawer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Status Badges */}
            <div className="flex gap-2">
              <div className="flex-1 bg-blue-50 p-3 rounded-xl border border-blue-100 text-left">
                <p className="text-xs font-black text-blue-400 uppercase pb-2">Validation</p>
                <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                  <Shield size={12} /> AI VERIFIED
                </div>
              </div>

              {/* Dynamic Severity Box */}
              <div
                className="flex-1 p-3 rounded-xl border text-left font-bold"
                style={activeStatus?.style ?? FALLBACK_STATUS_STYLE}
              >
                <p className="text-xs font-black uppercase pb-2 opacity-70">Severity</p>
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertTriangle size={12} /> {activeStatus?.label ?? "VERY LOW"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedSector.properties.pointIds.map((id: string, index: number) => {
              const imgUrl = selectedSector.properties.images?.[index];
              const wasteType = selectedSector.properties.types?.[index] || "Unclassified Waste";
              const confidencescore = selectedSector.properties.confidence_scores?.[index] ?? 0.85;

              const x1 = selectedSector.properties.x1s?.[index] ?? 0;
              const y1 = selectedSector.properties.y1s?.[index] ?? 0;
              const x2 = selectedSector.properties.x2s?.[index] ?? 0;
              const y2 = selectedSector.properties.y2s?.[index] ?? 0;

              return (
                <button
                  type="button"
                  key={`${id}-${index}`}
                  onClick={() =>
                    onItemSelect({
                      id,
                      type: wasteType,
                      image: imgUrl ?? "",
                      reporter: "YOLOv8",
                      description:
                        "Automated aerial tracking identification finalized with coordinate markers.",
                      detections: [
                        {
                          label: wasteType,
                          confidence: confidencescore,
                          bbox: [x1, y1, x2, y2],
                        },
                      ],
                    })
                  }
                  className="group w-full cursor-pointer bg-slate-100 rounded-2xl overflow-hidden hover:border-blue-400 border border-transparent transition-all text-left"
                >
                  <div className="h-32 w-full overflow-hidden relative bg-slate-200">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        alt="Detection preview"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=Error";
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-[10px] text-slate-400 font-bold">
                        Image Unavailable
                      </div>
                    )}
                    <div className="absolute top-2 right-2 bg-[#005D90]/80 px-2 py-1 rounded text-[10px] font-black text-white uppercase">
                      {Math.round(confidencescore * 100)}% Conf.
                    </div>
                  </div>

                  <div className="p-3 flex justify-between items-center">
                    <span className="text-[11px] font-black text-slate-800 uppercase">{wasteType}</span>
                    <CheckCircle size={14} className="text-slate-300 group-hover:text-green-500" />
                  </div>
                </button>
              );
            })}
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
});