// 08/11/2026 (Pedro: pagina dentro do Quadro "como um iframe"): /paginas/<id>?embed=1 abre so a pagina, sem barra lateral nem
// barra de cima, com todas as funcoes (abrir PDF/Word, editar, compartilhar). O cartao de pagina do Quadro usa isso.
import {Platform} from 'react-native';
export const EMBED = Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]embed=1(&|$)/.test(location.search);
