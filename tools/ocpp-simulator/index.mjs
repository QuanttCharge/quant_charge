/**
 * OCPP 1.6J charge-point simulator for Flow 1 (RemoteStart) / Flow 2 (RemoteStop).
 *
 * Usage:
 *   node tools/ocpp-simulator/index.mjs
 *   CHARGER_ID=CHG001 OCPP_WS=ws://localhost:9000/ocpp node tools/ocpp-simulator/index.mjs
 */
import { randomUUID } from 'node:crypto';

const CHARGER_ID = process.env.CHARGER_ID ?? 'CHG001';
const BASE = process.env.OCPP_WS ?? 'ws://localhost:9000/ocpp';
const ID_TAG = process.env.ID_TAG ?? 'SIM-DRIVER';
const URL = `${BASE.replace(/\/$/, '')}/${CHARGER_ID}`;

let ocppTxId = null;
let meterWh = 0;
let charging = false;
let meterTimer = null;

function send(ws, frame) {
  const raw = JSON.stringify(frame);
  ws.send(raw);
  console.log('>>', raw.slice(0, 200));
}

function call(ws, action, payload) {
  const uid = randomUUID();
  send(ws, [2, uid, action, payload]);
  return uid;
}

function callResult(ws, uniqueId, payload) {
  send(ws, [3, uniqueId, payload]);
}

function startCharging(ws, connectorId) {
  if (charging) return;
  charging = true;
  meterWh = 1000;
  const uid = call(ws, 'StartTransaction', {
    connectorId,
    idTag: ID_TAG,
    meterStart: meterWh,
    timestamp: new Date().toISOString(),
  });
  void uid;
  // transactionId comes from CallResult — handled in onmessage
}

function stopCharging(ws) {
  if (!charging || ocppTxId == null) return;
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  call(ws, 'StopTransaction', {
    transactionId: ocppTxId,
    meterStop: meterWh,
    timestamp: new Date().toISOString(),
    idTag: ID_TAG,
    reason: 'Remote',
  });
  charging = false;
  ocppTxId = null;
}

function scheduleMeters(ws, connectorId) {
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = setInterval(() => {
    if (!charging || ocppTxId == null) return;
    meterWh += 150; // ~0.15 kWh per tick
    call(ws, 'MeterValues', {
      connectorId,
      transactionId: ocppTxId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            {
              value: String(meterWh),
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
            },
            { value: '7.2', measurand: 'Power.Active.Import', unit: 'kW' },
          ],
        },
      ],
    });
  }, 5000);
}

console.log(`Connecting ${URL} ...`);
const ws = new WebSocket(URL, ['ocpp1.6']);

ws.addEventListener('open', () => {
  console.log('connected');
  call(ws, 'BootNotification', {
    chargePointVendor: 'QuantSim',
    chargePointModel: 'SIM-22kW',
    firmwareVersion: '0.1.0',
  });
  call(ws, 'StatusNotification', {
    connectorId: 0,
    errorCode: 'NoError',
    status: 'Available',
  });
  call(ws, 'StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Available',
  });
  setInterval(() => {
    call(ws, 'Heartbeat', {});
  }, 30_000);
});

ws.addEventListener('message', (ev) => {
  const raw = String(ev.data);
  console.log('<<', raw.slice(0, 240));
  let frame;
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }
  const msgType = frame[0];

  if (msgType === 3) {
    // CallResult for our outbound Call
    const payload = frame[2] ?? {};
    if (payload.transactionId != null && charging && ocppTxId == null) {
      ocppTxId = payload.transactionId;
      console.log('StartTransaction accepted, ocppTxId=', ocppTxId);
      scheduleMeters(ws, 1);
    }
    return;
  }

  if (msgType !== 2) return;

  const uniqueId = frame[1];
  const action = frame[2];
  const payload = frame[3] ?? {};

  if (action === 'RemoteStartTransaction') {
    callResult(ws, uniqueId, { status: 'Accepted' });
    call(ws, 'StatusNotification', {
      connectorId: payload.connectorId ?? 1,
      errorCode: 'NoError',
      status: 'Preparing',
    });
    setTimeout(() => {
      startCharging(ws, payload.connectorId ?? 1);
      call(ws, 'StatusNotification', {
        connectorId: payload.connectorId ?? 1,
        errorCode: 'NoError',
        status: 'Charging',
      });
    }, 500);
    return;
  }

  if (action === 'RemoteStopTransaction') {
    callResult(ws, uniqueId, { status: 'Accepted' });
    stopCharging(ws);
    call(ws, 'StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Finishing',
    });
    setTimeout(() => {
      call(ws, 'StatusNotification', {
        connectorId: 1,
        errorCode: 'NoError',
        status: 'Available',
      });
    }, 800);
    return;
  }

  if (action === 'ReserveNow') {
    callResult(ws, uniqueId, { status: 'Accepted' });
    return;
  }

  if (action === 'Reset' || action === 'UnlockConnector' || action === 'ChangeAvailability') {
    callResult(ws, uniqueId, { status: 'Accepted' });
    return;
  }

  // Unknown CSMS Call — reject politely
  callResult(ws, uniqueId, { status: 'Rejected' });
});

ws.addEventListener('close', () => {
  console.log('disconnected');
  if (meterTimer) clearInterval(meterTimer);
  process.exit(0);
});

ws.addEventListener('error', (err) => {
  console.error('ws error', err.message ?? err);
});
