#!/usr/bin/env node
// Monta public/animacao-2turno.json a partir do cache de scripts/baixar-animacao.mjs
// e da serie gravada em historico/.
//
// Metodo, em uma frase: quanto cada unidade federativa ja totalizou em cada
// instante e dado medido, vindo da serie do coletor; a ordem em que as secoes
// daquela unidade entraram vem da hora do arquivo de urna; e os votos de cada
// municipio sao creditados na proporcao das secoes ja contadas dele.
//
// O que isso assume, e o unico ponto em que a animacao deixa de ser medida:
// dentro de um municipio, cada secao divide os votos como o municipio inteiro
// divide. O relatorio impresso ao fim mede o efeito dessa hipotese sobre a
// curva nacional.
//
// O exterior nao tem serie propria no historico, porque o coletor sempre
// gravou apenas as 27 unidades federativas. Ele entra como um grupo unico,
// com o percentual nacional de secoes como relogio. A nota de metodo da tela
// declara essa aproximacao.
//
// Uso: node scripts/montar-animacao.mjs [--cache .cache-animacao]

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ELEICAO = '6258'
const CARGO = '1'
const SAIDA = path.join('public', 'animacao-2turno.json')
/** Fuso de Brasilia, em que o TSE carimba data e hora. */
const DESLOCAMENTO_BRASILIA_MIN = -180

const UFS = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt',
  'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp',
  'to',
]

const pad = (valor, tamanho) => String(valor).padStart(tamanho, '0')

const argumentos = process.argv.slice(2)
const indiceCache = argumentos.indexOf('--cache')
const CACHE = indiceCache === -1 ? '.cache-animacao' : argumentos[indiceCache + 1]

const falhar = (mensagem) => {
  console.error(`FALHA: ${mensagem}`)
  process.exit(1)
}

/** "25/10/2026" e "21:26:44" para segundos desde a epoca. */
function instante(data, hora) {
  const [d, m, a] = data.split('/').map(Number)
  const [hh, mm, ss] = hora.split(':').map(Number)
  const utc = Date.UTC(a, m - 1, d, hh, mm, ss)
  return Math.floor(utc / 1000) - DESLOCAMENTO_BRASILIA_MIN * 60
}

async function lerJson(caminho) {
  try {
    return JSON.parse(await readFile(caminho, 'utf8'))
  } catch (erro) {
    falhar(`nao consegui ler ${caminho}: ${erro.message}`)
  }
}

// ---------------------------------------------------------------------------

const historico = await lerJson(
  path.join('historico', `e${pad(ELEICAO, 6)}-c${pad(CARGO, 4)}.json`),
)
const T = historico.br?.t
if (!Array.isArray(T) || T.length < 2) falhar('historico sem serie de instantes')
const N = T.length
const finalistas = historico.candidatos.map((c) => c.numero)

const cfg = await lerJson(path.join(CACHE, 'municipios-cfg.json'))
const resultados = await lerJson(path.join(CACHE, 'municipios-resultado.json'))

// Codigo IBGE por chave uf+codigoTse, para cruzar com as coordenadas.
const ibgePorChave = {}
for (const abr of cfg.abr) {
  for (const mu of abr.mu) ibgePorChave[String(abr.cd).toLowerCase() + mu.cd] = mu.cdi
}

const csv = await readFile(path.join(CACHE, 'coordenadas.csv'), 'utf8')
const coordenadas = {}
for (const linha of csv.split('\n').slice(1)) {
  const campos = linha.split(',')
  if (campos.length < 4) continue
  coordenadas[campos[0]] = [Number(campos[2]), Number(campos[3])]
}

// ---------------------------------------------------------------------------
// Ordem das secoes dentro de cada unidade federativa
// ---------------------------------------------------------------------------

/** uf -> [[instante, chaveMunicipio], ...] em ordem crescente de instante. */
const ordemPorUf = {}
/** chave do municipio -> numero de secoes com hora. */
const secoesPorMunicipio = {}
let semHora = 0

