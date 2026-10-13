import { useEffect, useState } from 'react';
import type { GameSettings, NewPlayer, PlayerKind } from '../game/types';
import { useGame } from '../state/gameStore';
import { unlockAudio } from './audioBridge';
import { UnitIcon } from './common';
import { TEAM_PALETTE, sfx } from './util';

const NAMES = ['Lena', 'Max', 'Biscuit', 'Mochi', 'Pip', 'Waffles'];

interface Row { name: string; color: string; kind: Exclude<PlayerKind, 'remote'> }

const defaultRows = (): Row[] => [
  { name: NAMES[0], color: TEAM_PALETTE[0].color, kind: 'human' },
  { name: NAMES[1], color: TEAM_PALETTE[1].color, kind: 'bot' },
  { name: NAMES[2], color: TEAM_PALETTE[2].color, kind: 'bot' },
];

export function SetupScreen() {
  const [tab, setTab] = useState<'local' | 'online'>('local');
  return (
    <div className="setup-backdrop" onPointerDown={unlockAudio}>
      <div className="setup-card">
        <div className="setup-title">
          <div className="title-animals">
            <UnitIcon animal="dog" size={54} /><UnitIcon animal="pony" size={64} /><UnitIcon animal="panda" size={54} />
          </div>
          <h1>RISK <span className="title-dot">·</span> <span className="title-cute">Cute Edition</span></h1>
          <p className="muted">Conquer the world with dogs, ponies and pandas.</p>
        </div>
        <div className="tabs">
          <button className={tab === 'local' ? 'on' : ''} onClick={() => setTab('local')} data-testid="setup-tab-local">Local</button>
          <button className={tab === 'online' ? 'on' : ''} onClick={() => setTab('online')} data-testid="setup-tab-online">Online (beta)</button>
        </div>
        {tab === 'local' ? <LocalSetup /> : <OnlineSetup />}
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, testid }: {
  value: T; options: { v: T; label: string; hint?: string }[]; onChange: (v: T) => void; testid: string;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'on' : ''} title={o.hint} onClick={() => onChange(o.v)}
          data-testid={`${testid}-${o.v}`} role="radio" aria-checked={value === o.v}>{o.label}</button>
      ))}
    </div>
  );
}

