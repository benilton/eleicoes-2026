#!/usr/bin/env node
// Congela o resultado final do 1o turno presidencial num arquivo estatico.
//
// O 1o turno acabou em 04/10/2026 e nao muda mais, entao nao ha motivo para
// consultar o TSE ao vivo durante o 2o turno. Este script le o Brasil, as 27
// unidades federativas e os 5.570 municipios, e grava public/primeiro-turno.json.
//
// Formato de cada entrada, em vetor para economizar bytes:
//   [vnom, v22, v13, voutros, ts, te, comparecimento, abstencao, brancos, nulos]
//
// Uso: node baixar-1turno.mjs <destino.json> [destino-municipios.json]

import { writeFile } from 'node:fs/promises'

const BASE = 'https://resultados.tse.jus.br/oficial'
const CICLO = 'ele2026'
const ELEICAO = '6257'
const ELEICAO_CFG = '6258'
const CARGO = '1'
const FINALISTAS = ['22', '13']

const CONCORRENCIA = 12
const TENTATIVAS = 3

const destino = process.argv[2] ?? 'primeiro-turno.json'
const destinoMun = process.argv[3] ?? 'municipios.json'

const pad = (v, n) => String(v).padStart(n, '0')
const numero = (v) => {
  if (!v) return 0
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const urlResultado = (uf, municipio) => {
  const abr = municipio ? `${uf}${municipio}` : uf
  return `${BASE}/${CICLO}/${ELEICAO}/dados/${uf}/${abr}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-u.json`
}

async function ler(url) {
  let ultimo
  for (let i = 0; i < TENTATIVAS; i += 1) {
    try {
      const r = await fetch(url)
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) {
      ultimo = e
      await new Promise((p) => setTimeout(p, 400 * (i + 1)))
    }
  }
  throw new Error(`${url}: ${ultimo?.message ?? 'falha'}`)
}

function compactar(bruto) {
  const cargo = (bruto.carg ?? []).find((c) => c.cd === CARGO) ?? bruto.carg?.[0]
  const votos = {}
  let outros = 0
  for (const agr of cargo?.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const cand of par.cand ?? []) {
        const v = numero(cand.vap)
        if (FINALISTAS.includes(cand.n)) votos[cand.n] = v
        else outros += v
      }
    }
  }
  return [
    numero(bruto.v?.vnom),
    votos['22'] ?? 0,
    votos['13'] ?? 0,
    outros,
    numero(bruto.s?.ts),
    numero(bruto.e?.te),
    numero(bruto.e?.c),
    numero(bruto.e?.a),
    numero(bruto.v?.vb),
    numero(bruto.v?.tvn),
  ]
}

async function emLotes(itens, trabalho) {
  const saida = new Array(itens.length)
  let proximo = 0
  const operario = async () => {
    for (;;) {
      const i = proximo
      proximo += 1
      if (i >= itens.length) return
      saida[i] = await trabalho(itens[i], i)
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, operario))
  return saida
}

// ---------------------------------------------------------------- execucao

const cfgUrl = `${BASE}/${CICLO}/${ELEICAO_CFG}/config/mun-e${pad(ELEICAO_CFG, 6)}-cm.json`
const cfg = await ler(cfgUrl)
if (!cfg) throw new Error('configuracao de municipios indisponivel')

// O exterior entra como 'zz': a votacao la ja terminou, e os 186 postos
// aparecem no seletor como se fossem municipios, que e como o TSE os publica.
const UFS = cfg.abr
  .map((a) => ({ sigla: String(a.cd).toLowerCase(), municipios: a.mu }))
  .sort((a, b) => a.sigla.localeCompare(b.sigla))

const mapaMunicipios = {}
for (const uf of UFS) {
  mapaMunicipios[uf.sigla] = uf.municipios
    .map((m) => [m.cd, m.nm])
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
}
await writeFile(destinoMun, JSON.stringify(mapaMunicipios))
console.error(`municipios: ufs=${UFS.length} total=${Object.values(mapaMunicipios).reduce((s, l) => s + l.length, 0)}`)

const alvos = [{ uf: 'br' }]
for (const uf of UFS) {
  alvos.push({ uf: uf.sigla })
  for (const [cd] of mapaMunicipios[uf.sigla]) alvos.push({ uf: uf.sigla, mun: cd })
}
console.error(`alvos: ${alvos.length}`)

let prontos = 0
let vazios = 0
const inicio = Date.now()

const resultados = await emLotes(alvos, async (alvo) => {
  const bruto = await ler(urlResultado(alvo.uf, alvo.mun))
  prontos += 1
  if (!bruto) vazios += 1
  if (prontos % 500 === 0) {
    const s = ((Date.now() - inicio) / 1000).toFixed(0)
    console.error(`  ${prontos}/${alvos.length} em ${s}s`)
  }
  return bruto ? compactar(bruto) : null
})

const saida = { eleicao: ELEICAO, cargo: CARGO, finalistas: FINALISTAS, br: null, uf: {}, mun: {} }
alvos.forEach((alvo, i) => {
  const dado = resultados[i]
  if (!dado) return
  if (alvo.uf === 'br') saida.br = dado
  else if (!alvo.mun) saida.uf[alvo.uf] = dado
  else {
    saida.mun[alvo.uf] ??= {}
    saida.mun[alvo.uf][alvo.mun] = dado
  }
})

await writeFile(destino, JSON.stringify(saida))
const s = ((Date.now() - inicio) / 1000).toFixed(0)
console.error(`pronto em ${s}s | ufs=${Object.keys(saida.uf).length} | sem arquivo=${vazios}`)
console.error(`br=${JSON.stringify(saida.br)}`)
console.error(`sp=${JSON.stringify(saida.uf.sp)}`)
console.error(`campinas=${JSON.stringify(saida.mun.sp?.['62910'])}`)
