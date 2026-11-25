import { register } from 'node:module'

// 通过 --import 预加载，注册 "@/..." 路径别名解析钩子。
register('./hooks.ts', import.meta.url)
