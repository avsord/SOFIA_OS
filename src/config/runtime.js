'use strict';
const path = require('node:path');
const { AppError } = require('../core/util');
function makeConfig(overrides = {}) {
  const root = overrides.root || path.resolve(__dirname, '../..');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError('BAD_PORT', 'PORT precisa ser um número entre 1 e 65535.');
  return {
    root, port, host: '127.0.0.1', dataDir: process.env.SOFIA_DATA_DIR ? path.resolve(root, process.env.SOFIA_DATA_DIR) : path.join(root, 'data'), backupDir: process.env.SOFIA_BACKUP_DIR ? path.resolve(root, process.env.SOFIA_BACKUP_DIR) : path.join(root, 'backups'),
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
    apiKey: process.env.OPENAI_API_KEY?.trim() || '',
    adminApiKey: process.env.OPENAI_ADMIN_KEY?.trim() || '',
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-transcribe',
    // IDs públicos do app/configuração da Meta. Podem ser sobrescritos por variáveis do Railway.
    metaAppId: process.env.META_APP_ID?.trim() || '1617872666710770',
    metaLoginConfigId: process.env.META_LOGIN_CONFIG_ID?.trim() || process.env.WHATSAPP_EMBEDDED_CONFIG_ID?.trim() || '1590251151959449',
    metaGraphVersion: process.env.META_GRAPH_VERSION?.trim() || 'v26.0',
    metaAppSecret: process.env.META_APP_SECRET?.trim() || '',
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://'+process.env.RAILWAY_PUBLIC_DOMAIN : 'https://sofiaos.up.railway.app'),
    // Credencial inicial do painel online. A senha pode depois ser redefinida por e-mail; o valor em claro nunca é gravado no banco.
    loginPassword: process.env.SOFIA_LOGIN_PASSWORD || '',
    // E-mail inicial do proprietário. Fica em variável de ambiente para não publicar endereço pessoal no Git/ZIP.
    loginEmail: process.env.SOFIA_LOGIN_EMAIL?.trim() || '',
    // 07/11/2026 (Pedro): e-mail DO USUARIO dono da conta (recebe a redefinicao de senha). O e-mail da Sofia so comunica.
    userEmail: process.env.SOFIA_USER_EMAIL?.trim() || '',
    // E-mail corporativo da Sofia (remetente dos e-mails do sistema). Nunca e e-mail de usuario.
    sofiaEmail: process.env.SOFIA_EMAIL?.trim() || 'sofiaos.core@gmail.com',
    // SMTP seguro para recuperação de senha. Para Gmail use smtp.gmail.com:465 e uma senha de app em SOFIA_SMTP_PASS.
    smtpHost: process.env.SOFIA_SMTP_HOST?.trim() || 'smtp.gmail.com',
    smtpPort: Number(process.env.SOFIA_SMTP_PORT || 465),
    smtpSecure: String(process.env.SOFIA_SMTP_SECURE || 'true').toLowerCase() !== 'false',
    smtpUser: process.env.SOFIA_SMTP_USER?.trim() || '',
    smtpPass: process.env.SOFIA_SMTP_PASS || '',
    smtpFrom: process.env.SOFIA_SMTP_FROM?.trim() || process.env.SOFIA_SMTP_USER?.trim() || '',
    privateApiKey: process.env.OPENAI_PRIVATE_API_KEY?.trim() || '', sharedApiKey: process.env.OPENAI_SHARED_API_KEY?.trim() || '',
    // 0.3.244: a pedido do Pedro, o Filtro Privado roda com a chave do projeto COMPARTILHADO (cota gratuita);
    // mesmo comportamento, contexto e modelo. SOFIA_PRIVATE_VIA_SHARED=0 na Railway volta ao projeto privado.
    privateViaShared: process.env.SOFIA_PRIVATE_VIA_SHARED?.trim() !== '0',
    apiTimeoutMs: 90000, turnTimeoutMs: 120000,
    // No short product ceiling: one million characters is a transport/memory safety rail.
    maxMessageChars: 1000000, maxContextChars: 20000,
    ...overrides
  };
}
module.exports = { makeConfig };
