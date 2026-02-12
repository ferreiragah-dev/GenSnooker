# GenSnooker

App web para sinuca brasileira com:
- placar da partida
- regras base da modalidade
- uso da camera para monitorar movimento na mesa
- log de eventos de jogo

## Como executar localmente

1. Abra `index.html` em um navegador moderno (Chrome, Edge ou Firefox).
2. Clique em **Ligar camera** e permita acesso.
3. Inicie a partida e use os controles para registrar jogadas.

## Deploy no Easypanel

Este repositorio ja esta preparado para deploy via Docker:
- `Dockerfile`
- `nginx.conf`
- `.dockerignore`

### Passo a passo

1. No Easypanel, crie um novo app do tipo **Source / Git**.
2. Aponte para este repositorio.
3. Build type: **Dockerfile** (raiz do projeto).
4. Porta do container: **80**.
5. Configure dominio e ative SSL (HTTPS).
6. Publique o app.

### Validacao

- URL principal deve abrir a interface do GenSnooker.
- Healthcheck opcional: `https://SEU_DOMINIO/health` deve retornar `ok`.

## Observacoes importantes

- O monitoramento por camera usa deteccao de movimento por diferenca entre frames.
- Para camera funcionar fora de localhost, o navegador exige **HTTPS**.
- As regras podem variar por regiao. A tela mostra um conjunto base e o placar pode ser ajustado manualmente.
