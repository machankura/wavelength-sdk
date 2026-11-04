import { Directory, File } from 'expo-file-system';

// bytesFromHex decodes a macaroon pasted as hex, the form `xxd -p` prints. A
// macaroon is binary, so it cannot be pasted any other way.
function bytesFromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('The signer macaroon must be hex.');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

// writeSignerFiles stores the signer's macaroon and TLS certificate under the
// wallet's own data directory, so removing the wallet removes them. The daemon
// opens both as plain file paths on every start, while expo-file-system wants
// file:// URIs, so this writes through one and returns the other.
export function writeSignerFiles(
  dataDir: string,
  macaroonHex: string,
  tlsCert: string,
): { macaroonPath: string; tlsCertPath: string } {
  const macaroon = bytesFromHex(macaroonHex);
  if (!tlsCert.includes('BEGIN CERTIFICATE')) {
    throw new Error('The signer TLS certificate must be PEM text.');
  }

  const base = `${dataDir.replace(/^file:\/\//, '')}/signer`;
  new Directory(`file://${base}`).create({
    intermediates: true,
    idempotent: true,
  });

  const macaroonPath = `${base}/signer.macaroon`;
  const macaroonFile = new File(`file://${macaroonPath}`);
  macaroonFile.create({ overwrite: true });
  macaroonFile.write(macaroon);

  const tlsCertPath = `${base}/tls.cert`;
  const tlsCertFile = new File(`file://${tlsCertPath}`);
  tlsCertFile.create({ overwrite: true });
  tlsCertFile.write(tlsCert);

  return { macaroonPath, tlsCertPath };
}