function LocalSetup() {
  const [rows, setRows] = useState<Row[]>(defaultRows);
  const [settings, setSettings] = useState<GameSettings>({ setup: 'auto', cardProgression: 'classic', fortify: 'adjacent' });
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  const update = (i: number, p: Partial<Row>) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...p } : row)));
  const used = new Set(rows.map((r) => r.color));

  const add = () => {
    if (rows.length >= 6) return;
    const color = TEAM_PALETTE.find((c) => !used.has(c.color))!.color;
    const name = NAMES.find((n) => !rows.some((r) => r.name === n)) ?? `Player ${rows.length + 1}`;
    setRows([...rows, { name, color, kind: 'bot' }]);
    sfx('click');
  };
  const remove = (i: number) => { if (rows.length > 2) setRows(rows.filter((_, k) => k !== i)); };

  const start = () => {
    unlockAudio();
    sfx('start');
    const players: NewPlayer[] = rows.map((r, i) => ({ id: `p${i + 1}`, name: r.name.trim() || `Player ${i + 1}`, color: r.color, kind: r.kind }));
    try {
      useGame.getState().startLocal(players, settings);
    } catch (e) {
      useGame.setState({ lastError: `Could not start: ${(e as Error).message}` });
    }
  };

  return (
    <div className="setup-local">
      <div className="player-rows">
        {rows.map((r, i) => (
          <div key={i} className="player-row" data-testid={`setup-player-${i + 1}`}>
            <div className="swatch-wrap">
              <button className="swatch" style={{ background: r.color }} onClick={() => setOpenPicker(openPicker === i ? null : i)}
                aria-label="Pick colour" data-testid={`setup-player-${i + 1}-color`} />
              {openPicker === i && (
                <div className="swatch-pop">
                  {TEAM_PALETTE.map((c) => {
                    const taken = used.has(c.color) && c.color !== r.color;
                    return (
                      <button key={c.color} className={`swatch sm ${c.color === r.color ? 'on' : ''}`} style={{ background: c.color }}
                        disabled={taken} title={c.name} data-testid={`setup-player-${i + 1}-color-${c.name.toLowerCase()}`}
                        onClick={() => { update(i, { color: c.color }); setOpenPicker(null); }} />
                    );
                  })}
                </div>
              )}
            </div>
            <input className="name-input" value={r.name} maxLength={16} onChange={(e) => update(i, { name: e.target.value })}
              data-testid={`setup-player-${i + 1}-name`} aria-label="Player name" />
            <button className={`kind-btn ${r.kind}`} onClick={() => update(i, { kind: r.kind === 'human' ? 'bot' : 'human' })}
              data-testid={`setup-player-${i + 1}-kind`} title="Toggle human / bot">
              {r.kind === 'human' ? '🙂 Human' : '🤖 Bot'}
            </button>
            <button className="icon-btn sm" onClick={() => remove(i)} disabled={rows.length <= 2} aria-label="Remove player"
              data-testid={`setup-player-${i + 1}-remove`}>✕</button>
          </div>
        ))}
        {rows.length < 6 && <button className="add-player" onClick={add} data-testid="setup-add-player">+ Add player</button>}
        {rows.length === 2 && <p className="hint">2 players: a grey neutral army joins the board (book rules).</p>}
      </div>
      <div className="setup-options">
        <label>Territories</label>
        <Seg value={settings.setup} onChange={(v) => setSettings({ ...settings, setup: v })} testid="setup-opt-setup"
          options={[{ v: 'auto', label: 'Auto deal', hint: 'Fast start: territories dealt, armies spread' }, { v: 'manual', label: 'Manual claim', hint: 'Take turns claiming, like the book' }]} />
        <label>Card values</label>
        <Seg value={settings.cardProgression} onChange={(v) => setSettings({ ...settings, cardProgression: v })} testid="setup-opt-cards"
          options={[{ v: 'classic', label: 'Classic', hint: '4, 6, 8, 10, 12, 15, +5…' }, { v: 'expert', label: 'Expert', hint: '4, 5, 6, 7… (+1)' }]} />
        <label>Fortify</label>
        <Seg value={settings.fortify} onChange={(v) => setSettings({ ...settings, fortify: v })} testid="setup-opt-fortify"
          options={[{ v: 'adjacent', label: 'Adjacent', hint: 'Move to a neighbour (book)' }, { v: 'connected', label: 'Connected', hint: 'Move through your own chain' }]} />
      </div>
      <button className="btn primary big" onClick={start} data-testid="start-game">Start game ✨</button>
    </div>
  );
}

// Online lobby. src/net/online.ts (net agent) is loaded lazily via import.meta.glob so a
// missing module only shows "coming soon". Expected API (loosely typed on purpose):
//   connectOnline({url, name, color}) → session { createRoom(), joinRoom(code), listRooms(), addBot(),
//   setReady(ready), startGame(), onRoom(cb), onStarted(cb(transport, initial)) }, defaultServerUrl()
type Fn = (...a: unknown[]) => unknown;
interface Session { [k: string]: unknown }
interface RoomPlayer { id?: string; name?: string; color?: string; ready?: boolean; kind?: string; host?: boolean }
interface RoomSeat { seatId: string; name: string; color: string; kind: string; ownerId: string | null; connected: boolean; ready: boolean }
interface RoomInfo { code?: string; id?: string; room?: string; players?: RoomPlayer[]; seats?: RoomSeat[]; hostId?: string }

async function loadOnline(): Promise<Record<string, unknown>> {
  const mods = import.meta.glob<Record<string, unknown>>('../net/online.ts');
  const loader = Object.values(mods)[0];
  if (!loader) throw new Error('Online play is coming soon — the room server module is not installed yet.');
  return loader();
}

