const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID;
const SHOPEE_SECRET = process.env.SHOPEE_SECRET;

const SHOPEE_ENDPOINT =
  "https://open-api.affiliate.shopee.com.br/graphql";


// ======================================================
// UTILIDADES
// ======================================================

function ehShopee(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase();

    return (
      host === "shopee.com.br" ||
      host.endsWith(".shopee.com.br") ||
      host === "shopee.com" ||
      host.endsWith(".shopee.com") ||
      host === "shope.ee" ||
      host.endsWith(".shope.ee") ||
      host === "s.shopee.com.br" ||
      host.endsWith(".s.shopee.com.br")
    );
  } catch {
    return false;
  }
}


async function resolverUrl(url) {
  try {
    const resposta = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    return resposta.url || url;
  } catch {
    return url;
  }
}


function assinaturaShopee(timestamp, payload) {
  const base =
    String(SHOPEE_APP_ID) +
    String(timestamp) +
    payload +
    String(SHOPEE_SECRET);

  return crypto
    .createHash("sha256")
    .update(base, "utf8")
    .digest("hex");
}


// ======================================================
// SHOPEE AFFILIATE API
// ======================================================

async function gerarLinkShopee(originUrl) {
  if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
    throw new Error(
      "SHOPEE_APP_ID ou SHOPEE_SECRET não configurado no Render."
    );
  }

  const query = `
    mutation {
      generateShortLink(
        input: {
          originUrl: ${JSON.stringify(originUrl)}
          subIds: ["economiaverso"]
        }
      ) {
        shortLink
      }
    }
  `;

  const payload = JSON.stringify({ query });

  const timestamp = Math.floor(Date.now() / 1000);

  const signature =
    assinaturaShopee(timestamp, payload);

  const authorization =
    `SHA256 Credential=${SHOPEE_APP_ID}, ` +
    `Timestamp=${timestamp}, ` +
    `Signature=${signature}`;

  const resposta = await fetch(
    SHOPEE_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization
      },
      body: payload
    }
  );

  let dados;

  try {
    dados = await resposta.json();
  } catch {
    throw new Error(
      `A Shopee respondeu HTTP ${resposta.status}, mas não retornou JSON válido.`
    );
  }

  if (!resposta.ok) {
    throw new Error(
      `Shopee HTTP ${resposta.status}: ${JSON.stringify(dados)}`
    );
  }

  if (dados.errors?.length) {
    throw new Error(
      `Shopee GraphQL: ${JSON.stringify(dados.errors)}`
    );
  }

  const shortLink =
    dados?.data?.generateShortLink?.shortLink;

  if (!shortLink) {
    throw new Error(
      "A Shopee não retornou o shortLink."
    );
  }

  return shortLink;
}


async function converterShopee(urlOriginal) {
  try {
    return await gerarLinkShopee(urlOriginal);
  } catch (primeiroErro) {
    const resolvida =
      await resolverUrl(urlOriginal);

    if (!resolvida || resolvida === urlOriginal) {
      throw primeiroErro;
    }

    return gerarLinkShopee(resolvida);
  }
}


// ======================================================
// API DO SITE
// ======================================================

app.post("/api/convert", async (req, res) => {
  try {
    const url =
      String(req.body?.url || "").trim();

    if (!url) {
      return res.status(400).json({
        ok: false,
        erro: "Cole um link da Shopee."
      });
    }

    if (!ehShopee(url)) {
      return res.status(400).json({
        ok: false,
        erro: "Esse link não parece ser da Shopee."
      });
    }

    const afiliado =
      await converterShopee(url);

    return res.json({
      ok: true,
      original: url,
      afiliado
    });

  } catch (erro) {
    console.error("Erro /api/convert:", erro);

    return res.status(500).json({
      ok: false,
      erro:
        erro.message ||
        "Não foi possível converter o link."
    });
  }
});


app.get("/api/status", (req, res) => {
  res.json({
    ok:
      !!SHOPEE_APP_ID &&
      !!SHOPEE_SECRET,
    app_id_configurado:
      !!SHOPEE_APP_ID,
    secret_configurado:
      !!SHOPEE_SECRET
  });
});


// ======================================================
// SITE
// ======================================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.get("*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});


// ======================================================
// SERVIDOR
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Economiaverso Conversor online na porta ${PORT}`
    );
  }
);
