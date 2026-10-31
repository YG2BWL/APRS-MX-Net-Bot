const net = require('net');
const express = require('express');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { saveCheckin, getCheckins, getCheckinByCode } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Bot APRS
const BOT_CALLSIGN = process.env.BOT_CALLSIGN || "YH2BC-10";
const APRS_PASSCODE = process.env.APRS_PASSCODE || "-1"; // Ganti dengan passcode valid
const APRS_SERVER = "rotate.aprs2.net";
const APRS_PORT = 14580;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// 1. KONEKSI & LOGIKA APRS-IS BOT
// -------------------------------------------------------------
function startAPRSClient() {
  const client = new net.Socket();

  client.connect(APRS_PORT, APRS_SERVER, () => {
    console.log(`[APRS] Terhubung ke ${APRS_SERVER}:${APRS_PORT}`);
    // Login filter khusus untuk menerima pesan (message) ke Call Sign Bot
    const loginString = `user ${BOT_CALLSIGN} pass ${APRS_PASSCODE} vers NodeAPRSBot 1.0 filter g/${BOT_CALLSIGN}\r\n`;
    client.write(loginString);
  });

  client.on('data', (data) => {
    const rawMsg = data.toString();
    console.log('[APRS RAW]', rawMsg);

    // Format APRS Message: SENDER>DEST,PATH::TARGET   :TEXT{ID
    if (rawMsg.includes(`::${BOT_CALLSIGN.padEnd(9, ' ')}:`)) {
      const match = rawMsg.match(/^([A-Z0-9\-]+)>.*::[A-Z0-9\- ]{9}:(.*)$/);
      if (match) {
        const sender = match[1].trim();
        const body = match[2].trim();

        // Format check-in: CNET <Pesan/Nama/Lokasi>
        if (body.toUpperCase().startsWith("CNET")) {
          const comment = body.substring(4).trim() || "Check-in Net APRS";
          const record = saveCheckin(sender, comment);

          // Balas via APRS Message
          const replyText = `[BOT] TKS CHECKIN! Download eQSL anda dengan kode: ${record.qsl_code}`;
          sendAPRSMessage(client, sender, replyText);
        }
      }
    }
  });

  client.on('close', () => {
    console.log('[APRS] Koneksi terputus. Mencoba reconnect dalam 10 detik...');
    setTimeout(startAPRSClient, 10000);
  });

  client.on('error', (err) => {
    console.error('[APRS ERROR]', err.message);
  });
}

function sendAPRSMessage(socket, targetCallsign, message) {
  const formattedTarget = targetCallsign.padEnd(9, ' ');
  const packet = `${BOT_CALLSIGN}>APRS,TCPIP*::${formattedTarget}:${message}\r\n`;
  socket.write(packet);
}

startAPRSClient();

// -------------------------------------------------------------
// 2. LANDING PAGE & DASHBOARD CHECK-IN
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const checkins = getCheckins();
  res.render('index', { checkins });
});

// -------------------------------------------------------------
// 3. GENERATOR eQSL CARD (IMAGE RENDER)
// -------------------------------------------------------------
app.get('/download-qsl/:code', async (req, res) => {
  const data = getCheckinByCode(req.params.code);
  if (!data) return res.status(404).send('Kode eQSL tidak ditemukan.');

  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext('2d');

  // Background eQSL Card
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 800, 500);

  // Bingkai
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, 760, 460);

  // Teks Header & Detail Check-in
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('APRS MX NET eQSL CARD', 50, 80);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`CALLSIGN : ${data.callsign}`, 50, 160);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '20px sans-serif';
  ctx.fillText(`DATE/TIME : ${new Date(data.timestamp).toUTCString()}`, 50, 210);
  ctx.fillText(`COMMENT   : ${data.comment}`, 50, 260);
  ctx.fillText(`QSL CODE  : ${data.qsl_code}`, 50, 310);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'italic 16px sans-serif';
  ctx.fillText('Verified by APRS MX Net Automatic Gateway Engine', 50, 430);

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename=eQSL_${data.callsign}.png`);
  canvas.createPNGStream().pipe(res);
});

app.listen(PORT, () => {
  console.log(`[WEB SERVER] Berjalan pada port ${PORT}`);
});