for (const uf of UFS) {
  const bruto = await lerJson(path.join(CACHE, 'arquivo-urna', `${uf}.json`))
  const lista = []
  for (const abr of bruto.abr ?? []) {
    for (const mu of abr.mu ?? []) {
      const chave = uf + mu.cd
      for (const zona of mu.zon ?? []) {
        for (const secao of zona.sec ?? []) {
          if (!secao.da || !secao.ha) {
            semHora += 1
            continue
          }
          lista.push([instante(secao.da, secao.ha), chave])
          secoesPorMunicipio[chave] = (secoesPorMunicipio[chave] ?? 0) + 1
        }
      }
    }
  }
  if (lista.length === 0) falhar(`arquivo de urna de ${uf} sem nenhuma secao datada`)
  lista.sort((a, b) => a[0] - b[0])
  ordemPorUf[uf] = lista
}

// ---------------------------------------------------------------------------
// Curva de secoes contadas, por municipio e por instante
// ---------------------------------------------------------------------------

/** chave -> [[indice, secoesAcumuladas], ...], so nos instantes que mudam. */
const curvas = {}

for (const uf of UFS) {
  const lista = ordemPorUf[uf]
  const serie = historico.ufs?.[uf]?.pst
  if (!Array.isArray(serie) || serie.length !== N) {
    falhar(`serie de ${uf} ausente ou fora do passo do historico`)
  }
  const total = lista.length
  const contagem = new Map()
  let consumidas = 0
  let maximo = 0
  for (let i = 0; i < N; i += 1) {
    // A serie do TSE pode recuar um centesimo entre dois pontos. O maximo
    // acumulado evita que a animacao ande para tras.
    maximo = Math.max(maximo, serie[i])
    const alvo = Math.min(total, Math.round((maximo / 100) * total))
    if (alvo <= consumidas) continue
    const mudados = new Set()
    for (let j = consumidas; j < alvo; j += 1) {
      const chave = lista[j][1]
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
      mudados.add(chave)
    }
    consumidas = alvo
    for (const chave of mudados) {
      if (curvas[chave] === undefined) curvas[chave] = []
      curvas[chave].push([i, contagem.get(chave)])
    }
  }
}

// ---------------------------------------------------------------------------
// Montagem das entradas
// ---------------------------------------------------------------------------

const municipios = []
let semCoordenada = 0

for (const chave of Object.keys(secoesPorMunicipio).sort()) {
  const resultado = resultados[chave]
  if (resultado === undefined) falhar(`municipio ${chave} sem resultado no cache`)
  const [nome, , eleitorado, ...votos] = resultado
  const ibge = ibgePorChave[chave]
  const coord = ibge ? coordenadas[ibge] : undefined
  if (!coord) semCoordenada += 1
  municipios.push([
    chave,
    nome,
    chave.slice(0, 2),
    secoesPorMunicipio[chave],
    eleitorado,
    votos[0] ?? 0,
    votos[1] ?? 0,
    coord ? Number(coord[0].toFixed(4)) : null,
    coord ? Number(coord[1].toFixed(4)) : null,
    curvas[chave] ?? [],
  ])
}
if (semCoordenada > 0) falhar(`${semCoordenada} municipios sem coordenada`)

// Exterior como grupo unico. Sem serie propria, usa o percentual nacional.
const exterior = { nome: 'Exterior', secoes: 0, eleitorado: 0, votos: [0, 0] }
for (const [chave, dados] of Object.entries(resultados)) {
  if (!chave.startsWith('zz')) continue
  exterior.secoes += dados[1]
  exterior.eleitorado += dados[2]
  exterior.votos[0] += dados[3] ?? 0
  exterior.votos[1] += dados[4] ?? 0
}
if (exterior.secoes > 0) {
  const curva = []
  let anterior = -1
  let maximo = 0
  for (let i = 0; i < N; i += 1) {
    maximo = Math.max(maximo, historico.br.pst[i])
    const contadas = Math.min(
      exterior.secoes,
      Math.round((maximo / 100) * exterior.secoes),
    )
    if (contadas !== anterior && contadas > 0) {
      curva.push([i, contadas])
      anterior = contadas
    }
  }
  municipios.push([
    'zz',
    exterior.nome,
    'zz',
    exterior.secoes,
    exterior.eleitorado,
    exterior.votos[0],
    exterior.votos[1],
    null,
    null,
    curva,
  ])
}

