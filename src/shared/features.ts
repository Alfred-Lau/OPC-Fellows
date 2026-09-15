/**
 * 视图 id。曾经是写死的联合类型，模块化之后由内核在运行时给出 ——
 * 第三方模块的视图 id 编译期不可知，这里只能是 string。
 * 合法性由内核的导航贡献点兜底：认不出的 id 一律回首页。
 */
export type WorkbenchView = string

export type FeatureKind = 'view' | 'harness'

export interface WorkbenchFeature {
  id: string
  title: string
  kind: FeatureKind
  view?: WorkbenchView
  mark: string
}
