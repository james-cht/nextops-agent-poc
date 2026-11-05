import { Duplex } from 'stream';
import * as net from 'net';
import mysql from 'mysql2/promise';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { isMysqlProxyEnabled } from '$lib/server/mysql-proxy';

class HttpConnectTunnel extends Duplex {
  private proxySocket: net.Socket;
  private connected = false;
  private writeBuffer: Array<{ chunk: any; encoding: string; callback: (error?: Error | null) => void }> = [];
  private handshakeBuffer = '';

  constructor(proxyHost: string, proxyPort: number, dbHost: string, dbPort: number) {
    super();

    // Create connection to the proxy
    this.proxySocket = net.connect({ host: proxyHost, port: proxyPort });

    // Handle initial connection to the proxy
    this.proxySocket.on('connect', () => {
      const connectHeader = `CONNECT ${dbHost}:${dbPort} HTTP/1.1\r\n` +
                            `Host: ${dbHost}:${dbPort}\r\n\r\n`;
      this.proxySocket.write(connectHeader);
    });

    // Handle data from proxy
    this.proxySocket.on('data', (data) => {
      if (this.connected) {
        // Forward directly to mysql2
        if (!this.push(data)) {
          this.proxySocket.pause();
        }
      } else {
        // Parse handshake response
        this.handshakeBuffer += data.toString('binary');
        let headerEndIndex = this.handshakeBuffer.indexOf('\r\n\r\n');
        let delimiterLength = 4;
        if (headerEndIndex === -1) {
          headerEndIndex = this.handshakeBuffer.indexOf('\n\n');
          delimiterLength = 2;
        }

        if (headerEndIndex !== -1) {
          const headers = this.handshakeBuffer.substring(0, headerEndIndex);
          const lines = headers.split(/\r?\n/);
          const statusLine = lines[0];

          // Check if status code is 200
          if (statusLine.includes(' 200 ')) {
            this.connected = true;

            // Forward any extra data that arrived after the headers
            const extraDataBinary = this.handshakeBuffer.substring(headerEndIndex + delimiterLength);
            if (extraDataBinary.length > 0) {
              const extraBuffer = Buffer.from(extraDataBinary, 'binary');
              if (!this.push(extraBuffer)) {
                this.proxySocket.pause();
              }
            }

            // Flush buffered writes
            for (const { chunk, encoding, callback } of this.writeBuffer) {
              this.proxySocket.write(chunk, encoding, callback);
            }
            this.writeBuffer = [];
          } else {
            this.destroy(new Error(`Proxy connection failed: ${statusLine}`));
          }
        }
      }
    });

    this.proxySocket.on('end', () => {
      this.push(null);
    });

    this.proxySocket.on('error', (err) => {
      this.destroy(err);
    });

    this.proxySocket.on('close', () => {
      this.destroy();
    });
  }

  _read(size: number) {
    if (this.connected) {
      this.proxySocket.resume();
    }
  }

  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    if (!this.connected) {
      this.writeBuffer.push({ chunk, encoding, callback });
    } else {
      this.proxySocket.write(chunk, encoding, callback);
    }
  }

  _destroy(err: Error | null, callback: (error: Error | null) => void) {
    this.proxySocket.destroy();
    callback(err);
  }

  // Forward optional socket methods so mysql2 doesn't fail if it tries to call them
  setTimeout(timeout: number, callback?: () => void) {
    this.proxySocket.setTimeout(timeout, callback);
    return this;
  }

  setKeepAlive(enable?: boolean, initialDelay?: number) {
    this.proxySocket.setKeepAlive(enable, initialDelay);
    return this;
  }

  setNoDelay(noDelay?: boolean) {
    this.proxySocket.setNoDelay(noDelay);
    return this;
  }

  ref() {
    this.proxySocket.ref();
    return this;
  }

  unref() {
    this.proxySocket.unref();
    return this;
  }

  get remoteAddress() {
    return this.proxySocket.remoteAddress;
  }

  get remotePort() {
    return this.proxySocket.remotePort;
  }

  get localAddress() {
    return this.proxySocket.localAddress;
  }

  get localPort() {
    return this.proxySocket.localPort;
  }
}

const dbHost = privateEnv.DB_HOST ?? '';
const dbPort = parseInt(privateEnv.DB_PORT || '3306', 10);
const dbUser = privateEnv.DB_USER ?? '';
const dbPassword = privateEnv.DB_PASSWORD ?? '';
const dbName = privateEnv.DB_NAME ?? '';
const proxyHost = publicEnv.PUBLIC_DEFAULT_PROXY_HOST ?? '';
const proxyPort = parseInt(publicEnv.PUBLIC_DEFAULT_PROXY_PORT || '808', 10);

function openMysqlTransportFor(targetHost: string, targetPort: number): Duplex {
  // Preference checked per connection so admin toggle applies without process restart.
  if (isMysqlProxyEnabled()) {
    return new HttpConnectTunnel(proxyHost, proxyPort, targetHost, targetPort);
  }
  return net.connect({ host: targetHost, port: targetPort });
}

export function createMysqlPool(opts: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
}): mysql.Pool {
  return mysql.createPool({
    host: opts.host,
    port: opts.port,
    user: opts.user,
    password: opts.password,
    database: opts.database,
    waitForConnections: true,
    connectionLimit: opts.connectionLimit ?? 10,
    queueLimit: 0,
    // Always use a stream factory so MySQL proxy can be toggled independently of
    // PUBLIC_DEFAULT_PROXY_ENABLED (fetch / Prometheus / ES). Default = direct TCP.
    stream: () => openMysqlTransportFor(opts.host, opts.port),
  });
}

export const pool = createMysqlPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
});

