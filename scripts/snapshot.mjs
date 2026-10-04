#!/usr/bin/env node
// Coleta periodica do resultado unificado do TSE e acumulo do historico.
//
// O TSE publica apenas a fotografia corrente da apuracao. Este script roda no
// GitHub Actions a cada cinco minutos, le o arquivo do Brasil mais o das 27
// unidades federativas e acrescenta um ponto ao arquivo
// historico/e{eleicao}-c{cargo}.json, em formato colunar.
//
// Node puro, sem dependencia externa e sem importar a camada TypeScript.
// As convencoes de URL e de conversao numerica repetem src/tse/urls.ts e
// src/tse/normaliza.ts de proposito: o script roda fora do bundle.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const BASE_TSE = 'https://resultados.tse.jus.br/oficial'
export const CICLO = 'ele2026'

export const UFS = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to',
]

/** Teto de pontos da serie. Acima disso o historico e raleado pelo descarte. */
export const TETO_PONTOS = 600
/** Teto de tamanho do arquivo gravado. */
export const TETO_BYTES = 400 * 1024
/** Requisicoes simultaneas. O TSE bloqueia o IP acima de cem por segundo. */
const TAMANHO_LOTE = 6
const PAUSA_ENTRE_LOTES_MS = 1500
const TENTATIVAS = 3
const TIMEOUT_MS = 20_000

const pad = (valor, tamanho) => String(valor).padStart(tamanho, '0')

/** Nome do arquivo unificado do TSE, identico ao usado em src/tse/urls.ts. */
export const nomeArquivoTse = (eleicao, uf, cargo) =>
  `${uf}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`

export const urlResultado = (eleicao, uf, cargo) =>
  `${BASE_TSE}/${CICLO}/${eleicao}/dados/${uf}/${nomeArquivoTse(eleicao, uf, cargo)}?nocache=${Date.now()}`

/** Nome do arquivo de historico. */
export const nomeArquivoHistorico = (eleicao, cargo) =>
  `e${pad(eleicao, 6)}-c${pad(cargo, 4)}.json`

// ---------------------------------------------------------------------------
// Conversao
// ---------------------------------------------------------------------------

/** Texto do TSE para numero. Ponto e separador de milhar, virgula e decimal. */
export function paraNumero(valor) {
  if (valor === null || valor === undefined) return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const limpo = String(valor).replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

/** Duas casas decimais, sem notacao cientifica. */
export const duasCasas = (n) => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  return Number.isFinite(v) ? v : 0
}

// ---------------------------------------------------------------------------
// Leitura do arquivo do TSE
// ---------------------------------------------------------------------------

/**
 * Achata carg[] -> agr[] -> par[] -> cand[] e devolve o resumo de uma
 * abrangencia. A ordem e decrescente por voto, como em src/tse/normaliza.ts.
 */
export function resumir(bruto, cargo) {
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error('resposta do TSE nao e um objeto')
  }
  const cargos = Array.isArray(bruto.carg) ? bruto.carg : []
  const dadosCargo = cargos.find((c) => c && c.cd === String(cargo)) ?? cargos[0]
  const agrs = Array.isArray(dadosCargo?.agr) ? dadosCargo.agr : []

  const candidatos = agrs
    .flatMap((agremiacao) => (Array.isArray(agremiacao?.par) ? agremiacao.par : []))
    .flatMap((partido) =>
      (Array.isArray(partido?.cand) ? partido.cand : []).map((cand) => ({
        numero: String(cand?.n ?? ''),
        nomeUrna: String(cand?.nmu ?? ''),
        partido: String(partido?.sg ?? ''),
        votos: paraNumero(cand?.vap),
        pct: duasCasas(paraNumero(cand?.pvapn || cand?.pvap)),
      })),
    )
    .sort((a, b) => b.votos - a.votos)

  return {
    idg: String(bruto.idg ?? ''),
    geradoEm: `${bruto.dg ?? ''} ${bruto.hg ?? ''}`.trim(),
    pst: duasCasas(paraNumero(bruto.s?.pstn || bruto.s?.pst)),
    te: Math.round(paraNumero(bruto.e?.te)),
    pc: duasCasas(paraNumero(bruto.e?.pc)),
    candidatos,
  }
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

