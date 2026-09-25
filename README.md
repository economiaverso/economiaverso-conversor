# Economiaverso Conversor Shopee

Site completo para converter URLs da Shopee em links de afiliado usando a Shopee Affiliate Open API.

## Variáveis de ambiente

Obrigatórias:

- `SHOPEE_APP_ID`
- `SHOPEE_SECRET`

Opcional:

- `SITE_ACCESS_CODE` — se definido, protege o conversor com um código.

## Render

- Build Command: `npm install`
- Start Command: `npm start`
- Plano: Free funciona para testes, mas pode dormir por inatividade.

## Segurança

Nunca coloque `SHOPEE_SECRET` no HTML ou no GitHub público. Ele deve existir apenas nas variáveis privadas do servidor.
