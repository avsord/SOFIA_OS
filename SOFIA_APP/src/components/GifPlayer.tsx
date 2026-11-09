// 09/11/2026 (Pedro: "quero poder subir gifs nas paginas e eles ficarem rodando, mas apenas se eu apertar play e tem a opcao com
// looping e ele fica em play infinito"): GIF animado na pagina fica PARADO no 1o quadro com um botao de play. Play toca uma volta e
// para; com "Repetir" ligado toca ate a pessoa pausar. Imagem que nao e GIF animado aparece como antes (um <img> comum).
import React, {useEffect, useRef, useState} from 'react';
import {useTheme} from '../lib/theme';
import {coverBlob} from '../lib/page-cover-cache';

const h = React.createElement as any;

/** Quadros e duracao de uma volta de um GIF (atraso 0/1 centesimo conta 100 ms, como os navegadores). null se nao for GIF. */
export function gifInfo(buf: ArrayBuffer): {frames: number; ms: number} | null {
  const b = new Uint8Array(buf);
  if (b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x38) return null;
  let p = 13, frames = 0, ms = 0, delay = 0;
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
  const skipSub = () => { while (p < b.length) { const n = b[p++]; if (!n) return; p += n; } };
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      if (label === 0xf9 && b[p] >= 4) { const d = b[p + 2] | (b[p + 3] << 8); delay = d <= 1 ? 10 : d; }
      skipSub();
    } else if (t === 0x2c) {
      frames++; ms += (delay || 10) * 10; delay = 0;
      const flags = b[p + 8]; p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p++; skipSub();
    } else break;
  }
  return frames ? {frames, ms: Math.max(100, ms)} : null;
}

type Props = {src: string; alt?: string; style?: any; loop?: boolean; onLoop?: (v: boolean) => void};

export function GifPlayer({src, alt, style, loop = false, onLoop}: Props) {
  const c = useTheme(), [gif, setGif] = useState<{url: string; ms: number; bytes: ArrayBuffer} | null>(null), [playUrl, setPlayUrl] = useState('');
  const canvas = useRef<HTMLCanvasElement | null>(null), timer = useRef<any>(null), loopRef = useRef(loop); loopRef.current = loop;
  useEffect(() => {
    let live = true; setGif(null); setPlayUrl('');
    if (typeof fetch !== 'function' || !src) return;
    // imagem ja baixada (blob:) vem do proprio cache: a protecao do site (connect-src 'self') nao deixa ler blob: com fetch
    const cached = /^blob:/.test(src) ? coverBlob(src) : null;
    if (/^blob:/.test(src) && !cached) return;
    (cached ? cached.arrayBuffer() : fetch(src).then(r => r.ok ? r.arrayBuffer() : null)).then(buf => {
      if (!live || !buf) return; const info = gifInfo(buf);
      if (info && info.frames > 1) setGif({url: src, ms: info.ms, bytes: buf});
    }).catch(() => {});
    return () => { live = false; };
  }, [src]);
  // 1o quadro parado: o navegador desenha so o 1o quadro de um GIF no canvas
  useEffect(() => {
    if (!gif || playUrl) return; const img = new Image();
    img.onload = () => { const cv = canvas.current; if (!cv) return; cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d')?.drawImage(img, 0, 0); };
    img.src = gif.url;
  }, [gif, playUrl]);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  useEffect(() => () => { if (playUrl) URL.revokeObjectURL(playUrl); }, [playUrl]);
  // com a repeticao desligada no meio de uma volta infinita, para ao fim da volta atual
  useEffect(() => { if (playUrl && !loop && gif) { clearTimeout(timer.current); timer.current = setTimeout(stop, gif.ms); } else if (loop) clearTimeout(timer.current); }, [loop]);
  function stop() { clearTimeout(timer.current); setPlayUrl(''); }
  function play() {
    if (!gif) return; clearTimeout(timer.current);
    // endereco novo a cada play: o GIF sempre comeca do 1o quadro
    setPlayUrl(URL.createObjectURL(new Blob([gif.bytes], {type: 'image/gif'})));
    if (!loopRef.current) timer.current = setTimeout(stop, gif.ms);
  }
  if (!gif) return h('img', {src, alt: alt || '', draggable: false, style});
  const swallow = (e: any) => { e.stopPropagation(); };
  const btn = (label: string, title: string, on: boolean, run: () => void) => h('button', {type: 'button', title, 'aria-label': title, 'aria-pressed': on,
    onPointerDown: swallow, onMouseDown: swallow, onClick: (e: any) => { e.preventDefault(); e.stopPropagation(); run(); },
    style: {height: 28, minWidth: 28, padding: '0 9px', border: 0, borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: on ? c.onAccent : '#fff', background: on ? c.accent : 'rgba(0,0,0,.55)', display: 'inline-flex', alignItems: 'center', gap: 4}}, label);
  return h('div', {style: {position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0}},
    playUrl ? h('img', {src: playUrl, alt: alt || '', draggable: false, style}) : h('canvas', {ref: canvas, role: 'img', 'aria-label': alt || 'GIF parado', style: {...style, height: 'auto'}}),
    !playUrl ? h('button', {type: 'button', 'aria-label': 'Tocar o GIF', title: 'Tocar o GIF', onPointerDown: swallow, onMouseDown: swallow, onClick: (e: any) => { e.preventDefault(); e.stopPropagation(); play(); },
      style: {position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 56, height: 56, borderRadius: 28, border: 0, cursor: 'pointer', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 24, lineHeight: '56px', paddingLeft: 4}}, '▶') : null,
    h('div', {style: {position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 6, lineHeight: 'normal'}},
      h('span', {style: {height: 28, padding: '0 8px', borderRadius: 14, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center'}}, 'GIF'),
      playUrl ? btn('❚❚', 'Pausar o GIF', false, stop) : null,
      onLoop ? btn('↻ Repetir', loop ? 'Repetir ligado: toca sem parar até pausar' : 'Repetir desligado: toca uma vez', loop, () => onLoop(!loop)) : null));
}
