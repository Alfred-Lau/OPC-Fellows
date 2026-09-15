/** 用户可见产品名。内部 API、appId、模块字段仍用 ownworkbuddy。 */
export const PRODUCT_NAME = 'OPC-Fellows'

/** 曾用过的本机数据目录名。展示名改了之后 Electron userData 会搬家，读档案时还要认这里。 */
export const LEGACY_USER_DATA_NAME = 'ownworkbuddy'

/** 曾用过的 Electron 产品目录名（userData 文件夹）。 */
export const LEGACY_PRODUCT_NAMES = ['OPC Agent Team - Solokit'] as const

/** HTTP User-Agent 产品 token，不能含空格。 */
export const PRODUCT_UA = 'OPC-Fellows'
