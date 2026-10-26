#!/usr/bin/env node
// Baixa as fontes da animacao da apuracao para uma pasta de cache.
//
// Sao tres fontes, nenhuma delas versionada neste repositorio por causa do
// tamanho. Quem versiona e o arquivo derivado que scripts/montar-animacao.mjs
// grava em public/, a partir do que este script deixa no cache.
//
//   1. Configuracao do arquivo de urna, um arquivo por unidade federativa.
//      Lista cada secao com a data e a hora em que o arquivo daquela urna foi
//      disponibilizado. E a unica fonte do TSE com granularidade de secao.
//      Cerca de 31 MB no 2o turno de 2026.
//
//   2. Resultado final de cada municipio, um arquivo por municipio. Da os
//      votos que a animacao distribui ao longo da noite.
//
//   3. Sede de cada municipio em latitude e longitude, de conjunto derivado
//      do IBGE, cruzada pelo codigo IBGE que a configuracao municipal do TSE
//      traz no campo cdi.
//
// Uso: node scripts/baixar-animacao.mjs [--cache .cache-animacao]
//
// O script nao rebaixa o que ja esta no cache. Para refazer do zero, apague a
// pasta. A pasta de cache precisa estar no .gitignore.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://resultados.tse.jus.br/oficial'
const CICLO = 'ele2026'
const ELEICAO = '6258'
// Codigo do pleito, que nao e o codigo da eleicao. O caminho do arquivo de
// urna e indexado pelo pleito, conforme o template tp "cs" de
// comum/config/ele-c.json.
const PLEITO = '3221'
const CARGO = '1'

// Coordenadas da sede municipal. Conjunto publico derivado do IBGE. Se o
// endereco sair do ar, o arquivo derivado ja versionado continua valendo: so
// a regeneracao fica bloqueada.
const URL_COORDENADAS =
  'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv'

const UFS = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt',
  'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp',
  'to', 'zz',
]

const CONCORRENCIA = 10
const TENTATIVAS = 4
const PAUSA_MS = 120

const pad = (valor, tamanho) => String(valor).padStart(tamanho, '0')
const dormir = (ms) => new Promise((pronto) => setTimeout(pronto, ms))

const argumentos = process.argv.slice(2)
const indiceCache = argumentos.indexOf('--cache')
const CACHE = indiceCache === -1 ? '.cache-animacao' : argumentos[indiceCache + 1]

async function existe(caminho) {
  try {
    await stat(caminho)
    return true
  } catch {
    return false
  }
}

/** Busca com recuo. Devolve texto bruto, para o chamador decidir o parse. */
async function buscar(url, tipo = 'json') {
  let ultimo = null
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await fetch(url, { headers: { accept: '*/*' } })
      if (resposta.status === 429 || resposta.status >= 500) {
        throw new Error(`HTTP ${resposta.status}`)
      }
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
      return tipo === 'json' ? await resposta.json() : await resposta.text()
    } catch (erro) {
      ultimo = erro
      if (tentativa < TENTATIVAS) await dormir(1500 * tentativa)
    }
  }
  throw new Error(`${url}: ${ultimo?.message ?? 'falha'}`)
}

// ---------------------------------------------------------------------------
// 1. Configuracao do arquivo de urna
// ---------------------------------------------------------------------------

async function baixarArquivoUrna() {
  const destino = path.join(CACHE, 'arquivo-urna')
  await mkdir(destino, { recursive: true })
  let baixados = 0
  for (const uf of UFS) {
    const caminho = path.join(destino, `${uf}.json`)
    if (await existe(caminho)) continue
    const url =
      `${BASE}/${CICLO}/arquivo-urna/${PLEITO}/config/${uf}/` +
      `${uf}-p${pad(PLEITO, 6)}-cs.json`
    const bruto = await buscar(url, 'texto')
    await writeFile(caminho, bruto)
    baixados += 1
    process.stderr.write(`arquivo-urna ${uf}: ${bruto.length} bytes\n`)
    await dormir(1000)
  }
  return baixados
}

// ---------------------------------------------------------------------------
// 2. Configuracao municipal e resultado de cada municipio
// ---------------------------------------------------------------------------

