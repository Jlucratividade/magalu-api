// Lógica de extração portada do "Extrator JSON Magalu" (HTML) para Node.

const B = ['props', 'pageProps', 'data', 'item'];
const O = B.concat('offers', 0);

export const CAMPOS = [
  { id: 'titulo', k: 'Título', n: B.concat('title'), ld: ['name'], on: 1 },
  { id: 'preco_pix', k: 'Preço no Pix', n: O.concat('bestPrice', 'totalAmount'), ld: ['offers', 'price'], num: 1, on: 1 },
  { id: 'preco_cartao', k: 'Preço no cartão', n: O.concat('price'), num: 1, on: 1 },
  { id: 'de', k: 'Preço "de"', n: O.concat('listPrice'), num: 1, on: 1 },
  { id: 'cupom', k: 'Cupom (código)', n: B.concat('couponTag', 'code'), on: 1 },
  { id: 'cupom_valor', k: 'Cupom (valor)', n: B.concat('couponTag', 'discountValue'), num: 1, on: 0 },
  { id: 'nota', k: 'Nota', n: B.concat('rating', 'score'), ld: ['aggregateRating', 'ratingValue'], num: 1, on: 1 },
  { id: 'avaliacoes', k: 'Nº de avaliações', n: B.concat('rating', 'count'), ld: ['aggregateRating', 'reviewCount'], num: 1, on: 0 },
  { id: 'parcelas', k: 'Parcelas (nº)', n: O.concat('bestInstallmentPlan', 'installment'), num: 1, on: 0 },
  { id: 'parcela_valor', k: 'Valor da parcela', n: O.concat('bestInstallmentPlan', 'installmentAmount'), num: 1, on: 0 },
  { id: 'imagem', k: 'Imagem', n: B.concat('image'), ld: ['image'], img: 1, on: 1 },
  { id: 'url', k: 'Link do produto', n: B.concat('path'), ld: ['offers', 'url'], url: 1, on: 1 },
  { id: 'descricao', k: 'Descrição', n: B.concat('description'), ld: ['description'], on: 0 },
  { id: 'marca', k: 'Marca', n: B.concat('brand', 'label'), ld: ['brand'], on: 0 },
  { id: 'id_produto', k: 'ID do produto', n: B.concat('id'), on: 0 },
  { id: 'vendedor', k: 'Vendedor', n: O.concat('seller', 'name'), on: 0 },
  { id: 'disponivel', k: 'Disponível', n: B.concat('available'), ld: ['offers', 'availability'], on: 0 },
];

export const CAMPOS_PADRAO = CAMPOS.filter((f) => f.on).map((f) => f.id);

const dec = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function tp(t) {
  try { return JSON.parse(t); } catch (e) {
    try { return JSON.parse(dec(t)); } catch (e2) { return undefined; }
  }
}

function ler(raw) {
  const r = { next: null, ld: null, erro: null };
  const t = (raw || '').trim();
  if (!t) { r.erro = 'HTML vazio.'; return r; }

  let m = raw.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (m) { const j = tp(m[1].trim()); if (j) r.next = j; }

  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = re.exec(raw))) {
    const j = tp(m[1].trim());
    if (j && !r.ld && /Product/.test(JSON.stringify(j['@type'] || ''))) r.ld = j;
  }

  if (!r.next && !r.ld) {
    r.erro = 'Não encontrei o JSON da página (__NEXT_DATA__ / ld+json). Pode ter sido bloqueio anti-bot.';
  }
  return r;
}

function get(o, p) {
  let c = o;
  for (const k of p) {
    if (c == null || typeof c !== 'object') return;
    c = c[k];
    if (c === undefined) return;
  }
  return c;
}

function valor(f, r, w, h) {
  let v = r.next ? get(r.next, f.n) : undefined;
  if (v == null && r.ld && f.ld) v = get(r.ld, f.ld);
  if (v && typeof v === 'object' && !Array.isArray(v)) v = v.name || v.label || null;
  if (Array.isArray(v) && f.img) v = v[0];
  if (f.num && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) v = Number(v);
  if (f.img && typeof v === 'string') v = v.replace('{w}', w).replace('{h}', h);
  if (f.url && typeof v === 'string') {
    if (v.startsWith('/')) v = 'https://www.magazineluiza.com.br' + v;
    v = v.split('?')[0].split('#')[0];
  }
  return v;
}

function limpaHtml(t, max) {
  if (typeof t !== 'string') return null;
  t = dec(t.replace(/<\/p>|<br\s*\/?>|<\/li>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length > max) {
    t = t.slice(0, max);
    const k = t.lastIndexOf(' ');
    if (k > max * 0.6) t = t.slice(0, k);
    t = t.replace(/[\s,.;:]+$/, '') + '…';
  }
  return t;
}

const nn = (v) => (v === undefined ? null : v);
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/**
 * Retorna { dados: { completo, minimo, recomendado }, faltando, minFalt } ou { erro }.
 * `sel` = ids de campos para o JSON "completo/personalizado".
 */
export function extrair(raw, sel = CAMPOS_PADRAO, w = 800, h = 560) {
  const r = ler(raw);
  if (r.erro) return { erro: r.erro };

  const todos = {};
  for (const f of CAMPOS) todos[f.id] = valor(f, r, w, h);

  const faltando = [];
  const completo = {};
  for (const f of CAMPOS) {
    if (!sel.includes(f.id)) continue;
    let v = todos[f.id];
    if (v === undefined) { faltando.push(f.k); v = null; }
    completo[f.id] = v;
  }

  const url = nn(todos.url);
  const m = typeof url === 'string' ? url.match(/\/p\/([^\/]+)/) : null;
  const codigo = m ? m[1] : todos.id_produto != null ? String(todos.id_produto) : null;

  const minimo = { codigo, titulo: nn(todos.titulo), url, imagem: nn(todos.imagem), preco_pix: nn(todos.preco_pix) };

  const cartao = nn(todos.preco_cartao);
  const de = typeof todos.de === 'number' && typeof cartao === 'number' && todos.de > cartao ? todos.de : null;
  const ven = todos.vendedor;

  const recomendado = {
    codigo,
    titulo: nn(todos.titulo),
    marca: nn(todos.marca),
    url,
    imagem: nn(todos.imagem),
    preco_pix: nn(todos.preco_pix),
    preco_cartao: cartao,
    de,
    parcelas_sem_juros: nn(todos.parcelas),
    valor_parcela: nn(todos.parcela_valor),
    cupom: nn(todos.cupom),
    cupom_valor: todos.cupom ? nn(todos.cupom_valor) : null,
    nota: nn(todos.nota),
    avaliacoes: nn(todos.avaliacoes),
    vendedor: typeof ven === 'string' ? ven : null,
    disponivel:
      typeof todos.disponivel === 'boolean'
        ? todos.disponivel
        : typeof todos.disponivel === 'string'
        ? /InStock/i.test(todos.disponivel)
        : null,
    descricao: limpaHtml(todos.descricao, 300),
    verificado_em: hoje(),
  };

  return {
    dados: { completo, minimo, recomendado },
    faltando,
    minFalt: Object.keys(minimo).filter((k) => minimo[k] == null),
  };
}