/** Busca uma abrangencia, com recuo entre tentativas. */
async function buscarUm(eleicao, uf, cargo, fonteLocal) {
  if (fonteLocal) {
    const caminho = path.join(fonteLocal, nomeArquivoTse(eleicao, uf, cargo))
    return JSON.parse(await readFile(caminho, 'utf8'))
  }
  let ultimoErro = null
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await fetch(urlResultado(eleicao, uf, cargo), {
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      })
      if (!resposta.ok) throw new Error(`TSE respondeu ${resposta.status}`)
      return await resposta.json()
    } catch (erro) {
      ultimoErro = erro
      if (tentativa < TENTATIVAS) await dormir(1000 * 2 ** (tentativa - 1))
    }
  }
  throw ultimoErro ?? new Error(`falha ao buscar ${uf}`)
}

/** Coleta em lotes pequenos, com pausa entre eles. Devolve dados e falhas. */
export async function coletar(eleicao, cargo, alvos, fonteLocal) {
  const dados = new Map()
  const falhas = []
  for (let i = 0; i < alvos.length; i += TAMANHO_LOTE) {
    const lote = alvos.slice(i, i + TAMANHO_LOTE)
    const resultados = await Promise.allSettled(
      lote.map((uf) => buscarUm(eleicao, uf, cargo, fonteLocal)),
    )
    resultados.forEach((resultado, j) => {
      const uf = lote[j]
      if (resultado.status === 'fulfilled') {
        dados.set(uf, resultado.value)
      } else {
        falhas.push({ uf, motivo: String(resultado.reason?.message ?? resultado.reason) })
      }
    })
    if (i + TAMANHO_LOTE < alvos.length) await dormir(PAUSA_ENTRE_LOTES_MS)
  }
  return { dados, falhas }
}

// ---------------------------------------------------------------------------
// Montagem do historico
// ---------------------------------------------------------------------------

/** Ajusta a serie ao comprimento alvo, preenchendo o inicio com o padrao. */
function alinhar(serie, comprimento, padrao) {
  const base = Array.isArray(serie) ? serie.slice() : []
  while (base.length < comprimento) base.unshift(padrao)
  if (base.length > comprimento) return base.slice(base.length - comprimento)
  return base
}

const ultimoOu = (serie, padrao) =>
  Array.isArray(serie) && serie.length > 0 ? serie[serie.length - 1] : padrao

/** Arquivo de historico vazio. */
export const historicoVazio = (eleicao, cargo) => ({
  eleicao: String(eleicao),
  cargo: String(cargo),
  atualizadoEm: null,
  candidatos: [],
  br: { t: [], idg: [], pst: [], pct: [] },
  ufs: {},
})

/**
 * Acrescenta um ponto ao historico.
 *
 * `anterior` e o arquivo lido do disco, ou nulo. `resumoBr` vem de resumir().
 * `resumosUf` mapeia sigla para resumo, apenas das UFs coletadas com sucesso;
 * uma UF ausente tem o ultimo valor repetido, para a serie nao sair do passo
 * com br.t. Devolve nulo quando o idg nao mudou desde o ultimo ponto.
 */
