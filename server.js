const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID;
const SHOPEE_SECRET = process.env.SHOPEE_SECRET;
const SHOPEE_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

// Opcional: proteja o conversor com um PIN simples.
// Se SITE_ACCESS_CODE ficar vazio, o site funciona sem PIN.
const SITE_ACCESS_CODE = process.env.SITE_ACCESS_CODE || '';

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

function isShopeeUrl(value = '') {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    return (
      h === 'shopee.com.br' || h.endsWith('.shopee.com.br') ||
      h === 'shopee.com' || h.endsWith('.shopee.com') ||
      h === 'shope.ee' || h.endsWith('.shope.ee') ||
      h === 's.shopee.com.br' || h.endsWith('.s.shopee.com.br')
    );
  } catch {
    return false;
  }
}

function makeSignature(timestamp, payload) {
  const raw = `${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_SECRET}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function generateAffiliateLink(originUrl, subId = 'site') {
  if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
    throw new Error('Credenciais da Shopee não configuradas no servidor.');
  }

  const safeSubId = String(subId || 'site').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'site';

  const query = `
    mutation {
      generateShortLink(
        input: {
          originUrl: ${JSON.stringify(originUrl)}
          subIds: ["${safeSubId}", "economiaverso"]
        }
      ) {
        shortLink
      }
    }
  `;

  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = makeSignature(timestamp, payload);
  const authorization = `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`;

  const response = await fetch(SHOPEE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization
    },
    body: payload
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Shopee HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  if (Array.isArray(data.errors) && data.errors.length) {
    throw new Error(data.errors.map(e => e.message || JSON.stringify(e)).join(' | '));
  }

  const shortLink = data?.data?.generateShortLink?.shortLink;
  if (!shortLink) {
    throw new Error('A Shopee não retornou o link convertido.');
  }

  return shortLink;
}

function checkAccess(req) {
  if (!SITE_ACCESS_CODE) return true;
  const code = String(req.headers['x-access-code'] || req.body?.accessCode || '');
  return crypto.timingSafeEqual(
    Buffer.from(code.padEnd(SITE_ACCESS_CODE.length).slice(0, SITE_ACCESS_CODE.length)),
    Buffer.from(SITE_ACCESS_CODE)
  );
}

app.get('/api/status', (req, res) => {
  res.json({
    ok: Boolean(SHOPEE_APP_ID && SHOPEE_SECRET),
    shopeeConfigured: Boolean(SHOPEE_APP_ID && SHOPEE_SECRET),
    protected: Boolean(SITE_ACCESS_CODE)
  });
});

app.post('/api/convert', async (req, res) => {
  try {
    if (!checkAccess(req)) {
      return res.status(401).json({ ok: false, error: 'Código de acesso inválido.' });
    }

    const url = String(req.body?.url || '').trim();
    const subId = String(req.body?.subId || 'site').trim();

    if (!url) {
      return res.status(400).json({ ok: false, error: 'Cole um link da Shopee.' });
    }

    if (!isShopeeUrl(url)) {
      return res.status(400).json({ ok: false, error: 'Esse link não parece ser da Shopee.' });
    }

    const affiliate = await generateAffiliateLink(url, subId);
    return res.json({ ok: true, original: url, affiliate });
  } catch (error) {
    console.error('Erro ao converter:', error.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível converter agora.', detail: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'economiaverso-conversor' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Economiaverso Conversor online na porta ${PORT}`);
});
