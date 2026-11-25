import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as tls from 'node:tls';
import * as forge from 'node-forge';

export interface InspectedPfxResult {
  subjectName: string;
  subjectDocument: string;
  issuerName: string;
  serialNumber: string;
  fingerprint: string;
  validFrom: Date;
  expiresAt: Date;
  supportsDigitalSignature: boolean;
  supportsClientAuth: boolean;
}

@Injectable()
export class PfxInspectorService {
  inspect(pfxBuffer: Buffer, passphrase: string): InspectedPfxResult {
    if (!pfxBuffer || pfxBuffer.length === 0) {
      throw new BadRequestException('Arquivo de certificado (.pfx/.p12) vazio.');
    }

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      const der = forge.util.createBuffer(pfxBuffer.toString('binary'));
      const asn1 = forge.asn1.fromDer(der);
      p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
    } catch {
      throw new BadRequestException(
        'Não foi possível abrir o certificado A1. Verifique se o arquivo é PKCS#12 (.pfx/.p12) válido e se a senha está correta.',
      );
    }

    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ?? []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[
        forge.pki.oids.keyBag
      ] ?? []),
    ];

    if (keyBags.length === 0 || !keyBags[0]?.key) {
      throw new BadRequestException(
        'O arquivo enviado não contém chave privada (necessária para certificado A1).',
      );
    }

    const certBags =
      p12.getBags({ bagType: forge.pki.oids.certBag })[
        forge.pki.oids.certBag
      ] ?? [];

    const certs = certBags
      .map((bag) => ({
        cert: bag.cert,
        localKeyId: bag.attributes?.localKeyId?.[0],
      }))
      .filter(
        (item): item is { cert: forge.pki.Certificate; localKeyId: unknown } =>
          Boolean(item.cert),
      );

    if (certs.length === 0) {
      throw new BadRequestException(
        'Nenhum certificado X.509 encontrado dentro do arquivo PKCS#12.',
      );
    }

    const keyLocalId = keyBags[0]?.attributes?.localKeyId?.[0];
    const leafEntry =
      (keyLocalId
        ? certs.find((c) => c.localKeyId === keyLocalId)
        : undefined) ??
      certs.find((c) => !this.isCaCert(c.cert)) ??
      certs[0];

    const cert = leafEntry.cert;
    const validFrom = cert.validity.notBefore;
    const expiresAt = cert.validity.notAfter;

    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        `Certificado digital expirado em ${expiresAt.toISOString()}.`,
      );
    }

    // Valida compatibilidade direta com TLS/mTLS do Node.js
    this.verifyNodeTlsContext(pfxBuffer, passphrase);

    const subjectName = this.getAttributeValue(cert.subject.attributes, 'CN') ?? 'Desconhecido';
    const issuerName = this.getAttributeValue(cert.issuer.attributes, 'CN') ?? 'Desconhecido';
    const subjectDocument = this.extractIcpBrasilDocument(cert, subjectName);

    const certDerBytes = forge.asn1
      .toDer(forge.pki.certificateToAsn1(cert))
      .getBytes();
    const fingerprint = crypto
      .createHash('sha256')
      .update(Buffer.from(certDerBytes, 'binary'))
      .digest('hex');

    const keyUsageExt = cert.getExtension('keyUsage') as
      | { digitalSignature?: boolean }
      | undefined;
    const extKeyUsageExt = cert.getExtension('extKeyUsage') as
      | { clientAuth?: boolean }
      | undefined;

    return {
      subjectName,
      subjectDocument,
      issuerName,
      serialNumber: cert.serialNumber,
      fingerprint,
      validFrom,
      expiresAt,
      supportsDigitalSignature: Boolean(keyUsageExt?.digitalSignature ?? true),
      supportsClientAuth: Boolean(extKeyUsageExt?.clientAuth ?? true),
    };
  }

  verifyNodeTlsContext(pfxBuffer: Buffer, passphrase: string): void {
    try {
      tls.createSecureContext({
        pfx: pfxBuffer,
        passphrase,
      });
    } catch (error) {
      throw new BadRequestException(
        `Falha ao carregar contexto TLS/mTLS para este certificado A1: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
      );
    }
  }

  matchesCompanyDocument(
    certDocument: string,
    companyDocument: string,
  ): boolean {
    const certDigits = certDocument.replace(/\D/g, '');
    const companyDigits = companyDocument.replace(/\D/g, '');

    if (!certDigits || !companyDigits) {
      return false;
    }

    if (certDigits.length === 14 && companyDigits.length === 14) {
      // Conforme Manual v1.01 seção 7.3.2: aceita matriz ou estabelecimento da mesma raiz CNPJ
      return certDigits.slice(0, 8) === companyDigits.slice(0, 8);
    }

    return certDigits === companyDigits;
  }

  private isCaCert(cert: forge.pki.Certificate): boolean {
    const basicConstraints = cert.getExtension('basicConstraints') as
      | { cA?: boolean }
      | undefined;
    return Boolean(basicConstraints?.cA);
  }

  private getAttributeValue(
    attributes: forge.pki.CertificateField[],
    shortName: string,
  ): string | undefined {
    const attr = attributes.find((item) => item.shortName === shortName);
    return typeof attr?.value === 'string' ? attr.value : undefined;
  }

  private extractIcpBrasilDocument(
    cert: forge.pki.Certificate,
    subjectName: string,
  ): string {
    const sanExt = cert.getExtension('subjectAltName') as
      | { altNames?: Array<{ type: number; value?: unknown }> }
      | undefined;

    if (sanExt?.altNames) {
      for (const alt of sanExt.altNames) {
        if (alt.type === 0 && typeof alt.value === 'string') {
          const digits = this.extractDigitsFromAsn1OrText(alt.value);
          if (digits) {
            return digits;
          }
        }
      }
    }

    // Fallback padrão ICP-Brasil no CN: "NOME EMPRESARIAL:12345678000199"
    const cnMatch = subjectName.match(/:(\d{11}|\d{14})\b/);
    if (cnMatch?.[1]) {
      return cnMatch[1];
    }

    throw new BadRequestException(
      'Não foi possível identificar o CNPJ ou CPF no certificado ICP-Brasil.',
    );
  }

  private extractDigitsFromAsn1OrText(raw: string): string | null {
    // Tenta extrair sequências ASCII de 14 (CNPJ) ou 11 (CPF) dígitos
    const cnpjMatch = raw.match(/\d{14}/);
    if (cnpjMatch) {
      return cnpjMatch[0];
    }
    const cpfMatch = raw.match(/\d{11}/);
    if (cpfMatch) {
      return cpfMatch[0];
    }
    return null;
  }
}