function OnlineSetup() {
  const [url, setUrl] = useState(() => `ws://${location.hostname || 'localhost'}:8787`);
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('Lena');
  const [color, setColor] = useState(TEAM_PALETTE[1].color);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [ready, setReadyState] = useState(false);

  // prefill the server URL from the module if it exists
  useEffect(() => {
    loadOnline().then((m) => { const d = m.defaultServerUrl as (() => string) | undefined; if (d) setUrl(d()); }).catch(() => {});
  }, []);

  const call = async (fn: string, ...args: unknown[]) => {
    const f = session?.[fn] as Fn | undefined;
    if (!f) throw new Error(`${fn}() is not available yet`);
    return f.apply(session, args);
  };

  const run = async (label: string, job: () => Promise<void>) => {
    unlockAudio();
    setBusy(true);
    setStatus(label);
    try { await job(); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  };

  const ensureSession = async (): Promise<Session> => {
    if (session) return session;
    const m = await loadOnline();
    const connectOnline = m.connectOnline as Fn | undefined;
    if (!connectOnline) throw new Error('connectOnline() not available yet');
    const s = (await connectOnline({ url, name, color })) as Session;
    (s.onRoom as Fn | undefined)?.call(s, (r: RoomInfo) => setRoom(r));
    (s.onStarted as Fn | undefined)?.call(s, (transport: unknown, initial: unknown) => {
      useGame.getState().attachTransport(transport as never, initial as never);
    });
    setSession(s);
    return s;
  };

  const create = () => run('Creating room…', async () => {
    const s = await ensureSession();
    const r = (await (s.createRoom as Fn).call(s)) as RoomInfo | string;
    const code = typeof r === 'string' ? r : r?.code ?? r?.room ?? r?.id ?? '';
    if (typeof r === 'object' && r) setRoom(r);
    setRoomCode(code);
    setStatus(code ? `Room ${code} created — share the code!` : 'Room created');
  });
  const join = () => run('Joining…', async () => {
    const s = await ensureSession();
    const r = (await (s.joinRoom as Fn).call(s, roomCode.trim())) as RoomInfo | undefined;
    if (r && typeof r === 'object') setRoom(r);
    setStatus(`Joined room ${roomCode.trim()}`);
  });

  const code = room?.code ?? room?.room ?? room?.id ?? roomCode;
  return (
    <div className="setup-online">
      <p className="hint">Play with friends over the internet. 🌍 Online play is in beta.</p>
      {!room ? (
        <>
          <label>Server URL<input value={url} onChange={(e) => setUrl(e.target.value)} disabled={!!session} data-testid="online-url" /></label>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} disabled={!!session} data-testid="online-name" /></label>
          <div className="swatch-row">
            {TEAM_PALETTE.map((c) => (
              <button key={c.color} className={`swatch sm ${c.color === color ? 'on' : ''}`} style={{ background: c.color }} disabled={!!session}
                onClick={() => setColor(c.color)} title={c.name} data-testid={`online-color-${c.name.toLowerCase()}`} />
            ))}
          </div>
          <label>Room code<input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="e.g. PANDA7" data-testid="online-room" /></label>
          <div className="row-btns">
            <button className="btn" disabled={busy} onClick={create} data-testid="online-create">Create room</button>
            <button className="btn primary" disabled={busy || !roomCode.trim()} onClick={join} data-testid="online-join">Join room</button>
          </div>
        </>
      ) : (
        <div className="lobby" data-testid="online-lobby">
          <h3>Room <span className="room-code" data-testid="online-room-code">{code}</span></h3>
          <div className="player-rows">
            {(room.seats?.map((x) => ({ id: x.seatId, name: x.name, color: x.color, kind: x.kind, ready: x.ready, host: !!x.ownerId && x.ownerId === room.hostId } as RoomPlayer)) ?? room.players ?? []).map((p, i) => (
              <div key={p.id ?? i} className="player-row">
                <span className="swatch sm" style={{ background: p.color ?? '#ccc' }} />
                <span className="lobby-name">{p.name}{p.kind === 'bot' ? ' 🤖' : ''}{p.host ? ' 👑' : ''}</span>
                <span className={`chip-tag ${p.ready ? 'ready' : ''}`}>{p.ready || p.kind === 'bot' ? 'ready' : 'waiting'}</span>
              </div>
            ))}
          </div>
          <div className="row-btns">
            <button className="btn ghost" disabled={busy} onClick={() => run('Adding bot…', async () => { await call('addBot'); setStatus(null); })} data-testid="online-add-bot">+ Bot</button>
            <button className={`btn ${ready ? 'warm' : ''}`} disabled={busy} data-testid="online-ready"
              onClick={() => run('…', async () => { await call('setReady', !ready); setReadyState(!ready); setStatus(null); })}>{ready ? '✅ Ready' : 'I\'m ready'}</button>
            <button className="btn primary" disabled={busy} onClick={() => run('Starting…', async () => { await call('startGame'); })} data-testid="online-start">Start game ✨</button>
          </div>
        </div>
      )}
      {status && <p className="online-status" data-testid="online-status">{status}</p>}
    </div>
  );
}
