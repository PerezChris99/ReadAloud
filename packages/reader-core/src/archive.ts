export interface ArchiveLimits {
  maxEntries?: number;
  maxExpandedBytes?: number;
  maxMemberBytes?: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_EOCD_SEARCH = 65_557;
const ZIP64_SENTINEL = 0xffffffff;

/**
 * Checks ZIP central-directory metadata before any decompression is attempted.
 * Used for untrusted DOCX/EPUB imports to prevent archive bombs and encrypted
 * archives from being expanded unboundedly in a UI process.
 */
export function assertSafeZipArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = {},
): void {
  const maxEntries = limits.maxEntries ?? 10_000;
  const maxExpandedBytes = limits.maxExpandedBytes ?? 200 * 1024 * 1024;
  const maxMemberBytes = limits.maxMemberBytes ?? 64 * 1024 * 1024;
  if (bytes.byteLength < 22) throw new Error("The document archive is incomplete.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowerBound = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  let eocd = -1;
  for (let cursor = bytes.byteLength - 22; cursor >= lowerBound; cursor -= 1) {
    if (view.getUint32(cursor, true) === EOCD_SIGNATURE) {
      const commentLength = view.getUint16(cursor + 20, true);
      if (cursor + 22 + commentLength === bytes.byteLength) {
        eocd = cursor;
        break;
      }
    }
  }
  if (eocd < 0) throw new Error("The document archive is damaged or unsupported.");

  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Multi-disk document archives are not supported.");
  }
  if (entryCount === 0xffff || centralSize === ZIP64_SENTINEL || centralOffset === ZIP64_SENTINEL) {
    throw new Error("ZIP64 document archives are not supported by this import path.");
  }
  if (entryCount > maxEntries) throw new Error("The document archive contains too many entries.");
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > bytes.byteLength) {
    throw new Error("The document archive directory is invalid.");
  }

  let cursor = centralOffset;
  let expandedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error("The document archive directory is damaged.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const expandedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if (flags & 0x1) throw new Error("Encrypted document archives are not supported.");
    if (compressedSize === ZIP64_SENTINEL || expandedSize === ZIP64_SENTINEL) {
      throw new Error("ZIP64 document archives are not supported by this import path.");
    }
    if (expandedSize > maxMemberBytes) throw new Error("A document archive entry exceeds the safe processing limit.");
    expandedTotal += expandedSize;
    if (expandedTotal > maxExpandedBytes) throw new Error("The document expands beyond the safe processing limit.");

    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > centralOffset + centralSize || next > bytes.byteLength) {
      throw new Error("The document archive directory is damaged.");
    }
    cursor = next;
  }
  if (cursor > centralOffset + centralSize) throw new Error("The document archive directory is invalid.");
}
