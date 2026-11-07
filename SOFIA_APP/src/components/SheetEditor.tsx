// Editor de Excel da Sofia (em construcao nesta rodada).
import React from 'react';
import type {SofiaApi} from '../lib/api';
export type OfficeSaved = {id: string; name: string; mime: string; bytes: number};
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export async function blankXlsx(): Promise<Uint8Array> {throw new Error('Planilha nova ainda não disponível.');}
export function SheetEditor(_p: {api: SofiaApi; id: string; name: string; url: string; pageId: string; onSaved: (a: OfficeSaved) => void}) {return React.createElement('div', null, 'Editor de planilha em construção');}
