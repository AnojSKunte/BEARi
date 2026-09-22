/**
 * electron-builder afterPack hook.
 *
 * electron-builder stamps BEARi's icon and version info into electron.exe
 * with rcedit, which leaves the PE checksum zeroed. Windows App Control
 * policies (common on managed laptops, and Smart App Control) refuse to start
 * such a file; the same bytes with a valid checksum run. Fix it before the
 * installer is built so every installed copy starts.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { tidyExecutable } from './strip-signature.mjs'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  if (!existsSync(exe)) return
  const r = tidyExecutable(exe)
  console.log(`  • afterPack        fixed PE checksum ${r.old.toString(16)} -> ${r.checksum.toString(16)}${r.stripped ? ', signature stripped' : ''}  ${exe}`)
}
