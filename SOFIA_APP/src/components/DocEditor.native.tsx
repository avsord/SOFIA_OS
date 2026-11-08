// 08/11/2026: o editor de Word so existe no site. No app (Android) fica vazio para nao levar o docx-preview no pacote
// (o Metro do Android junta ate os import() no arquivo principal e a abertura ficava 100-200 ms mais lenta).
export function DocEditor(_: any) { return null; }
