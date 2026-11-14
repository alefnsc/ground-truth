# Consolidação para a Vocaid — nuances, cálculos e balizadores

> **Dated note, added 2026-11-13.** Internal memo committed on 2026-10-09, written from
> [`strategy.md`](strategy.md) for the author's separate commercial product, before the hackathon. Its
> present-tense statements describe plans, not this repository: the per-site deficit and the kcal display
> were not built, and two of its figures are corrected in
> [`packages/physics/README.md`](../packages/physics/README.md). See the root README. The text below is
> unchanged.

Resumo executivo da pesquisa do NASA Space Apps Challenge 2026 (*Create Health
Monitoring Software for Astronauts on Space Missions*), destilado para decisão
de produto na Vocaid. A fonte integral, com todas as citações, é
[`strategy.md`](strategy.md).

---

## A tese (uma frase)

**Energia e carga são grandezas diferentes; na Terra a gravidade as acopla e
todo modelo de fitness de consumo as confunde — em órbita o acoplamento quebra
e a confusão vira o bug.** O produto mede as duas moedas separadamente, com
gravidade e força aplicada pelo equipamento como propriedades de primeira
classe de cada sessão.

## Os cálculos desenvolvidos

1. **Estímulo diário de carga esquelética** (Carter/Whalen/Beaupré):
   `S_day = (Σᵢ nᵢ·σᵢ^m)^(1/m)`, com `m ≈ 4` — picos dominam, volume satura.
2. **Número-manchete — déficit acumulado por sítio ósseo**:
   `Deficit(T) = ∫₀ᵀ (S_earth_baseline − S_achieved(t)) dt`, priorizando colo
   femoral, trocânter, quadril total e coluna lombar.
   Âncora de calibração verificada: picos de força em órbita caem 65–77 % vs
   1 g (Genc 2010) — com `m = 4`, o gap em `S` é enorme. O demo é esse número.
3. **Energia por equipamento**, com specs verificadas:
   - ARED: `W = ∫(F_pneu(x) + F_flywheel(ẍ))dx`, excêntrico ≤ 0,90× — força
     **não constante** (termo inercial de até ≈893 N no pico).
   - **Correção de peso corporal** (a que torna a comparação entre gravidades
     possível): `F_total = F_device + m·g_env`.
   - Esteira T2: `F_eff = m·g_env + F_SLD` (harness em 70–80 % do peso 1 g).
   - Cicloergômetro: `P_actual = 0,98·P_displayed − 11,8 W` (CEVIS) — 16 % de
     erro numa prescrição de 75 W.
4. **Transição marcha–corrida por número de Froude**:
   `v = √(Fr·g·L)` — grandezas derivadas de marcha não escalam linearmente
   entre Terra/Lua/Marte.
5. **Kcal nunca re-derivada da mecânica**: kcal do dispositivo exibida
   **rotulada como modelo 1 g** ao lado do valor corrigido — exatamente a regra
   Vocaid existente ("a nota do dispositivo é do dispositivo").

## Os balizadores da pesquisa (direcionamento)

1. **Responder aos riscos nomeados no desafio** — perda óssea, eventos
   cardiovasculares, imunidade, saúde comportamental. Caloria corrigida é hook,
   não resposta.
2. **Autonomia da tripulação, não dashboard de solo** — "spotting these changes
   in themselves" + delay de comunicação de 4–24 min: inferência local, sync
   diferido (alinhado ao xEHR e à arquitetura ExMC HRP-48032 da NASA).
3. **Honestidade como critério pontuado** — todo número com fonte; limites de
   acesso a dados declarados; "load accounting", não inferência clínica; nunca
   treinar modelo em dados de voo (n=52, acesso sob DUA).
4. **Osso é o sistema que não se mede em voo** — DXA é instrumento de solo;
   logo, rastrear o *input* (carga) é o produto.
5. **Diferenciação explícita do EveryWear (ESA)**: câmera vs código de barras;
   modelagem vs registro; nenhum sistema voado tem modelo de gravidade.
6. **O incumbente é uma planilha**: o ARED não registra dados instrumentados
   desde 2011 — sessões são digitadas à mão no Excel. Daí
   `provenance.load_source: MANUAL_ENTRY` como default realista.
7. **Janelas de tendência derivadas da fisiologia**, não herdadas do app de
   consumo: HRV/sono/cognição 3–7 d; ppCO2 média de 7 d; fluido/PA semanas;
   osso meses.

## Nuances que custaram caro (não repetir)

- **[pre-ARED] vs hoje**: a perda de 1,4–1,5 %/mês no quadril é da era iRED;
  com ARED + nutrição a DMO por DXA fica estável (proteção *parcial* — DXA não
  vê o trabecular, onde a perda concentra 5:1). Citar o número antigo como
  atual é o erro mais comum — esteve no nosso primeiro rascunho.
- **Direção da FC em voo é contestada** — mostrar tendência contra a baseline
  pré-voo do próprio tripulante; não afirmar direção populacional.
- **Nutrição invertida**: ferro é **teto** (≤8 mg/d, hemólise contínua), não
  meta; sódio restrito (1500–2300 mg/d) ligado direto ao modelo ósseo. Tracker
  convencional sinaliza a direção errada — argumento central para levar o
  food-from-photo da Vocaid.
- **Não existe dataset público de vitais de astronauta** — dizer isso
  explicitamente vale pontos (Validity). Usáveis já: OSD-575, OSD-942/946,
  RadLab, MMASH/LifeSnaps/PRCP como stand-ins (~3,4 GB, abertos).
- **Twins Study não é público** (o OS-826 do OSDR é estudo em roedores);
  evitar `hrv-analysis` (GPLv3) em qualquer código distribuído.

## O que da Vocaid transfere / quebra

- **Transfere sem mudança**: FC de repouso noturna, HRV, FR, sono, SpO2, PA,
  CGM, temperatura de pele, food-from-photo até micronutrientes; o share
  profissional consentido vira o link com o flight surgeon; o conector MCP
  re-apontado para assistente local.
- **Quebra (modelos 1 g)**: passos, pisos, GPS, peso de balança, VO2max e todo
  composite proprietário — exibidos rotulados como 1 g, ao lado do corrigido.
- **Novo e obrigatório**: ambiente (ppCO2, radiação, luz), massa via SLAMMD,
  cognição (WinSCAT), visão (SANS), marcadores de turnover ósseo,
  comportamental — os dois domínios que a maioria dos times vai ignorar.

## Datas que podem invalidar partes do brief

- **28 out 2026** — enunciado completo + datasets sugeridos pela NASA (revisar §6).
- **13 nov 2026** — guia de julgamento (confirmar redação de "Influence").
- **14–15 nov 2026** — hackathon.
