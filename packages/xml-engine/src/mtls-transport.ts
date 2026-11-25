import type {
  MtlsRequestOptions,
  MtlsResponse,
  MtlsTransport,
} from '@nfse-hub/nfse-types';
import * as https from 'node:https';
import { URL } from 'node:url';

/**
 * Implementação padrão Node.js de transporte HTTPS com autenticação mútua TLS (mTLS)
 * usando certificado A1 carregado estritamente em memória.
 */
export class NodeMtlsTransport implements MtlsTransport {
  async request(options: MtlsRequestOptions): Promise<MtlsResponse> {
    const parsedUrl = new URL(options.url);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(
        `NodeMtlsTransport exige protocolo HTTPS (recebido: ${parsedUrl.protocol}).`,
      );
    }

    const agent = new https.Agent({
      pfx: options.certificate.pfxBuffer,
      passphrase: options.certificate.passphrase,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: options.rejectUnauthorized ?? true,
      ...(options.ca ? { ca: options.ca } : {}),
      keepAlive: false,
    });

    const timeoutMs = options.timeoutMs ?? 30000;

    return new Promise<MtlsResponse>((resolve, reject) => {
      const req = https.request(
        parsedUrl,
        {
          method: options.method ?? 'POST',
          headers: options.headers,
          agent,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            agent.destroy();
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(
          new Error(`Timeout mTLS após ${timeoutMs}ms em ${parsedUrl.hostname}`),
        );
      });

      req.on('error', (err) => {
        agent.destroy();
        reject(err);
      });

      if (options.body !== undefined) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