// ---------------------------------------------------------------------------
// Relatorio: a curva reconstruida contra a serie medida
// ---------------------------------------------------------------------------

const acumulado = [new Float64Array(N), new Float64Array(N)]
for (const entrada of municipios) {
  const secoes = entrada[3]
  if (secoes === 0) continue
  const curva = entrada[9]
  let j = 0
  let contadas = 0
  for (let i = 0; i < N; i += 1) {
    while (j < curva.length && curva[j][0] <= i) {
      contadas = curva[j][1]
      j += 1
    }
    const fracao = contadas / secoes
    acumulado[0][i] += entrada[5] * fracao
    acumulado[1][i] += entrada[6] * fracao
  }
}

const diferencas = []
for (let i = 0; i < N; i += 1) {
  const soma = acumulado[0][i] + acumulado[1][i]
  if (soma < 1e6) continue
  diferencas.push(Math.abs((acumulado[0][i] / soma) * 100 - historico.br.pct[0][i]))
}
diferencas.sort((a, b) => a - b)
const mediana = diferencas.length > 0 ? diferencas[Math.floor(diferencas.length / 2)] : 0
const maximo = diferencas.length > 0 ? diferencas[diferencas.length - 1] : 0
const totalReconstruido = acumulado[0][N - 1] + acumulado[1][N - 1]
const totalMedido = historico.br.vnom[N - 1]

if (maximo > 5) falhar(`reconstrucao fora de esquadro: ate ${maximo.toFixed(2)} p.p.`)

// ---------------------------------------------------------------------------
// Eventos da linha do tempo
// ---------------------------------------------------------------------------

// Cada evento e [instante, texto, fonte]. Os de fonte "serie" saem da propria
// serie medida e podem ser conferidos nela. Eventos externos, como a hora de
// uma proclamacao, entram por eventos-externos.json, que e versionado e traz
// a fonte de cada linha. Nada entra aqui sem fonte declarada.
const REGIOES = {
  Norte: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'],
  Nordeste: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'],
  'Centro-Oeste': ['df', 'go', 'ms', 'mt'],
  Sudeste: ['es', 'mg', 'rj', 'sp'],
  Sul: ['pr', 'rs', 'sc'],
}

