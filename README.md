# GenSnooker

Aplicacao full-stack para sinuca brasileira com:
- placar e regras base
- monitoramento por camera
- automacao por OpenCV.js (pontuacao/falta por heuristica)
- persistencia de partidas e log no Postgres

## Variaveis de ambiente

- `PORT=8080`
- `DATABASE_URL=postgres://USUARIO:SENHA@HOST:PORTA/BANCO?sslmode=disable`
- `FORCE_HTTPS=true` em producao com dominio
- `PGSSL=true` apenas se seu Postgres exigir SSL no driver

Use no EasyPanel a URL interna do banco que voce enviou (service-to-service), no formato:
`postgres://gensnooker:***@genfin_gensnooker-db:5432/gensnooker-db?sslmode=disable`

## Rodar local

1. Instale dependencias: `npm install`
2. Configure `DATABASE_URL`
3. Rode: `npm start`
4. Abra: `http://localhost:8080`

## Deploy no EasyPanel

1. Crie app `Source/Git` apontando para este repositorio.
2. Build com `Dockerfile` da raiz.
3. Defina variaveis:
- `DATABASE_URL` com seu Postgres
- `FORCE_HTTPS=true`
4. Exponha a porta `8080`.
5. Adicione dominio final e ative SSL/Let's Encrypt.
6. Em regras do dominio, force redirect HTTP -> HTTPS.

## Validacao producao

- `GET /health` deve retornar `{ "ok": true, "db": true }`
- Abra o dominio HTTPS e permita camera.
- Inicie partida e confirme gravacao de eventos/placar no banco.

## Observacoes sobre automacao OpenCV

- A deteccao usa faixa HSV + HoughCircles (heuristica).
- Iluminacao, reflexo e cor do pano afetam acuracia.
- Recomendado usar como arbitragem assistida e ajustar thresholds em campo.