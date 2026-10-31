// Karta "Herna a vybavení" domácího družstva (údaje ze stránky družstva na STIS).
import { useEffect } from "react";
import { vm } from "../app/vm";
import type { TeamInfo, TeamRef } from "../core/models";
import { AppCard, C, KeyValue, Loading, Muted, T } from "./components";

export function mapsUrl(info: TeamInfo | null | undefined, teamName: string): string | null {
  if (info?.gps) return `https://www.google.com/maps/search/?api=1&query=${info.gps[0].toFixed(6)},${info.gps[1].toFixed(6)}`;
  const q = [info?.herna, teamName].filter((x) => x && x.trim()).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function HallCard({ teamRef, teamName, fallbackPlace }: { teamRef: TeamRef | null; teamName: string; fallbackPlace?: string | null }) {
  useEffect(() => { if (teamRef) vm.loadTeamInfo(teamRef); }, [teamRef?.id]);
  const info = teamRef ? vm.teamInfos.get(teamRef.id) : undefined;
  const loading = teamRef ? vm.teamInfoLoading.has(teamRef.id) : false;
  const place = info?.herna ?? fallbackPlace ?? null;
  const url = mapsUrl(info ?? (place ? { herna: place } as TeamInfo : null), teamName);
  if (!info && !place) return loading ? <AppCard><Loading text="Načítám hernu…" /></AppCard> : null;
  return (
    <AppCard>
      <T bold>Herna a vybavení</T>
      <Muted text={`domácí: ${teamName}`} size={12} />
      {place && <KeyValue label="Herna" value={place} />}
      {info?.gpsText && <KeyValue label="GPS" value={info.gpsText} />}
      {url && <div><a className="btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", height: 40 }} href={url} target="_blank" rel="noopener">Navigovat</a></div>}
      {info?.balls && <KeyValue label="Míčky" value={info.balls} />}
      {info?.tables && <KeyValue label="Stoly" value={info.tables} />}
      {info?.contactName && <KeyValue label="Organizační pracovník" value={info.contactName} />}
      {info?.phones.map((p) => <div key={p} className="kv"><div className="k">Telefon</div><a className="v" style={{ color: C.Blue }} href={`tel:${p.replace(/\s+/g, "")}`}>{p}</a></div>)}
      {info?.email && <div className="kv"><div className="k">E-mail</div><a className="v" style={{ color: C.Blue }} href={`mailto:${info.email}`}>{info.email}</a></div>}
    </AppCard>
  );
}
