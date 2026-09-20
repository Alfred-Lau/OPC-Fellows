/** 用户可见产品名。内部 API、安装身份、模块字段仍用 ownworkbuddy。 */
export const PRODUCT_NAME = 'OPC-Fellows'

/**
 * 稳定安装身份（Windows AppUserModelId / electron-builder appId）。
 * 只用来认领通知和已装实例，不是产品线默认值；改掉会拆开已装用户。
 */
export const INSTALL_APP_ID = 'tech.bitou.ownworkbuddy'

/** 曾用过的本机数据目录名。展示名改了之后 Electron userData 会搬家，读档案时还要认这里。 */
export const LEGACY_USER_DATA_NAME = 'ownworkbuddy'

/**
 * 旧版 Electron userData 文件夹名。只当迁移别名去认领档案，
 * 不是当前产品名，也不进默认 catalog。
 */
export const LEGACY_PRODUCT_NAMES = ['OPC Agent Team - Solokit'] as const

/** HTTP User-Agent 产品 token，不能含空格。 */
export const PRODUCT_UA = 'OPC-Fellows'