export function acrescentarPonto({
  anterior,
  eleicao,
  cargo,
  resumoBr,
  resumosUf = {},
  tSegundos = Math.floor(Date.now() / 1000),
  atualizadoEm = new Date().toISOString(),
}) {
  const base = anterior ?? historicoVazio(eleicao, cargo)

  const idgAnterior = ultimoOu(base.br?.idg, null)
  if (idgAnterior !== null && idgAnterior === resumoBr.idg) return null

  // A identidade de cor do painel e fixa, entao a lista de candidatos vem do
  // primeiro snapshot e nunca muda. Se o arquivo ja existe, ela e respeitada.
  const candidatos =
    Array.isArray(base.candidatos) && base.candidatos.length > 0
      ? base.candidatos
      : resumoBr.candidatos.slice(0, 3).map((c) => ({
          numero: c.numero,
          nomeUrna: c.nomeUrna,
          partido: c.partido,
        }))

  const n = Array.isArray(base.br?.t) ? base.br.t.length : 0

  const pctPorNumero = (resumo) => {
    const mapa = new Map()
    for (const c of resumo.candidatos) mapa.set(c.numero, c.pct)
    return mapa
  }

  const mapaBr = pctPorNumero(resumoBr)
  const br = {
    t: [...alinhar(base.br?.t, n, tSegundos), tSegundos],
    idg: [...alinhar(base.br?.idg, n, resumoBr.idg), resumoBr.idg],
    pst: [...alinhar(base.br?.pst, n, 0), resumoBr.pst],
    pct: candidatos.map((cand, i) => {
      const serie = alinhar(base.br?.pct?.[i], n, 0)
      const atual = mapaBr.has(cand.numero)
        ? duasCasas(mapaBr.get(cand.numero))
        : ultimoOu(serie, 0)
      return [...serie, atual]
    }),
  }

  const ufsAnteriores = base.ufs && typeof base.ufs === 'object' ? base.ufs : {}
  const siglas = new Set([...Object.keys(ufsAnteriores), ...Object.keys(resumosUf)])
  const ufs = {}
  for (const uf of UFS) {
    if (!siglas.has(uf)) continue
    const antiga = ufsAnteriores[uf] ?? {}
    const resumo = resumosUf[uf] ?? null
    const pstSerie = alinhar(antiga.pst, n, 0)
    const mapa = resumo === null ? null : pctPorNumero(resumo)
    ufs[uf] = {
      pst: [...pstSerie, resumo === null ? ultimoOu(pstSerie, 0) : resumo.pst],
      pct: candidatos.map((cand, i) => {
        const serie = alinhar(antiga.pct?.[i], n, 0)
        const atual =
          mapa !== null && mapa.has(cand.numero)
            ? duasCasas(mapa.get(cand.numero))
            : ultimoOu(serie, 0)
        return [...serie, atual]
      }),
      te: resumo === null ? Math.round(paraNumero(antiga.te)) : resumo.te,
      pc: resumo === null ? duasCasas(paraNumero(antiga.pc)) : resumo.pc,
    }
  }

  return {
    eleicao: String(eleicao),
    cargo: String(cargo),
    atualizadoEm,
    candidatos,
    br,
    ufs,
  }
}

// ---------------------------------------------------------------------------
// Descarte
// ---------------------------------------------------------------------------

/**
 * Indices preservados num descarte. Joga fora um ponto a cada dois da metade
 * mais antiga e sempre mantem o primeiro, para a curva nao perder o comeco da
 * noite. A metade recente fica intacta.
 */
export function indicesAposDescarte(n) {
  const metade = Math.floor(n / 2)
  const mantidos = []
  for (let i = 0; i < n; i += 1) {
    if (i >= metade || i === 0 || i % 2 === 0) mantidos.push(i)
  }
  return mantidos
}

const porIndices = (serie, indices) =>
  Array.isArray(serie) ? indices.map((i) => serie[i]).filter((v) => v !== undefined) : []

/** Aplica um passo de descarte a todas as series do arquivo. */
export function descartar(historico) {
  const n = historico.br.t.length
  const indices = indicesAposDescarte(n)
  if (indices.length >= n) return historico
  const ufs = {}
  for (const [uf, dados] of Object.entries(historico.ufs)) {
    ufs[uf] = {
      pst: porIndices(dados.pst, indices),
      pct: dados.pct.map((serie) => porIndices(serie, indices)),
      te: dados.te,
      pc: dados.pc,
    }
  }
  return {
    ...historico,
    br: {
      t: porIndices(historico.br.t, indices),
      idg: porIndices(historico.br.idg, indices),
      pst: porIndices(historico.br.pst, indices),
      pct: historico.br.pct.map((serie) => porIndices(serie, indices)),
    },
    ufs,
  }
}