async function baixarConfiguracaoMunicipal() {
  const caminho = path.join(CACHE, 'municipios-cfg.json')
  if (await existe(caminho)) return JSON.parse(await readFile(caminho, 'utf8'))
  const url = `${BASE}/${CICLO}/${ELEICAO}/config/mun-e${pad(ELEICAO, 6)}-cm.json`
  const cfg = await buscar(url)
  await writeFile(caminho, JSON.stringify(cfg))
  return cfg
}

const numero = (valor) => {
  if (!valor) return 0
  const n = Number(String(valor).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

async function baixarResultadosMunicipais(cfg, finalistas) {
  const caminho = path.join(CACHE, 'municipios-resultado.json')
  if (await existe(caminho)) return JSON.parse(await readFile(caminho, 'utf8'))

  const alvos = []
  for (const abr of cfg.abr) {
    for (const mu of abr.mu) alvos.push({ uf: String(abr.cd).toLowerCase(), cd: mu.cd, nm: mu.nm })
  }
  process.stderr.write(`municipios a ler: ${alvos.length}\n`)

  const saida = {}
  const falhas = []

  const ler = async (alvo) => {
    const arquivo =
      `${alvo.uf}${alvo.cd}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
    const url = `${BASE}/${CICLO}/${ELEICAO}/dados/${alvo.uf}/${arquivo}`
    try {
      const bruto = await buscar(url)
      const dadosCargo =
        (bruto.carg ?? []).find((c) => c.cd === CARGO) ?? bruto.carg?.[0]
      const votos = {}
      for (const agr of dadosCargo?.agr ?? []) {
        for (const par of agr.par ?? []) {
          for (const cand of par.cand ?? []) {
            if (finalistas.includes(cand.n)) votos[cand.n] = numero(cand.vap)
          }
        }
      }
      saida[alvo.uf + alvo.cd] = [
        alvo.nm,
        numero(bruto.s?.ts),
        numero(bruto.e?.te),
        ...finalistas.map((n) => votos[n] ?? 0),
      ]
    } catch (erro) {
      falhas.push(`${alvo.uf}${alvo.cd}: ${erro.message}`)
    }
  }

  for (let i = 0; i < alvos.length; i += CONCORRENCIA) {
    await Promise.all(alvos.slice(i, i + CONCORRENCIA).map(ler))
    if (i % 1000 === 0) process.stderr.write(`  ${i}\n`)
    await dormir(PAUSA_MS)
  }

  if (falhas.length > 0) {
    console.error(`FALHA: ${falhas.length} municipios nao foram lidos`)
    for (const f of falhas.slice(0, 10)) console.error(`  ${f}`)
    process.exit(1)
  }

  await writeFile(caminho, JSON.stringify(saida))
  return saida
}

// ---------------------------------------------------------------------------
// 3. Coordenadas
// ---------------------------------------------------------------------------

async function baixarCoordenadas() {
  const caminho = path.join(CACHE, 'coordenadas.csv')
  if (await existe(caminho)) return
  const csv = await buscar(URL_COORDENADAS, 'texto')
  const cabecalho = csv.slice(0, csv.indexOf('\n')).trim()
  if (!cabecalho.startsWith('codigo_ibge,nome,latitude,longitude')) {
    console.error(`FALHA: cabecalho inesperado em ${URL_COORDENADAS}: ${cabecalho}`)
    process.exit(1)
  }
  await writeFile(caminho, csv)
}

// ---------------------------------------------------------------------------

async function principal() {
  await mkdir(CACHE, { recursive: true })

  // Finalistas na ordem do historico, que e a ordem de cor do painel.
  const historico = JSON.parse(
    await readFile(path.join('historico', `e${pad(ELEICAO, 6)}-c${pad(CARGO, 4)}.json`), 'utf8'),
  )
  const finalistas = historico.candidatos.map((c) => c.numero)
  if (finalistas.length !== 2) {
    console.error(`FALHA: esperava 2 finalistas no historico, achei ${finalistas.length}`)
    process.exit(1)
  }

  const novos = await baixarArquivoUrna()
  const cfg = await baixarConfiguracaoMunicipal()
  const resultados = await baixarResultadosMunicipais(cfg, finalistas)
  await baixarCoordenadas()

  console.log(
    `cache em ${CACHE}: ${UFS.length} arquivos de urna (${novos} novos), ` +
      `${Object.keys(resultados).length} municipios, coordenadas prontas`,
  )
}

principal().catch((erro) => {
  console.error(`[erro] ${erro?.message ?? erro}`)
  process.exitCode = 1
})
