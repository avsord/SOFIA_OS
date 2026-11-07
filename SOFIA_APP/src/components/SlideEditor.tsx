// Editor de PowerPoint da Sofia (em construcao nesta rodada).
import React from 'react';
import type {SofiaApi} from '../lib/api';
import type {OfficeSaved} from './SheetEditor';
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export async function blankPptx(): Promise<Uint8Array> {throw new Error('Apresentação nova ainda não disponível.');}
export function SlideEditor(_p: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: OfficeSaved) => void}) {return React.createElement('div', null, 'Editor de apresentação em construção');}
