/**
 * PE hygiene for the executables we ship.
 *
 * Electron's electron.exe is what BEARi.exe really is. Stamping her icon and
 * version info into it (rcedit) leaves two things stale that stricter Windows
 * App Control policies check before they will start a file: a leftover
 * Authenticode signature that no longer matches, and the PE header checksum.
 * This puts both right: the signature is removed (an unsigned file is
 * "unsigned", a mismatched one is "tampered") and the checksum is recomputed.
 *
 * Usage: node scripts/strip-signature.mjs <path-to-exe>
 * Also used by electron-builder's afterPack hook and by pack-portable.
 */
import { openSync, readSync, writeSync, closeSync, ftruncateSync, statSync, readFileSync } from 'fs'

function headerOffsets(fd) {
  const head = Buffer.alloc(0x40)
  readSync(fd, head, 0, 0x40, 0)
  if (head.readUInt16LE(0) !== 0x5a4d) throw new Error('not a PE file (no MZ)')
  const peOff = head.readUInt32LE(0x3c)
  const pe = Buffer.alloc(4)
  readSync(fd, pe, 0, 4, peOff)
  if (pe.readUInt32LE(0) !== 0x00004550) throw new Error('not a PE file')
  const optOff = peOff + 24
  const magic = Buffer.alloc(2)
  readSync(fd, magic, 0, 2, optOff)
  const pe32plus = magic.readUInt16LE(0) === 0x20b
  return { optOff, checksumOff: optOff + 64, securityDir: optOff + (pe32plus ? 112 : 96) + 4 * 8 }
}

export function stripSignature(file) {
  const fd = openSync(file, 'r+')
  try {
    const size = statSync(file).size
    const { securityDir } = headerOffsets(fd)
    const entry = Buffer.alloc(8)
    readSync(fd, entry, 0, 8, securityDir)
    const certOff = entry.readUInt32LE(0)
    const certLen = entry.readUInt32LE(4)
    if (!certOff || !certLen) return { stripped: false }
    writeSync(fd, Buffer.alloc(8), 0, 8, securityDir)
    // the certificate table sits at the very end of a signed file
    if (certOff + certLen >= size - 16) ftruncateSync(fd, certOff)
    return { stripped: true, bytesRemoved: certLen }
  } finally {
    closeSync(fd)
  }
}

/** The standard PE checksum (what imagehlp's CheckSumMappedFile computes). */
export function fixChecksum(file) {
  const data = readFileSync(file)
  const fd = openSync(file, 'r+')
  try {
    const { checksumOff } = headerOffsets(fd)
    let sum = 0
    const len = data.length
    for (let i = 0; i + 1 < len; i += 2) {
      if (i === checksumOff || i === checksumOff + 2) continue
      sum += data.readUInt16LE(i)
      sum = (sum & 0xffff) + (sum >>> 16)
    }
    if (len & 1) {
      sum += data[len - 1]
      sum = (sum & 0xffff) + (sum >>> 16)
    }
    sum = ((sum & 0xffff) + (sum >>> 16)) & 0xffff
    const checksum = (sum + len) >>> 0
    const old = data.readUInt32LE(checksumOff)
    const out = Buffer.alloc(4)
    out.writeUInt32LE(checksum, 0)
    writeSync(fd, out, 0, 4, checksumOff)
    return { old, checksum }
  } finally {
    closeSync(fd)
  }
}

export function tidyExecutable(file) {
  const s = stripSignature(file)
  const c = fixChecksum(file)
  return { ...s, ...c }
}

if (process.argv[1] && /strip-signature\.mjs$/.test(process.argv[1])) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/strip-signature.mjs <exe>')
    process.exit(1)
  }
  const r = tidyExecutable(file)
  console.log(
    `${r.stripped ? `✓ signature removed (${r.bytesRemoved} bytes); ` : ''}checksum 0x${r.old.toString(16)} -> 0x${r.checksum.toString(16)}  ${file}`
  )
}
