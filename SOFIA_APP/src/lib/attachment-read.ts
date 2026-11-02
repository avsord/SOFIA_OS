import {File} from 'expo-file-system';
/** 0.3.329: leitura do arquivo anexado na Conversa. No celular vem do disco (expo-file-system); no site ha a versao
 * attachment-read.web.ts (o expo-file-system nao funciona no navegador e o anexo do site falhava). */
export async function attachmentBase64(uri:string):Promise<string>{const f=new File(uri);if(!f.exists)throw Error('O arquivo não está mais no celular. Selecione-o novamente.');return await f.base64();}
export async function attachmentSize(uri:string):Promise<number>{try{return new File(uri).size||0;}catch{return 0;}}