/** Descarta ate caber no teto de pontos e no teto de bytes. */
export function ajustar(historico, tetoPontos = TETO_PONTOS, tetoBytes = TETO_BYTES) {
  let atual = historico
  for (let passo = 0; passo < 64; passo += 1) {
    const pontos = atual.br.t.length
    const bytes = Buffer.byteLength(JSON.stringify(atual), 'utf8')
    if (pontos <= tetoPontos && bytes <= tetoBytes) break
    const reduzido = descartar(atual)
    if (reduzido.br.t.length >= pontos) break
    atual = reduzido
  }
  return atual
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

const virgula = (n) => Number(n).toFixed(2).replace('.', ',')

async function anotarSaidaDoActions(pares) {
  const arquivo = process.env.GITHUB_OUTPUT
  if (!arquivo) return
  const linhas = Object.entries(pares).map(([k, v]) => `${k}=${v}\n`).join('')
  try {
    await writeFile(arquivo, linhas, { flag: 'a' })
  } catch (erro) {
    console.warn(`[aviso] nao consegui escrever GITHUB_OUTPUT: ${erro.message}`)
  }
}

export async function executar(opcoes = {}) {
  const eleicao = String(opcoes.eleicao ?? process.env.SNAPSHOT_ELEICAO ?? '6257')
  const cargo = String(opcoes.cargo ?? process.env.SNAPSHOT_CARGO ?? '1')
  const dirHistorico =
    opcoes.dirHistorico ?? process.env.SNAPSHOT_DIR_HISTORICO ?? 'historico'
  const fonteLocal = opcoes.fonteLocal ?? process.env.SNAPSHOT_FONTE_LOCAL ?? null

  const caminho = path.join(dirHistorico, nomeArquivoHistorico(eleicao, cargo))

  let anterior = null
  try {
    anterior = JSON.parse(await readFile(caminho, 'utf8'))
  } catch (erro) {
    if (erro.code !== 'ENOENT') {
      // Nao sobrescrevo historico ilegivel: melhor falhar e deixar o humano ver.
      throw new Error(`historico existente ilegivel em ${caminho}: ${erro.message}`)
    }
  }

  const { dados, falhas } = await coletar(eleicao, cargo, ['br', ...UFS], fonteLocal)

  const brutoBr = dados.get('br')
  if (brutoBr === undefined) {
    const motivo = falhas.find((f) => f.uf === 'br')?.motivo ?? 'desconhecido'
    throw new Error(`arquivo do Brasil indisponivel: ${motivo}`)
  }
  for (const falha of falhas) {
    console.warn(`[aviso] ${falha.uf} falhou, valor anterior preservado: ${falha.motivo}`)
  }

  const resumoBr = resumir(brutoBr, cargo)
  const resumosUf = {}
  for (const uf of UFS) {
    const bruto = dados.get(uf)
    if (bruto === undefined) continue
    try {
      resumosUf[uf] = resumir(bruto, cargo)
    } catch (erro) {
      console.warn(`[aviso] ${uf} com resposta malformada: ${erro.message}`)
    }
  }

  const proximo = acrescentarPonto({ anterior, eleicao, cargo, resumoBr, resumosUf })
  if (proximo === null) {
    console.log(`idg ${resumoBr.idg} inalterado, nada a gravar`)
    await anotarSaidaDoActions({ escreveu: 'false', pst: virgula(resumoBr.pst) })
    return { escreveu: false, pst: resumoBr.pst, caminho }
  }

  const ajustado = ajustar(proximo)
  await mkdir(dirHistorico, { recursive: true })
  await writeFile(caminho, `${JSON.stringify(ajustado)}\n`, 'utf8')

  const bytes = Buffer.byteLength(JSON.stringify(ajustado), 'utf8')
  console.log(
    `gravado ${caminho}: ${ajustado.br.t.length} pontos, ` +
      `${Object.keys(ajustado.ufs).length} UFs, ${bytes} bytes, ` +
      `idg ${resumoBr.idg}, ${virgula(resumoBr.pst)}% apurado`,
  )
  await anotarSaidaDoActions({ escreveu: 'true', pst: virgula(resumoBr.pst) })
  return { escreveu: true, pst: resumoBr.pst, caminho, historico: ajustado }
}

const invocadoDireto =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invocadoDireto) {
  executar().catch((erro) => {
    console.error(`[erro] ${erro?.message ?? erro}`)
    process.exitCode = 1
  })
}
