#!/usr/bin/env node
// Recalcula a projecao em todos os pontos de um arquivo de historico.
//
// A projecao e funcao pura do estado por unidade federativa num instante, e o
// historico guarda esse estado ponto a ponto: pst e pct de cada unidade. Logo
// a serie da projecao pode ser reconstruida inteira depois, inclusive para os
// pontos coletados antes de o snapshot passar a grava-la.
//
// Uso:
//   node scripts/recalcular-projecao.mjs historico/e006258-c0001.json
//   node scripts/recalcular-projecao.mjs entrada.json saida.json
//
// Sem o segundo argumento, reescreve o proprio arquivo de entrada.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { projetarPorVariacao } from './snapshot.mjs'

const entrada = process.argv[2]
if (!entrada) {
  console.error('uso: node scripts/recalcular-projecao.mjs <historico.json> [saida.json]')
  process.exit(1)
}
const saida = process.argv[3] ?? entrada

const caminhoPrimeiroTurno =
  process.env.SNAPSHOT_PRIMEIRO_TURNO ?? path.join('public', 'primeiro-turno.json')

const historico = JSON.parse(await readFile(entrada, 'utf8'))
const primeiroTurno = JSON.parse(await readFile(caminhoPrimeiroTurno, 'utf8'))

const numeros = Array.isArray(primeiroTurno.finalistas)
  ? primeiroTurno.finalistas
  : historico.candidatos.slice(0, 2).map((c) => c.numero)

const pontos = Array.isArray(historico.br?.t) ? historico.br.t.length : 0
if (pontos === 0) {
  console.error('historico sem pontos')
  process.exit(1)
}

const ordemDosCandidatos = historico.candidatos.map((c) => c.numero)

/** Monta, para o ponto k, o mesmo formato que resumir() devolve por unidade. */
function estadoNoPonto(k) {
  const resumos = {}
  for (const [uf, serie] of Object.entries(historico.ufs ?? {})) {
    const pst = Array.isArray(serie.pst) ? serie.pst[k] : undefined
    if (pst === undefined) continue
    const candidatos = ordemDosCandidatos.map((numero, ordem) => ({
      numero,
      pct: serie.pct?.[ordem]?.[k] ?? 0,
    }))
    resumos[uf] = { pst, candidatos }
  }
  return resumos
}

const proj = ordemDosCandidatos.map(() => [])
const faixa = ordemDosCandidatos.map(() => [])
const cob = []
let comProjecao = 0

for (let k = 0; k < pontos; k += 1) {
  const projecao = projetarPorVariacao(estadoNoPonto(k), primeiroTurno, numeros)
  if (projecao === null) {
    ordemDosCandidatos.forEach((_, i) => {
      proj[i].push(0)
      faixa[i].push(0)
    })
    cob.push(0)
    continue
  }
  comProjecao += 1
  ordemDosCandidatos.forEach((numero, i) => {
    proj[i].push(projecao.proj[numero] ?? 0)
    faixa[i].push(projecao.faixa[numero] ?? 0)
  })
  cob.push(projecao.cobertura)
}

historico.br.proj = proj
historico.br.faixa = faixa
historico.br.cob = cob

await writeFile(saida, `${JSON.stringify(historico)}\n`, 'utf8')
console.log(`${saida}: ${pontos} pontos, ${comProjecao} com projeção`)

const amostra = [0, Math.floor(pontos / 8), Math.floor(pontos / 4), Math.floor(pontos / 2), pontos - 1]
console.log('idx  pst%    ' + ordemDosCandidatos.map((n) => `proj${n}  faixa${n}`).join('  ') + '  cob%')
for (const k of amostra) {
  const linha = ordemDosCandidatos
    .map((_, i) => `${proj[i][k].toFixed(2).padStart(6)}  ${faixa[i][k].toFixed(2).padStart(6)}`)
    .join('  ')
  console.log(
    `${String(k).padStart(3)}  ${historico.br.pst[k].toFixed(2).padStart(6)}  ${linha}  ${cob[k].toFixed(2).padStart(6)}`,
  )
}
