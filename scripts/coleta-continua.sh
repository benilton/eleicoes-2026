#!/usr/bin/env bash
# Coleta continua do historico da apuracao.
#
# O agendador do GitHub nao disparou o cron de cinco minutos na noite da
# eleicao, entao a estrategia inverte: em vez de muitas execucoes curtas,
# uma execucao longa que amostra sozinha. Disparada uma vez por
# workflow_dispatch, cobre o resto da noite.
set -uo pipefail

DURACAO_MIN="${DURACAO_MIN:-300}"
INTERVALO_S="${INTERVALO_S:-60}"
COMMITS_A_CADA="${COMMITS_A_CADA:-5}"

fim=$(( $(date +%s) + DURACAO_MIN * 60 ))
pendentes=0
ultimo_pst="0,00"
gravados=0
ciclos=0

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

commitar() {
  [ "$pendentes" -eq 0 ] && return 0
  git add historico
  if git diff --cached --quiet; then
    pendentes=0
    return 0
  fi
  git commit -q -m "snapshot: ${ultimo_pst}% apurado (${pendentes} pontos)"
  local tentativa
  for tentativa in 1 2 3; do
    if git push -q 2>/dev/null; then
      pendentes=0
      return 0
    fi
    echo "[aviso] push recusado, rebaseando e tentando de novo (${tentativa}/3)"
    git pull --rebase -q || true
    sleep 3
  done
  echo "[erro] nao consegui empurrar os pontos pendentes"
  pendentes=0
}

trap 'echo "[sinal] encerrando, gravando o que ficou pendente"; commitar; exit 0' TERM INT

while [ "$(date +%s)" -lt "$fim" ]; do
  inicio=$(date +%s)
  ciclos=$(( ciclos + 1 ))

  saida="$(mktemp)"
  if GITHUB_OUTPUT="$saida" node scripts/snapshot.mjs; then
    escreveu="$(grep -m1 '^escreveu=' "$saida" | cut -d= -f2- || true)"
    pst="$(grep -m1 '^pst=' "$saida" | cut -d= -f2- || true)"
    [ -n "${pst:-}" ] && ultimo_pst="$pst"
    if [ "${escreveu:-false}" = "true" ]; then
      pendentes=$(( pendentes + 1 ))
      gravados=$(( gravados + 1 ))
      echo "[ciclo ${ciclos}] ponto novo, ${ultimo_pst}% apurado, ${pendentes} pendente(s)"
    else
      echo "[ciclo ${ciclos}] mesmo idg, nada a gravar"
    fi
  else
    echo "[ciclo ${ciclos}] falha na coleta, seguindo"
  fi
  rm -f "$saida"

  [ "$pendentes" -ge "$COMMITS_A_CADA" ] && commitar

  decorrido=$(( $(date +%s) - inicio ))
  espera=$(( INTERVALO_S - decorrido ))
  [ "$espera" -gt 0 ] && sleep "$espera"
done

commitar
echo "fim: ${ciclos} ciclos, ${gravados} pontos gravados, ultimo ${ultimo_pst}% apurado"
