import type { DecryptedCertificateMaterial } from '@nfse-hub/nfse-types';
import { DOMParser } from '@xmldom/xmldom';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

export interface PemCertificatePair {
  privateKeyPem: string;
  certificatePem: string;
}

/**
 * Extrai chave privada e certificado folha em PEM estritamente em memória
 * a partir de um PKCS#12 (.pfx) descriptografado.
 */
export function extractPemFromPfx(
  material: Pick<DecryptedCertificateMaterial, 'pfxBuffer' | 'passphrase'>,
): PemCertificatePair {
  const der = forge.util.createBuffer(material.pfxBuffer.toString('binary'));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, material.passphrase);

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[
      forge.pki.oids.keyBag
    ] ?? []),
  ];

  const keyBag = keyBags.find((bag) => Boolean(bag.key));
  if (!keyBag?.key) {
    throw new Error('Chave privada não encontrada no certificado PFX.');
  }

  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ??
    [];
  const keyLocalId = keyBag.attributes?.localKeyId?.[0];

  const certBag =
    (keyLocalId
      ? certBags.find(
          (b) => b.cert && b.attributes?.localKeyId?.[0] === keyLocalId,
        )
      : undefined) ?? certBags.find((b) => Boolean(b.cert));

  if (!certBag?.cert) {
    throw new Error('Certificado X.509 não encontrado no arquivo PFX.');
  }

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(certBag.cert),
  };
}

/**
 * Assinador XMLDSig compatível com a Seção 7.3.3 do Manual v1.01:
 * - C14N: http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 * - SignatureMethod: http://www.w3.org/2000/09/xmldsig#rsa-sha1
 * - Transforms: enveloped-signature + REC-xml-c14n-20010315
 * - DigestMethod: sha1
 * - KeyInfo contendo exclusivamente X509Data/X509Certificate
 */
export class XmlDsigSigner {
  signXml(params: {
    xml: string;
    referenceTag: string;
    certificate: Pick<DecryptedCertificateMaterial, 'pfxBuffer' | 'passphrase'>;
    locationAction?: 'after' | 'append';
  }): string {
    const pem = extractPemFromPfx(params.certificate);

    const sig = new SignedXml({
      privateKey: pem.privateKeyPem,
      publicCert: pem.certificatePem,
      canonicalizationAlgorithm:
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    });

    const xpath = `//*[local-name(.)='${params.referenceTag}']`;

    sig.addReference({
      xpath,
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    });

    sig.computeSignature(params.xml, {
      location: {
        reference: xpath,
        action: params.locationAction ?? 'after',
      },
    });

    const signed = sig.getSignedXml();
    if (!signed.startsWith('<?xml')) {
      return `<?xml version="1.0" encoding="UTF-8"?>${signed}`;
    }
    return signed;
  }

  verifyXmlSignature(signedXml: string): boolean {
    const doc = new DOMParser().parseFromString(signedXml, 'text/xml');
    const signatures = doc.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#',
      'Signature',
    );
    if (signatures.length === 0) {
      return false;
    }

    const sig = new SignedXml();
    sig.loadSignature(signatures[0]);
    const certPem = SignedXml.getCertFromKeyInfo(
      signatures[0].getElementsByTagNameNS(
        'http://www.w3.org/2000/09/xmldsig#',
        'KeyInfo',
      )[0],
    );
    if (!certPem) {
      return false;
    }
    sig.publicCert = certPem;
    return sig.checkSignature(signedXml);
  }
}

