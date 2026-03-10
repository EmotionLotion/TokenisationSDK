import { MapPin, ExternalLink } from 'lucide-react';

interface PropertyMapProps {
  address: string;
  district: string;
  latitude?: number;
  longitude?: number;
}

export function PropertyMap({ address, district, latitude, longitude }: PropertyMapProps) {
  const lat = latitude ?? 25.2048;
  const lng = longitude ?? 55.2708;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Dubai, UAE')}`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
      {/* Map Placeholder */}
      <div className="relative h-64 bg-gradient-to-br from-[#0B0E14] to-[#141922] overflow-hidden">
        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-20">
          {Array.from({ length: 12 }).map((_, row) => (
            <div key={row} className="flex">
              {Array.from({ length: 16 }).map((_, col) => {
                const isHighlighted =
                  (row >= 4 && row <= 7 && col >= 6 && col <= 9);
                const isRoad =
                  row === 5 || col === 8;
                return (
                  <div
                    key={col}
                    className={`w-[6.25%] h-[21.33px] border border-white/5 ${
                      isHighlighted
                        ? 'bg-[#F8B032]/20'
                        : isRoad
                          ? 'bg-white/5'
                          : 'bg-transparent'
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Simulated Road Lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-white/10 transform -translate-y-1/2" />
          <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white/10 transform -translate-x-1/2" />
          <div className="absolute top-1/3 left-0 right-0 h-[1px] bg-white/5" />
          <div className="absolute top-2/3 left-0 right-0 h-[1px] bg-white/5" />
          <div className="absolute top-0 bottom-0 left-1/3 w-[1px] bg-white/5" />
          <div className="absolute top-0 bottom-0 left-2/3 w-[1px] bg-white/5" />
        </div>

        {/* Pin Marker */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full z-10">
          <div className="relative flex flex-col items-center">
            <div className="bg-[#F8B032] rounded-full p-2 shadow-lg shadow-[#F8B032]/30">
              <MapPin className="w-5 h-5 text-black" />
            </div>
            <div className="w-2 h-2 bg-[#F8B032] rotate-45 -mt-1" />
            <div className="w-3 h-3 bg-[#F8B032]/30 rounded-full mt-1 animate-ping" />
          </div>
        </div>

        {/* District Label */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-4 z-10">
          <div className="bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5">
            <p className="text-white text-sm font-semibold text-center whitespace-nowrap">{district}</p>
          </div>
        </div>

        {/* Compass */}
        <div className="absolute top-4 right-4 w-8 h-8 rounded-full border border-white/20 bg-black/40 flex items-center justify-center">
          <span className="text-[10px] text-white/60 font-bold">N</span>
        </div>

        {/* Scale */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <div className="w-12 h-[2px] bg-white/30" />
          <span className="text-[10px] text-white/40">500m</span>
        </div>
      </div>

      {/* Info Bar */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-3.5 h-3.5 text-[#F8B032] flex-shrink-0" />
              <p className="text-white text-sm font-medium truncate">{address}</p>
            </div>
            <p className="text-gray-400 text-xs">
              {lat.toFixed(4)}°N, {lng.toFixed(4)}°E &middot; Dubai, UAE
            </p>
          </div>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8B032]/10 border border-[#F8B032]/20 text-[#F8B032] text-xs font-medium hover:bg-[#F8B032]/20 transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            View on Map
          </a>
        </div>
      </div>
    </div>
  );
}
