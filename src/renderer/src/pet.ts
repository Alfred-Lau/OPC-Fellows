import './theme.css'
import './pet.css'
import type { PetAlert } from '../../shared/pet'
import { activateTheme } from './theme'

const bubble = required('#bubble', HTMLElement)
const title = required('#title', HTMLElement)
const note = required('#note', HTMLElement)
const openBtn = required('#open', HTMLButtonElement)
const dismissBtn = required('#dismiss', HTMLButtonElement)
const buddy = required('#buddy', HTMLElement)

let current: PetAlert | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function showAlert(alert: PetAlert): void {
  current = alert
  document.body.classList.add('is-alert')
  buddy.classList.remove('is-pop')
  void buddy.offsetWidth
  buddy.classList.add('is-pop')
  title.textContent = alert.title
  note.textContent = alert.note ?? '点「去处理」回到待办'
  bubble.hidden = false
}

function showIdle(): void {
  current = null
  document.body.classList.remove('is-alert')
  buddy.classList.remove('is-pop')
  bubble.hidden = true
}

openBtn.addEventListener('click', () => {
  if (current) {
    void window.ownworkbuddy.pet.openTodo(current.id)
  }
})

dismissBtn.addEventListener('click', () => {
  void window.ownworkbuddy.pet.dismiss()
})

buddy.addEventListener('dblclick', () => {
  if (current) {
    return
  }
  void window.ownworkbuddy.pet.openHome()
})

window.ownworkbuddy.pet.onAlert(showAlert)
window.ownworkbuddy.pet.onIdle(showIdle)
activateTheme()
