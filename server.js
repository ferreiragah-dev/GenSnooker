const path = require('path');
const express = require('express');

const app = express();
const port = Number(process.env.PORT || 8080);
const forceHttps = process.env.FORCE_HTTPS === 'true';

app.enable('trust proxy');

if (forceHttps) {
  app.use((req, res, next) => {
    const proto = req.header('x-forwarded-proto');
    if (req.secure || proto === 'https') {
      next();
      return;
    }

    const host = req.header('host');
    res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
  console.log(`FaceCompare rodando na porta ${port}`);
});