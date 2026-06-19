# Mesa Nostalgia

Prototipo web offline de um jogo de cartas de descarte, feito para testar a sensacao de uma mesa mobile antes de levar para Android.

## Como testar

Abra `index.html` no navegador. Nao precisa instalar dependencias nem rodar servidor.

## O que ja tem

- Menu inicial.
- 1 jogador humano e 3 bots.
- Baralho com quatro cores, numeros, pular, inverter, +2, coringa e +4.
- Compra de cartas bloqueada quando o jogador ainda tem uma jogada possivel.
- Regra de descarte por mesma cor, mesmo numero, mesmo simbolo de acao ou coringa.
- Indicador na mesa mostra se o jogo segue para a direita ou para a esquerda.
- `+2` acumulativo.
- `+4` so fica jogavel quando o jogador nao tem carta da cor atual.
- `+4` acumulativo: se o proximo jogador tiver outro `+4`, ele pode jogar, escolher nova cor e somar a penalidade.
- Regra Jump: uma carta identica a carta recem-jogada pode entrar fora da vez antes da proxima jogada.
- Jump e opcional; bots podem escolher entrar ou deixar passar.
- Efeito visual `JUMP!` mostra quem entrou na rodada.
- Escolha de cor ao jogar coringas com seletor em pizza mais legivel.
- Animacao 3D em arco para descarte e compra do monte.
- Encaixe visual quando a carta chega na mao ou na pilha da mesa.
- Encaixe de descarte varia conforme o jogador que jogou a carta.
- Carta descartada agora e a propria carta da pilha sendo animada, sem troca visual.
- Pilha da mesa renderiza ate as ultimas 10 cartas.
- Som sintetico curto para compra e descarte de cartas.
- Rolagem lateral da mao por proximidade do mouse nas bordas.
- Pilha central mostrando a carta atual e cartas anteriores atras.
- Monte posicionado no canto inferior esquerdo.
- Mesa responsiva pensada primeiro para celular.

## Proximos passos

- Melhorar a inteligencia dos bots.
- Adicionar botao/estado de "uma carta".
- Criar sons e animacoes proprias.
- Salvar placar local.
- Empacotar para Android com Capacitor quando a versao web estiver divertida.
