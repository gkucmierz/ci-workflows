import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const cliSrcDir = path.join(__dirname, 'cli')
const binDir = path.join(rootDir, 'bin')

const CLI_ENTRIES = [
  { key: 'waitBinPath', file: 'wait-for-deps.mjs' },
  { key: 'sanitizeBinPath', file: 'sanitize-check.mjs' },
  { key: 'healthcheckBinPath', file: 'post-deploy-healthcheck.mjs' }
]

const rewriteBinImportPaths = (source) =>
  source.replace(/from\s+['"]\.\.\/([^'"]+)['"]/g, "from '../src/$1'")

export const buildCliBinaries = (targetBinDir = binDir) => {
  fs.mkdirSync(targetBinDir, { recursive: true })
  const outputs = {}

  for (const entry of CLI_ENTRIES) {
    const srcPath = path.join(cliSrcDir, entry.file)
    const dstPath = path.join(targetBinDir, entry.file)
    const source = fs.readFileSync(srcPath, 'utf8')
    fs.writeFileSync(dstPath, rewriteBinImportPaths(source), { mode: 0o755 })
    outputs[entry.key] = dstPath
  }

  return outputs
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCliBinaries()
}
