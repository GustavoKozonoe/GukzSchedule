// Gera um calendario iCalendar (.ics) a partir da lista de eventos (matchToEvent).
// Formato RFC 5545. Datas em UTC (sufixo Z) — o iPhone converte pro fuso local sozinho.

const DEFAULT_DURATION_MIN = 120; // duracao padrao de um jogo quando nao sabemos o fim

// Escapa texto para valores de propriedade do iCalendar.
function esc(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Formata uma data ISO para o formato UTC do iCalendar: 20260820T183000Z
function toICSDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

// Dobra linhas com mais de 75 octetos, como manda a RFC 5545.
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks = [];
  let start = 0;
  while (start < bytes.length) {
    // 75 no primeiro pedaco; 74 nos seguintes (1 octeto vai pro espaco de continuacao).
    const size = start === 0 ? 75 : 74;
    chunks.push(bytes.subarray(start, start + size).toString("utf8"));
    start += size;
  }
  return chunks.join("\r\n ");
}

function summaryFor(ev) {
  const vs = ev.teams.join(" vs ");
  return `[${ev.gameLabel}] ${vs}`;
}

function descriptionFor(ev) {
  const parts = [];
  if (ev.league) parts.push(ev.league);
  if (ev.serie) parts.push(ev.serie);
  if (ev.tournament && ev.tournament !== ev.serie && ev.tournament !== ev.league)
    parts.push(ev.tournament);
  if (ev.numberOfGames) parts.push(`Bo${ev.numberOfGames}`);
  if (ev.streamUrl) parts.push(`Stream: ${ev.streamUrl}`);
  return parts.join(" — ");
}

function buildEvent(ev, dtstamp) {
  const start = new Date(ev.startsAt);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${ev.id}@gukzschedule`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toICSDate(start.toISOString())}`,
    `DTEND:${toICSDate(end.toISOString())}`,
    `SUMMARY:${esc(summaryFor(ev))}`,
  ];
  const desc = descriptionFor(ev);
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  const location = ev.league || ev.tournament;
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (ev.streamUrl) lines.push(`URL:${esc(ev.streamUrl)}`);
  lines.push("END:VEVENT");

  return lines.map(fold).join("\r\n");
}

export function buildCalendar(events) {
  const dtstamp = toICSDate(new Date().toISOString());
  const valid = events.filter((e) => e.startsAt); // sem horario nao vira evento

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GukzSchedule//Esports//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:GukzSchedule — Esports",
    "X-WR-TIMEZONE:UTC",
    "X-PUBLISHED-TTL:PT12H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
  ];

  const body = valid.map((ev) => buildEvent(ev, dtstamp));

  return [...header, ...body, "END:VCALENDAR"].join("\r\n") + "\r\n";
}
