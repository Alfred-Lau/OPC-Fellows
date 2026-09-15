export interface HostStatus {
  phase: 'starting' | 'waiting' | 'ready' | 'error'
  message: string
  detail?: string
}
