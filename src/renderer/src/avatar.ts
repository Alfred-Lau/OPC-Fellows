import { agentPortrait } from '../../kernel/shared/occupation-avatar'

const portraitUrls = import.meta.glob<string>('../assets/avatars/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

function bundledPortrait(file: string): string {
  return portraitUrls[`../assets/${file}`] ?? portraitUrls['../assets/avatars/blank.png'] ?? ''
}

const DEFAULT_USER_AVATAR = bundledPortrait('avatars/user.png')
let userAvatarSrc = DEFAULT_USER_AVATAR

export function setUserAvatarSrc(src: string): void {
  userAvatarSrc = src || DEFAULT_USER_AVATAR
  for (const img of document.querySelectorAll<HTMLImageElement>('[data-user-avatar]')) {
    img.src = userAvatarSrc
  }
}

export function agentAvatarEl(input: { templateId: string; hue: number }): HTMLSpanElement {
  const avatar = document.createElement('span')
  paintAgentAvatar(avatar, input)
  return avatar
}

export function userAvatarEl(): HTMLSpanElement {
  const avatar = document.createElement('span')
  avatar.className = 'agent-avatar'
  avatar.dataset.hue = '4'
  const img = document.createElement('img')
  img.src = userAvatarSrc
  img.dataset.userAvatar = ''
  img.alt = ''
  img.draggable = false
  avatar.append(img)
  return avatar
}

export function paintAgentAvatar(
  target: HTMLElement,
  input: { templateId: string; hue: number },
): void {
  target.className = 'agent-avatar'
  target.dataset.hue = String(input.hue)
  const img = document.createElement('img')
  img.src = bundledPortrait(agentPortrait(input.templateId).file)
  img.alt = ''
  img.draggable = false
  target.replaceChildren(img)
}

/** 技能卡插图：有职业画像就用画像，第三方模块退回单字印。 */
export function moduleAvatarEl(moduleId: string, mark: string, hue = 4): HTMLSpanElement {
  const avatar = document.createElement('span')
  avatar.className = 'agent-avatar module-illus'
  avatar.dataset.hue = String(hue)
  const portrait = agentPortrait(moduleId)
  if (portrait.id === 'blank' && moduleId !== 'blank') {
    avatar.textContent = mark.slice(0, 1) || '?'
    return avatar
  }
  const img = document.createElement('img')
  img.src = bundledPortrait(portrait.file)
  img.alt = ''
  img.draggable = false
  avatar.append(img)
  return avatar
}
