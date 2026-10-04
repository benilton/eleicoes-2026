import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as EventoDeTeclado, ReactElement, ReactNode } from 'react'

export interface Aba {
  id: string
  rotulo: string
  conteudo: ReactNode
}

export interface AbasProps {
  abas: Aba[]
  inicial?: string
}

// Separador usado para reduzir a lista de ids a uma chave estavel de efeito.
// Quebra de linha nao aparece em fragmento de endereco, entao nao colide.
const SEPARADOR = '\n'

// Folga deixada entre a aba trazida a vista e a borda da faixa rolavel, para
// que a aba vizinha continue insinuada e o leitor perceba que ha mais.
const FOLGA_ROLAGEM = 16

/** Le o fragmento corrente do endereco, ja sem o '#'. */
function fragmentoAtual(): string | null {
  if (typeof window === 'undefined') return null
  const bruto = window.location.hash.slice(1)
  if (bruto.length === 0) return null
  try {
    return decodeURIComponent(bruto)
  } catch {
    // Fragmento malformado nao e motivo de erro: cai na primeira aba.
    return bruto
  }
}

/** Devolve o candidato quando ele existe na lista; senao, a primeira aba. */
function resolverId(ids: string[], candidato: string | null | undefined): string {
  if (candidato != null && ids.includes(candidato)) return candidato
  return ids[0] ?? ''
}

/**
 * Abas acessiveis no padrao do WAI-ARIA, com a aba ativa refletida no
 * fragmento do endereco.
 *
 * Decisao com consequencia: somente o painel ativo e montado. Isso evita que
 * graficos de abas ocultas consumam processamento durante a apuracao, mas
 * significa que o estado interno de um painel se perde ao sair dele. Um painel
 * que precise lembrar alguma coisa entre visitas tem de guardar esse estado
 * fora de si, em quem o fornece.
 */
