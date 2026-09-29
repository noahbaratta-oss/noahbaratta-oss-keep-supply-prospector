"use client";

import type { Prospect } from "../lib/types";

type Props = {
  prospect: Prospect;
  saved: boolean;
  researching: boolean;
  notes?: { dossier: string; related: Prospect[] };
  onClose: () => void;
  onSave: () => void;
  onResearch: () => void;
  onOpenRelated: (p: Prospect) => void;
};

const NV = "Needs verification";

function ammoniaText(p: Prospect) {
  if (p.ammonia === "Confirmed") return "Confirmed (public record)";
  if (p.ammonia === "Likely") return "Likely — verify";
  if (p.ammonia === "None indicated") return "Not indicated (non-ammonia signal)";
  return "Unknown";
}

function quantityText(p: Prospect) {
  if (p.ammoniaLb && p.ammoniaLb >= 10000) return `${p.ammoniaLb.toLocaleString()} lb stated — meets 10,000-lb target (verify source)`;
  if (p.ammoniaLb) return `${p.ammoniaLb.toLocaleString()} lb stated — below 10,000-lb target`;
  return p.ammonia === "Confirmed" || p.ammonia === "Likely" ? "Not found in public sources" : "n/a (no ammonia evidence)";
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function Dossier({ prospect: p, saved, researching, notes, onClose, onSave, onResearch, onOpenRelated }: Props) {
  const rows: Array<[string, string]> = [
    ["Score", `${p.score}/100`],
    ["Priority", p.priority],
    ["Confidence", p.confidence],
    ["Facility type", p.facilityType],
    ["Industry", p.industry || NV],
    ["Refrigeration", p.refrigeration || NV],
    ["Ammonia", ammoniaText(p)],
    ["Ammonia quantity", quantityText(p)],
    ["CO₂ indication", p.co2 ? "CO₂ refrigeration signal found" : "Not found"],
    ["OEM / equipment brands", p.equipmentBrands?.length ? `${p.equipmentBrands.join(", ")}${p.brandsSource ? ` (${p.brandsSource})` : ""}` : "Not found"],
    ["Buyer type", p.buyerType ? `${p.buyerType} (Keep Supply list)` : p.likelyBuyerType || NV],
    ["Parts opportunity", p.estimatedPartsOpportunity || NV],
    ["Cold-call priority", p.coldCallPriority || "—"],
    ["Territory", p.territoryAssignment || p.state],
    ["Supporting sources", String(p.evidenceSources || (p.sourceUrls || []).length || 0)],
    ["Found by", (p.providers || []).join(", ") || p.source || "—"],
    ["First seen", p.firstSeen ? new Date(p.firstSeen).toLocaleDateString() : "—"],
    ["Last seen", p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : "—"],
  ];
  const location = [p.address, p.city !== "Unknown" ? p.city : "", p.state, p.zip].filter(Boolean).join(", ");
  const mapUrl = p.lat && p.lon ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}` : location ? `https://www.google.com/maps/search/${encodeURIComponent(`${p.name} ${location}`)}` : "";

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="eyebrow">PROSPECT DOSSIER</div>
        <div className="drawerTitleRow">
          <div>
            <h2>{p.name}</h2>
            {p.facilityName && <p className="muted facility">{p.facilityName}</p>}
            <p className="muted">{location || `${p.city}, ${p.state}`}{mapUrl && <> · <a href={mapUrl} target="_blank" rel="noreferrer">map</a></>}</p>
            {(p.phone || p.website) && (
              <p className="muted">
                {p.phone && <>☎ {p.phone} <small>(published by source)</small></>}
                {p.phone && p.website && " · "}
                {p.website && <a href={p.website} target="_blank" rel="noreferrer">{host(p.website)}</a>}
              </p>
            )}
            {p.inSeedList && <p className="seedLine">In Keep Supply prospect list</p>}
          </div>
          <div className="drawerBtns">
            <button className="saveLarge" onClick={onSave}>{saved ? "★ Saved" : "☆ Save"}</button>
            <button className="saveLarge" onClick={onResearch} disabled={researching}>{researching ? "Researching…" : "Research now"}</button>
          </div>
        </div>

        <div className="dossierGrid">
          {rows.map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}
        </div>

        {p.ammoniaLb && p.ammoniaLb >= 10000 ? (
          <div className="ammoniaBox">10,000+ lb ammonia stated in a public source{p.ammoniaLbSource ? <> — <a href={p.ammoniaLbSource} target="_blank" rel="noreferrer">{host(p.ammoniaLbSource)}</a></> : null}. Verify before quoting.</div>
        ) : null}

        <p className="reason"><strong>Why it scored:</strong> {p.reason || "—"}</p>
        {p.salesApproach && <p className="reason"><strong>Sales approach (Keep Supply list):</strong> {p.salesApproach}</p>}
        {p.parentCompany && <p className="muted small">Parent company: {p.parentCompany}</p>}
        {p.registryIds?.length ? <p className="muted small">Registry IDs: {p.registryIds.join(" · ")}</p> : null}

        <h3>Evidence ({(p.evidence || []).length})</h3>
        <div className="evidence">
          {(p.evidence || []).map((e, i) => (
            <div key={i} className={`evItem ${e.kind || ""}`}>
              <div className="evLabel">{e.label}</div>
              {e.detail && <div className="evDetail">{e.detail}</div>}
              <div className="evMeta">{e.source}{e.url && <> · <a href={e.url} target="_blank" rel="noreferrer">{host(e.url)}</a></>}</div>
            </div>
          ))}
          {!(p.evidence || []).length && <p className="muted">No evidence recorded yet. Run research.</p>}
        </div>

        <div className="researchHeader">
          <h3>Live public research</h3>
          <button className="mini" onClick={onResearch} disabled={researching}>{researching ? "Researching…" : "Research now"}</button>
        </div>
        {notes?.dossier ? <pre className="researchText">{notes.dossier}</pre> : <p className="muted">Research now runs the recursive public-web pass (refrigeration, ammonia, permits, RMP/PSM, expansion, PDFs), EPA ECHO / TRI / USDA FSIS name lookups, and scans relevant pages for evidence. Results merge into Lifetime.</p>}
        {notes?.related?.length ? (
          <>
            <h3>Other facilities found (added to Lifetime)</h3>
            <div className="sources">
              {notes.related.map((r) => <button key={r.key} className="linkBtn" onClick={() => onOpenRelated(r)}>{r.name} — {r.city}, {r.state}</button>)}
            </div>
          </>
        ) : null}

        <h3>Sources ({(p.sourceUrls || []).length})</h3>
        <div className="sources">
          {(p.sourceUrls || []).slice(0, 40).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}
          {!(p.sourceUrls || []).length && <p className="muted">No public source URLs yet{p.inSeedList ? " — this record comes from the Keep Supply list" : ""}.</p>}
        </div>
      </aside>
    </div>
  );
}
