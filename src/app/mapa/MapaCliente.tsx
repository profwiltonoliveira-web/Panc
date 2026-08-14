"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

type Ponto = {
  id: string;
  latitude: number;
  longitude: number;
  tipo: string;
  descricao?: string;
  nomePlanta: string;
  slug: string;
};

export default function MapaCliente({ pontos }: { pontos: Ponto[] }) {
  const centro = useMemo<[number, number]>(() => {
    if (pontos.length === 0) return [-11.9439, -38.3672]; // Aporá, BA (aproximado)
    return [pontos[0].latitude, pontos[0].longitude];
  }, [pontos]);

  return (
    <div style={{ height: 480 }}>
      <MapContainer center={centro} zoom={12} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pontos.map((p) => (
          <Marker key={p.id} position={[p.latitude, p.longitude]}>
            <Popup>
              <strong>{p.nomePlanta}</strong>
              <br />
              {p.descricao}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