export function Abas({ abas, inicial }: AbasProps): ReactElement {
  const prefixo = useId()
  const ids = abas.map((aba) => aba.id)
  const chave = ids.join(SEPARADOR)

  const [ativa, definirAtiva] = useState(() => resolverId(ids, fragmentoAtual() ?? inicial))

  const faixaRef = useRef<HTMLDivElement | null>(null)
  const painelRef = useRef<HTMLDivElement | null>(null)
  const raizRef = useRef<HTMLDivElement | null>(null)
  const botoesRef = useRef<Record<string, HTMLButtonElement | null>>({})
  const ultimaRef = useRef<string | null>(null)

  // Botoes de voltar e avancar do navegador trocam a aba, porque a troca de
  // aba empurra uma entrada no historico.
  useEffect(() => {
    const lista = chave.length > 0 ? chave.split(SEPARADOR) : []
    function aoTrocarFragmento() {
      definirAtiva(resolverId(lista, fragmentoAtual()))
    }
    window.addEventListener('hashchange', aoTrocarFragmento)
    return () => window.removeEventListener('hashchange', aoTrocarFragmento)
  }, [chave])

  // Resolvido no render, nao em efeito: se a lista de abas mudar e a aba
  // corrente desaparecer, a primeira vale ja nesta passagem, sem um quadro
  // intermediario em que nenhuma aba esta marcada.
  const ativaEfetiva = resolverId(ids, ativa)

  /** Traz a aba a vista na horizontal, sem mexer na rolagem vertical. */
  const trazerAVista = useCallback((botao: HTMLButtonElement) => {
    const faixa = faixaRef.current
    if (!faixa) return
    const esquerda = botao.offsetLeft
    const direita = esquerda + botao.offsetWidth
    if (esquerda < faixa.scrollLeft + FOLGA_ROLAGEM) {
      faixa.scrollTo({ left: Math.max(0, esquerda - FOLGA_ROLAGEM) })
    } else if (direita > faixa.scrollLeft + faixa.clientWidth - FOLGA_ROLAGEM) {
      faixa.scrollTo({ left: direita - faixa.clientWidth + FOLGA_ROLAGEM })
    }
  }, [])

  const selecionar = useCallback((id: string) => {
    definirAtiva(id)
    if (typeof window !== 'undefined') {
      const alvo = encodeURIComponent(id)
      // Atribuir o fragmento empurra uma entrada no historico; o guarda evita
      // entradas repetidas quando a aba ja e a corrente.
      if (window.location.hash.slice(1) !== alvo) window.location.hash = alvo
    }
    const botao = botoesRef.current[id]
    if (botao) trazerAVista(botao)
  }, [trazerAVista])

  // Ao trocar de aba, o inicio do conjunto volta ao alto da janela: sem isso o
  // leitor cai no meio do conteudo novo, na altura em que estava no anterior.
  // A guarda por valor anterior, e nao por "ja montou", sobrevive a montagem
  // dupla do modo estrito em desenvolvimento.
  useEffect(() => {
    if (ultimaRef.current === ativaEfetiva) return
    const primeira = ultimaRef.current === null
    ultimaRef.current = ativaEfetiva
    if (primeira) return
    if (painelRef.current) painelRef.current.scrollTop = 0
    // A raiz, e nao o painel: a faixa de abas e fixa no topo e cobriria as
    // primeiras linhas se o alinhamento fosse pelo painel.
    raizRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [ativaEfetiva])

  function aoTeclar(evento: EventoDeTeclado<HTMLButtonElement>, indice: number) {
    const total = abas.length
    if (total === 0) return
    let destino: number
    if (evento.key === 'ArrowRight') destino = (indice + 1) % total
    else if (evento.key === 'ArrowLeft') destino = (indice - 1 + total) % total
    else if (evento.key === 'Home') destino = 0
    else if (evento.key === 'End') destino = total - 1
    else return
    evento.preventDefault()
    const alvo = abas[destino]
    if (!alvo) return
    // A selecao acompanha o foco, como manda o padrao para abas de montagem
    // barata; o painel novo ja entra montado quando o foco chega.
    selecionar(alvo.id)
    botoesRef.current[alvo.id]?.focus()
  }

  const abaAtiva = abas.find((aba) => aba.id === ativaEfetiva) ?? null

  return (
    <div ref={raizRef}>
      <div
        ref={faixaRef}
        role="tablist"
        aria-label="Seções do painel"
        className={[
          'sticky top-0 z-10 flex gap-1 overflow-x-auto scroll-smooth whitespace-nowrap',
          'border-b border-white/10 bg-[var(--color-superficie)]',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        ].join(' ')}
      >
        {abas.map((aba, indice) => {
          const ativo = aba.id === ativaEfetiva
          return (
            <button
              key={aba.id}
              ref={(no) => {
                botoesRef.current[aba.id] = no
              }}
              type="button"
              role="tab"
              id={`${prefixo}aba-${aba.id}`}
              aria-selected={ativo}
              aria-controls={`${prefixo}painel-${aba.id}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => selecionar(aba.id)}
              onKeyDown={(evento) => aoTeclar(evento, indice)}
              className={[
                '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors',
                'focus-visible:outline focus-visible:outline-2',
                'focus-visible:[outline-offset:-2px]',
                'focus-visible:outline-[var(--color-tinta)]',
                // O estado ativo nao depende so de cor: peso de fonte mais a
                // hairline de 2px embaixo, que cobre a do contorno da faixa.
                ativo
                  ? 'border-[var(--color-tinta)] font-semibold text-[var(--color-tinta)]'
                  : 'border-transparent font-normal text-[var(--color-tinta-3)] hover:text-[var(--color-tinta-2)]',
              ].join(' ')}
            >
              {aba.rotulo}
            </button>
          )
        })}
      </div>

      {abaAtiva && (
        <div
          key={abaAtiva.id}
          ref={painelRef}
          role="tabpanel"
          id={`${prefixo}painel-${abaAtiva.id}`}
          aria-labelledby={`${prefixo}aba-${abaAtiva.id}`}
          tabIndex={0}
          className={[
            'pt-6',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            'focus-visible:outline-[var(--color-tinta)]',
          ].join(' ')}
        >
          {abaAtiva.conteudo}
        </div>
      )}
    </div>
  )
}
