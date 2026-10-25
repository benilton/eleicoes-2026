import { useEffect } from 'react'
import { SEM_MUNICIPIOS, type MapaMunicipios } from '../dados/primeiroTurno'
import { UFS, type Uf } from '../tse/urls'

export interface SeletorMunicipioProps {
  municipios: MapaMunicipios
  uf: Uf
  codigo: string | null
  aoTrocarUf: (uf: Uf) => void
  aoTrocarMunicipio: (codigo: string) => void
}

const CLASSE_SELECT =
  'rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm ' +
  'text-[var(--color-tinta)] focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tinta)]'

/**
 * Dois seletores encadeados. Quando a uf muda, o municipio corrente deixa de
 * existir na lista, e o efeito escolhe o primeiro da uf nova.
 */
export function SeletorMunicipio({
  municipios,
  uf,
  codigo,
  aoTrocarUf,
  aoTrocarMunicipio,
}: SeletorMunicipioProps) {
  const lista = municipios[uf] ?? SEM_MUNICIPIOS

  useEffect(() => {
    if (lista.length === 0) return
    if (codigo && lista.some(([cd]) => cd === codigo)) return
    aoTrocarMunicipio(lista[0][0])
  }, [lista, codigo, aoTrocarMunicipio])

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-[var(--color-tinta-3)]">
        UF
        <select
          className={CLASSE_SELECT}
          value={uf}
          onChange={(evento) => aoTrocarUf(evento.target.value as Uf)}
        >
          {UFS.map((sigla) => (
            <option key={sigla} value={sigla}>
              {sigla.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--color-tinta-3)]">
        Município
        <select
          className={`${CLASSE_SELECT} max-w-[16rem]`}
          value={codigo ?? ''}
          onChange={(evento) => aoTrocarMunicipio(evento.target.value)}
          disabled={lista.length === 0}
        >
          {lista.map(([cd, nome]) => (
            <option key={cd} value={cd}>
              {nome}
            </option>
          ))}
        </select>
      </label>

      {lista.length === 0 && (
        <span className="text-xs text-[var(--color-tinta-3)]">
          Carregando a lista de municípios…
        </span>
      )}
    </div>
  )
}

export default SeletorMunicipio
