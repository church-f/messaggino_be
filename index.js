const express = require("express");
const fs = require("fs");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = 3002;

// Middleware per il parsing del JSON
app.use(express.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

// Percorso del file JSON
const dataFile = "./data.json";

// Creazione del WebSocket Server
const wss = new WebSocketServer({ port: 3001 }); // WebSocket su una porta separata

// Registro delle connessioni WebSocket
const connectedDevices = new Map(); // Chiave: macAddress, Valore: ws connection

// Gestione connessione WebSocket
wss.on("connection", (ws) => {
  console.log("Nuovo dispositivo connesso via WebSocket");

  // Assegna un evento per gestire i messaggi ricevuti dall'ESP32
  ws.on("message", (message) => {
    console.log(`Messaggio ricevuto: ${message}`);

    try {
      const data = JSON.parse(message);

      if (data.macAddress) {
        let dataFileRead = JSON.parse(fs.readFileSync(dataFile, "utf8"));
        const device = dataFileRead.devices.find(
          (d) => d.macAddress === data.macAddress
        );

        if (device) {
          const initialMessage = JSON.stringify({
            macAddress: device.macAddress,
            lastMessage: device.lastMessage,
            r: device.r,
            g: device.g,
            b: device.b,
            sound: device.sound,
          });

          // Invia i dati iniziali
          ws.send(initialMessage);
          console.log(
            `Inviati i dati iniziali al dispositivo con MAC ${device.macAddress}`
          );
        } else {
          console.log(`Dispositivo con MAC ${data.macAddress} non trovato.`);
        }

        // Registra il dispositivo con il suo macAddress
        connectedDevices.set(data.macAddress, ws);
        console.log(`Dispositivo registrato: ${data.macAddress}`);
      }
    } catch (error) {
      console.error("Errore nel parsing del messaggio:", error);
    }
  });

  // Gestione della disconnessione
  ws.on("close", () => {
    for (const [macAddress, socket] of connectedDevices.entries()) {
      if (socket === ws) {
        connectedDevices.delete(macAddress);
        console.log(`Dispositivo disconnesso: ${macAddress}`);
        break;
      }
    }
  });
});

// Endpoint POST per aggiornare il campo lastMessage
app.post("/device/update", (req, res) => {
  const { username, message } = req.body;

  if (!username || !message) {
    return res
      .status(400)
      .json({ error: "Dati mancanti: username e/o message" });
  }

  // Leggi i dati dal file JSON
  fs.readFile(dataFile, "utf8", (err, data) => {
    if (err) {
      console.error("Errore durante la lettura del file JSON:", err);
      return res.status(500).json({ error: "Errore del server" });
    }

    try {
      const jsonData = JSON.parse(data);

      // Trova l'utente che ha effettuato la chiamata
      const user = jsonData.users.find((user) => user.username === username);

      if (!user) {
        return res.status(404).json({ error: "Utente non trovato" });
      }

      // Trova il dispositivo associato all'utente indicato in associatedUser
      const device = jsonData.devices.find(
        (device) => device.userAssociated === user.associatedUser
      );

      if (!device) {
        return res
          .status(404)
          .json({ error: "Dispositivo associato non trovato" });
      }

      // Aggiorna il campo lastMessage del dispositivo
      device.lastMessage = message;

      // Salva il file JSON aggiornato
      fs.writeFile(dataFile, JSON.stringify(jsonData, null, 2), (writeErr) => {
        if (writeErr) {
          console.error(
            "Errore durante il salvataggio del file JSON:",
            writeErr
          );
          return res.status(500).json({ error: "Errore del server" });
        }

        // Invia i dati aggiornati al dispositivo corretto tramite WebSocket
        const targetSocket = connectedDevices.get(device.macAddress);

        if (targetSocket && targetSocket.readyState === 1) {
          // 1 = WebSocket OPEN
          targetSocket.send(
            JSON.stringify({
              macAddress: device.macAddress,
              lastMessage: device.lastMessage,
              r: device.r,
              g: device.g,
              b: device.b,
              sound: device.sound,
            })
          );
          console.log(
            `Dati inviati al dispositivo ${device.macAddress} tramite WebSocket`
          );
        } else {
          console.log(
            `Dispositivo ${device.macAddress} non connesso via WebSocket`
          );
        }

        res.json({
          message: "Messaggio aggiornato con successo",
          device: {
            macAddress: device.macAddress,
            lastMessage: device.lastMessage,
          },
        });
      });
    } catch (parseError) {
      console.error("Errore durante il parsing del file JSON:", parseError);
      res.status(500).json({ error: "Errore del server" });
    }
  });
});

// Avvia il server HTTP
app.listen(PORT, () => {
  console.log(`Server HTTP in esecuzione su http://localhost:${PORT}`);
});

// WebSocket server
console.log("WebSocket Server in ascolto su ws://localhost:3001");


