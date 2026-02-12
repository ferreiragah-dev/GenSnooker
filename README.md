# FaceCompare

Software comparador de rostos executado no navegador.

## Recursos

- Upload de duas imagens (Rosto A e Rosto B)
- Deteccao facial por IA (TensorFlow.js + Face Mesh)
- Comparacao por similaridade vetorial
- Limiar ajustavel para decisao
- Overlay com bounding box e pontos faciais

## Rodar local

1. `npm install`
2. `npm start`
3. Abra `http://localhost:8080`

## Deploy EasyPanel

1. Build com o `Dockerfile` da raiz.
2. Defina:
- `PORT=8080`
- `FORCE_HTTPS=true` (producao)
3. Exponha porta `8080`.
4. Teste `GET /health`.

## Aviso

Comparacao facial e probabilistica e pode falhar com baixa luz, pose extrema ou oclusao. Nao use como fator unico em cenarios criticos de seguranca.