const doisDecimaisBr = (n) => n.toFixed(2).replace('.', ',')
// O TSE grava o nome de urna em caixa alta. Em frase corrida isso grita, entao
// o texto do evento usa caixa de nome proprio. Os rotulos do painel continuam
// mostrando o nome como o TSE manda.
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const nomeProprio = (nome) =>
  String(nome)
    .toLowerCase()
    .split(/\s+/)
    .map((parte, i) =>
      i > 0 && PARTICULAS.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join(' ')
const primeiroIndice = (teste) => {
  for (let i = 0; i < N; i += 1) if (teste(i)) return i
  return -1
}

const eventos = []
const anotar = (i, texto) => {
  if (i >= 0) eventos.push([T[i], texto, 'serie'])
}

anotar(
  primeiroIndice((i) => historico.br.pst[i] > 0),
  (() => {
    const i = primeiroIndice((j) => historico.br.pst[j] > 0)
    return `Primeiro boletim do país, ${doisDecimaisBr(historico.br.pst[i])}% apurado`
  })(),
)

let maiorPausa = 0
let indicePausa = -1
for (let i = 0; i < N - 1; i += 1) {
  if (historico.br.pst[i] >= 99) break
  if (T[i + 1] - T[i] > maiorPausa) {
    maiorPausa = T[i + 1] - T[i]
    indicePausa = i + 1
  }
}
if (maiorPausa > 20 * 60) {
  anotar(indicePausa, `Publicação volta depois de ${Math.round(maiorPausa / 60)} min parada`)
}

const secoesPorUf = {}
for (const entrada of municipios) {
  if (entrada[2] === 'zz') continue
  secoesPorUf[entrada[2]] = (secoesPorUf[entrada[2]] ?? 0) + entrada[3]
}
for (const [regiao, siglas] of Object.entries(REGIOES)) {
  const peso = siglas.reduce((s, uf) => s + (secoesPorUf[uf] ?? 0), 0)
  const fracao = (i) =>
    siglas.reduce((s, uf) => s + (secoesPorUf[uf] ?? 0) * historico.ufs[uf].pst[i], 0) /
    (peso * 100)
  anotar(primeiroIndice((i) => fracao(i) >= 0.5), `${regiao} passa de metade das seções totalizadas`)
}

const viradaIdx = primeiroIndice(
  (i) => historico.br.pst[i] > 20 && historico.br.pct[1][i] > historico.br.pct[0][i],
)
if (viradaIdx >= 0) {
  const nomes = historico.candidatos.map((c) => nomeProprio(c.nomeUrna))
  anotar(
    viradaIdx,
    `${nomes[1]} ultrapassa ${nomes[0]} no acumulado nacional, ` +
      `${doisDecimaisBr(historico.br.pst[viradaIdx])}% apurado`,
  )
}

let picoIdx = -1
let picoTaxa = 0
for (let i = 1; i < N; i += 1) {
  const taxa = ((historico.br.vnom[i] - historico.br.vnom[i - 1]) / Math.max(1, T[i] - T[i - 1])) * 60
  if (taxa > picoTaxa) {
    picoTaxa = taxa
    picoIdx = i
  }
}
anotar(picoIdx, `Pico de totalização: ${(picoTaxa / 1e6).toFixed(1).replace('.', ',')} milhões de votos por minuto`)
anotar(primeiroIndice((i) => historico.br.pst[i] >= 99), '99% das seções totalizadas')

let externos = []
try {
  externos = JSON.parse(await readFile('eventos-externos.json', 'utf8'))
} catch (erro) {
  if (erro.code !== 'ENOENT') falhar(`eventos-externos.json ilegivel: ${erro.message}`)
}
for (const externo of externos) {
  if (!externo.quando || !externo.texto || !externo.fonte) {
    falhar('evento externo sem quando, texto ou fonte')
  }
  const quando = Math.floor(new Date(externo.quando).getTime() / 1000)
  if (!Number.isFinite(quando)) falhar(`evento externo com data invalida: ${externo.quando}`)
  eventos.push([quando, externo.texto, externo.fonte])
}
eventos.sort((a, b) => a[0] - b[0])

// ---------------------------------------------------------------------------

const saida = {
  eleicao: ELEICAO,
  cargo: CARGO,
  geradoEm: new Date().toISOString(),
  candidatos: historico.candidatos,
  finalistas,
  // Teto dos vasos: a dezena de milhao acima do maior total final.
  cap: Math.ceil(Math.max(acumulado[0][N - 1], acumulado[1][N - 1]) / 1e7) * 1e7,
  t: T,
  pst: historico.br.pst,
  pct: historico.br.pct,
  proj: historico.br.proj,
  faixa: historico.br.faixa,
  cob: historico.br.cob,
  eventos,
  mun: municipios,
}

await mkdir('public', { recursive: true })
const texto = JSON.stringify(saida)
await writeFile(SAIDA, texto)

const virgula = (n, c = 2) => n.toFixed(c).replace('.', ',')
console.log(
  `gravado ${SAIDA}: ${municipios.length} entradas, ` +
    `${Object.values(curvas).reduce((s, c) => s + c.length, 0)} pontos de curva, ` +
    `${(texto.length / 1024).toFixed(0)} KB`,
)
console.log(
  `secoes sem hora no arquivo de urna: ${semHora} ` +
    `(a fracao do municipio e calculada sobre as que tem hora)`,
)
console.log(
  `erro contra a serie medida: mediana ${virgula(mediana)} p.p., ` +
    `maximo ${virgula(maximo)} p.p. em ${diferencas.length} instantes`,
)
console.log(
  `volume ao fim: ${Math.round(totalReconstruido).toLocaleString('pt-BR')} votos ` +
    `reconstruidos contra ${totalMedido.toLocaleString('pt-BR')} medidos pelo TSE`,
)
