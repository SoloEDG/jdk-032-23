// 让 Node 测试运行器识别源码里的 "@/..." 别名、目录 barrel 与无扩展名导入（仅测试环境使用）。
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { path as appPath } from './paths.ts'

const testsRoot = `${appPath}/tests/`

function tryResolve(specifier: string, context: { parentURL?: string }) {
  const base = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), pathToFileURL(`${appPath}/src/`)).href
    : new URL(specifier, context.parentURL).href
  const candidates = [base]
  if (!/\.[a-z]+$/i.test(base)) candidates.push(`${base}.ts`, `${base}.vue`, `${base}/index.ts`)
  for (const candidate of candidates) {
    try {
      if (existsSync(fileURLToPath(candidate))) return candidate
    } catch {
      // 非 file: URL 忽略
    }
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  const direct = tryResolve(specifier, context)
  if (direct) return nextResolve(direct, context)

  // 钩子线程中相对导入基准异常时，按 tests 根目录兜底。
  if (specifier.startsWith('.')) {
    const candidate = new URL(specifier.replace(/^\.\.\//, '').replace(/^\.\//, ''), pathToFileURL(testsRoot)).href
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate, context)
  }
  return nextResolve(specifier, context)
}
