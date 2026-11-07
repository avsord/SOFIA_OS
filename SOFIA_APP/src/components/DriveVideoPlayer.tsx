// 07/11/2026 (Pedro: "tambem tem que da pra assistir video, player extremamente bom e funcional"): player proprio do Drive
// (site). O video vem por streaming (o servidor repassa pedacos do Google Drive), entao comeca rapido e pula para qualquer
// ponto sem baixar tudo. Controles: play/pausa, barra arrastavel com o que ja carregou e a hora ao passar o mouse, -10 s/+10 s,
// volume, velocidade, janela flutuante, tela cheia, legenda de atalhos; os controles somem sozinhos enquanto toca.
import React, {useCallback, useEffect, useRef, useState} from 'react';

const fmt = (t: number) => { if (!Number.isFinite(t) || t < 0) t = 0; const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ICON: Record<string, string> = {
  play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z', back10: 'M11 18V6l-8.5 6zm1-6 8.5 6V6z', fwd10: 'M4 18l8.5-6L4 6zm9-12v12l8.5-6z',
  vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z', mute: 'M3 9v6h4l5 5V4L7 9H3zm16.6 3 2.4 2.4-1.4 1.4-2.4-2.4-2.4 2.4-1.4-1.4 2.4-2.4-2.4-2.4 1.4-1.4 2.4 2.4 2.4-2.4 1.4 1.4z',
  full: 'M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 3v-3h2v5h-5v-2z', exit: 'M8 8V5h2v5H5V8zm8 0h3v2h-5V5h2zM5 16h3v3h2v-5H5zm11 3v-3h3v-2h-5v5z',
  pip: 'M19 11h-8v6h8zm4 8V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2zm-2 0H3V5h18z',
};
const Svg = ({d, size = 22}: {d: string; size?: number}) => React.createElement('svg', {width: size, height: size, viewBox: '0 0 24 24', fill: '#fff', 'aria-hidden': true}, React.createElement('path', {d}));
const btn: React.CSSProperties = {background: 'transparent', border: 0, padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'};

export function DriveVideoPlayer({src, title, audio = false}: {src: string; title: string; audio?: boolean}) {
  const box = useRef<HTMLDivElement | null>(null), v = useRef<HTMLVideoElement | null>(null), bar = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false), [t, setT] = useState(0), [dur, setDur] = useState(0), [buf, setBuf] = useState(0), [vol, setVol] = useState(1), [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1), [rateOpen, setRateOpen] = useState(false), [full, setFull] = useState(false), [waiting, setWaiting] = useState(true), [err, setErr] = useState(''), [show, setShow] = useState(true), [hover, setHover] = useState<{x: number; t: number} | null>(null), [flash, setFlash] = useState('');
  const hideT = useRef<any>(null), seeking = useRef(false);
  const poke = useCallback(() => { setShow(true); clearTimeout(hideT.current); hideT.current = setTimeout(() => { if (v.current && !v.current.paused && !seeking.current) { setShow(false); setRateOpen(false); } }, 2500); }, []);
  const toggle = useCallback(() => { const el = v.current; if (!el) return; if (el.paused) void el.play().catch(() => {}); else el.pause(); poke(); }, [poke]);
  const skip = useCallback((s: number) => { const el = v.current; if (!el) return; el.currentTime = Math.max(0, Math.min((el.duration || 0) - 0.1, el.currentTime + s)); setFlash((s > 0 ? '+' : '') + s + ' s'); setTimeout(() => setFlash(''), 600); poke(); }, [poke]);
  const fullscreen = useCallback(() => { const el = box.current as any; if (!document.fullscreenElement) void el?.requestFullscreen?.(); else void document.exitFullscreen(); }, []);
  const pip = useCallback(async () => { const el = v.current as any; try { if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture(); else await el?.requestPictureInPicture?.(); } catch { /* sem suporte */ } }, []);
  const seekTo = (clientX: number) => { const r = bar.current?.getBoundingClientRect(), el = v.current; if (!r || !el || !el.duration) return; const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); el.currentTime = f * el.duration; setT(el.currentTime); };

  useEffect(() => {
    const el = v.current; if (!el) return;
    const on = (n: string, f: () => void) => { el.addEventListener(n, f); return () => el.removeEventListener(n, f); };
    const offs = [on('play', () => { setPlaying(true); poke(); }), on('pause', () => { setPlaying(false); setShow(true); }), on('timeupdate', () => setT(el.currentTime)),
      on('durationchange', () => setDur(el.duration || 0)), on('loadedmetadata', () => setDur(el.duration || 0)), on('waiting', () => setWaiting(true)), on('canplay', () => setWaiting(false)), on('playing', () => setWaiting(false)),
      on('progress', () => { try { const b = el.buffered; setBuf(b.length ? b.end(b.length - 1) : 0); } catch { /* ignore */ } }), on('volumechange', () => { setVol(el.volume); setMuted(el.muted); }),
      on('error', () => setErr('Não consegui tocar este arquivo. Ele pode estar num formato que o navegador não abre; use Baixar.')), on('ended', () => setShow(true))];
    const fs = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', fs);
    void el.play().catch(() => { /* o navegador pode exigir um clique */ });
    return () => { offs.forEach(f => f()); document.removeEventListener('fullscreenchange', fs); clearTimeout(hideT.current); };
  }, [src, poke]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const el = v.current; if (!el || (e.target as HTMLElement)?.tagName === 'INPUT') return; const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') { e.preventDefault(); toggle(); } else if (key === 'arrowright') { e.preventDefault(); skip(5); } else if (key === 'arrowleft') { e.preventDefault(); skip(-5); } else if (key === 'l') skip(10); else if (key === 'j') skip(-10);
      else if (key === 'arrowup') { e.preventDefault(); el.volume = Math.min(1, el.volume + 0.1); el.muted = false; poke(); } else if (key === 'arrowdown') { e.preventDefault(); el.volume = Math.max(0, el.volume - 0.1); poke(); }
      else if (key === 'm') { el.muted = !el.muted; poke(); } else if (key === 'f' && !audio) fullscreen(); else if (/^[0-9]$/.test(key) && el.duration) { el.currentTime = el.duration * Number(key) / 10; poke(); }
      else if (key === '>' || key === '.') { const i = Math.min(SPEEDS.length - 1, SPEEDS.indexOf(el.playbackRate) + 1); el.playbackRate = SPEEDS[i < 0 ? 2 : i]; setRate(el.playbackRate); } else if (key === '<' || key === ',') { const i = Math.max(0, SPEEDS.indexOf(el.playbackRate) - 1); el.playbackRate = SPEEDS[i]; setRate(el.playbackRate); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [toggle, skip, fullscreen, poke, audio]);

  const pct = dur ? t / dur * 100 : 0, bpct = dur ? Math.min(100, buf / dur * 100) : 0;
  const h = React.createElement;
  return h('div', {ref: box, 'data-testid': 'drive-video-player', onMouseMove: poke, onMouseLeave: () => playing && setShow(false), style: {position: 'relative', width: audio ? 'min(720px, 92vw)' : '100%', height: audio ? 180 : '100%', maxHeight: '100%', background: audio ? 'linear-gradient(135deg,#2a2140,#14111c)' : '#000', borderRadius: full ? 0 : 10, overflow: 'hidden', cursor: show || !playing ? 'default' : 'none', userSelect: 'none'}},
    h('video', {ref: v, src, playsInline: true, preload: 'metadata', onClick: toggle, onDoubleClick: audio ? undefined : fullscreen, style: {width: '100%', height: '100%', objectFit: 'contain', display: audio ? 'none' : 'block', background: '#000'}}),
    audio ? h('div', {onClick: toggle, style: {position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#fff', fontSize: 16, fontWeight: 500, paddingBottom: 60}}, h(Svg, {d: ICON.vol, size: 28}), title) : null,
    waiting && !err ? h('div', {style: {position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, margin: '-22px 0 0 -22px', border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: '50%', animation: 'sofiaspin .8s linear infinite'}}) : null,
    h('style', null, '@keyframes sofiaspin{to{transform:rotate(360deg)}}'),
    flash ? h('div', {style: {position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '10px 16px', borderRadius: 12, fontSize: 18, fontWeight: 600}}, flash) : null,
    !playing && !waiting && !err ? h('button', {'aria-label': 'Reproduzir', onClick: toggle, style: {...btn, position: 'absolute', left: '50%', top: audio ? '35%' : '50%', transform: 'translate(-50%,-50%)', width: 72, height: 72, borderRadius: 36, background: 'rgba(114,88,232,0.9)'}}, h(Svg, {d: ICON.play, size: 36})) : null,
    err ? h('div', {style: {position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 24, textAlign: 'center'}}, err) : null,
    // barra de controles
    h('div', {style: {position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 14px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', opacity: show || !playing ? 1 : 0, transition: 'opacity .25s', pointerEvents: show || !playing ? 'auto' : 'none'}},
      h('div', {ref: bar, 'data-testid': 'drive-video-seek', role: 'slider', 'aria-label': 'Posição', 'aria-valuemin': 0, 'aria-valuemax': Math.round(dur), 'aria-valuenow': Math.round(t), tabIndex: 0,
        onMouseDown: (e: any) => { seeking.current = true; seekTo(e.clientX); const mv = (ev: MouseEvent) => seekTo(ev.clientX), up = () => { seeking.current = false; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); },
        onMouseMove: (e: any) => { const r = bar.current?.getBoundingClientRect(); if (r && dur) setHover({x: e.clientX - r.left, t: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur}); }, onMouseLeave: () => setHover(null),
        style: {position: 'relative', height: 16, display: 'flex', alignItems: 'center', cursor: 'pointer'}},
        h('div', {style: {position: 'absolute', left: 0, right: 0, height: hover ? 6 : 4, borderRadius: 3, background: 'rgba(255,255,255,0.25)', transition: 'height .1s'}}),
        h('div', {style: {position: 'absolute', left: 0, width: bpct + '%', height: hover ? 6 : 4, borderRadius: 3, background: 'rgba(255,255,255,0.45)'}}),
        h('div', {style: {position: 'absolute', left: 0, width: pct + '%', height: hover ? 6 : 4, borderRadius: 3, background: '#9B87F5'}}),
        h('div', {style: {position: 'absolute', left: `calc(${pct}% - 7px)`, width: 14, height: 14, borderRadius: 7, background: '#fff', boxShadow: '0 0 0 3px rgba(155,135,245,0.6)', transform: hover || seeking.current ? 'scale(1)' : 'scale(0.6)', transition: 'transform .1s'}}),
        hover ? h('div', {style: {position: 'absolute', bottom: 20, left: Math.max(0, hover.x - 28), background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 12, padding: '3px 7px', borderRadius: 6, pointerEvents: 'none'}}, fmt(hover.t)) : null),
      h('div', {style: {display: 'flex', alignItems: 'center', gap: 4, marginTop: 4}},
        h('button', {'aria-label': playing ? 'Pausar' : 'Reproduzir', onClick: toggle, style: btn}, h(Svg, {d: playing ? ICON.pause : ICON.play})),
        h('button', {'aria-label': 'Voltar 10 segundos', onClick: () => skip(-10), style: btn}, h(Svg, {d: ICON.back10, size: 20})),
        h('button', {'aria-label': 'Avançar 10 segundos', onClick: () => skip(10), style: btn}, h(Svg, {d: ICON.fwd10, size: 20})),
        h('button', {'aria-label': muted || vol === 0 ? 'Ligar som' : 'Tirar som', onClick: () => { const el = v.current; if (el) el.muted = !el.muted; }, style: btn}, h(Svg, {d: muted || vol === 0 ? ICON.mute : ICON.vol})),
        h('input', {type: 'range', min: 0, max: 1, step: 0.05, value: muted ? 0 : vol, 'aria-label': 'Volume', onChange: (e: any) => { const el = v.current; if (el) { el.volume = Number(e.target.value); el.muted = el.volume === 0; } }, style: {width: 90, accentColor: '#9B87F5', cursor: 'pointer'}}),
        h('span', {style: {color: '#fff', fontSize: 13, marginLeft: 8, fontVariantNumeric: 'tabular-nums'}}, fmt(t) + ' / ' + fmt(dur)),
        h('div', {style: {flex: 1}}),
        h('div', {style: {position: 'relative'}},
          h('button', {'aria-label': 'Velocidade', onClick: () => setRateOpen(o => !o), style: {...btn, fontSize: 13, fontWeight: 600, minWidth: 48}}, rate === 1 ? '1×' : String(rate).replace('.', ',') + '×'),
          rateOpen ? h('div', {style: {position: 'absolute', bottom: 40, right: 0, background: 'rgba(20,18,28,0.97)', borderRadius: 10, padding: 6, minWidth: 110, boxShadow: '0 8px 30px rgba(0,0,0,0.5)'}},
            SPEEDS.map(sp => h('button', {key: sp, onClick: () => { const el = v.current; if (el) el.playbackRate = sp; setRate(sp); setRateOpen(false); }, style: {...btn, width: '100%', justifyContent: 'flex-start', fontSize: 13, background: sp === rate ? 'rgba(155,135,245,0.25)' : 'transparent'}}, sp === 1 ? 'Normal' : String(sp).replace('.', ',') + '×'))) : null),
        !audio && (document as any).pictureInPictureEnabled ? h('button', {'aria-label': 'Janela flutuante', onClick: () => void pip(), style: btn}, h(Svg, {d: ICON.pip, size: 20})) : null,
        !audio ? h('button', {'aria-label': full ? 'Sair da tela cheia' : 'Tela cheia', onClick: fullscreen, style: btn}, h(Svg, {d: full ? ICON.exit : ICON.full})) : null)));
}
