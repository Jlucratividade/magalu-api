import { extrair, CAMPOS, CAMPOS_PADRAO } from '../lib/extrator.js';

// Só aceita buscar páginas destes domínios (evita que a API vire um proxy aberto).
const HOSTS_OK = /(^|\.)(magazineluiza\.com\.br|magalu\.com|magazinevoce\.com\.br)$/i;

const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5',
};

function hostPermitido(u) {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || x.protocol === 'http:') && HOSTS_OK.test(x.hostname);
  } catch { return false; }
}

// Segue redirecionamentos manualmente, validando o domínio a cada salto.
async function baixar(url) {
  let atual = url;
  for (let i = 0; i < 5; i++) {
    if (!hostPermitido(atual)) throw new Error('Domínio não permitido: ' + atual);
    const resp = await fetch(atual, {
      headers: HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      atual = new URL(resp.headers.get('location'), atual).toString();
      continue;
    }
    if (!resp.ok) throw new Error('A página respondeu HTTP ' + resp.status);
    return await resp.text();
  }
  throw new Error('Redirecionamentos demais.');
}

function parametros(req) {
  const p = { ...req.query };
  const b = req.body;
  if (typeof b === 'string' && b.trim()) {
    const t = b.trim();
    if (t[0] === '<' || /__NEXT_DATA__/.test(t)) {
      // Corpo em texto puro com o código da página: usa direto como HTML.
      p.html = t;
    } else {
      // Senão tenta JSON; se não for, assume que é a própria URL.
      try { Object.assign(p, JSON.parse(t)); } catch { p.url = p.url || t; }
    }
  } else if (b && typeof b === 'object') {
    Object.assign(p, b);
  }
  return p;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const erro = (status, msg) => res.status(status).send(JSON.stringify({ erro: msg }));

  // --- autenticação simples por chave ---
  const chave = process.env.API_KEY;
  if (!chave) return erro(500, 'API_KEY não configurada na Vercel.');
  const p = parametros(req);
  const enviada = req.headers['x-api-key'] || p.key;
  if (enviada !== chave) return erro(401, 'Chave inválida.');

  // --- parâmetros ---
  const tipo = String(p.tipo || 'recomendado').toLowerCase(); // minimo | recomendado | completo | personalizado
  const w = Number(p.w) || 800;
  const h = Number(p.h) || 560;

  let sel = CAMPOS_PADRAO;
  if (tipo === 'personalizado') {
    const ids = String(p.campos || '').split(',').map((s) => s.trim()).filter(Boolean);
    const validos = ids.filter((id) => CAMPOS.some((f) => f.id === id));
    if (!validos.length) {
      return erro(400, 'Informe "campos" com ids válidos: ' + CAMPOS.map((f) => f.id).join(', '));
    }
    sel = validos;
  } else if (tipo === 'completo') {
    sel = CAMPOS.map((f) => f.id); // todos os campos
  }

  // --- obtém o HTML (por URL, ou direto se o cliente mandou "html") ---
  let html = typeof p.html === 'string' ? p.html : null;
  if (!html) {
    if (!p.url) return erro(400, 'Informe "url".');
    try {
      html = await baixar(String(p.url));
    } catch (e) {
      return erro(502, 'Falha ao acessar a página: ' + e.message);
    }
  }

  // --- extrai ---
  const r = extrair(html, sel, w, h);
  if (r.erro) return erro(422, r.erro);

  const { completo, minimo, recomendado } = r.dados;
  const saida = tipo === 'minimo' ? minimo : tipo === 'recomendado' ? recomendado : completo;

  return res.status(200).send(JSON.stringify(saida));
}
