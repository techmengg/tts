import './style.css'
import ePub, { type Book, type NavItem, type Rendition } from 'epubjs'

type Location = {
  start: {
    cfi: string
    href?: string
  }
}

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) {
  throw new Error('App container missing')
}

root.innerHTML = `
  <main class="canvas" aria-live="polite">
    <div class="drop-hint" id="dropHint">drop your .epub anywhere</div>
    <header class="intro">
      <div>
        <p class="eyebrow">mono shelf</p>
        <p class="lede">import an epub and read it without chrome</p>
      </div>
      <label class="import">
        <input type="file" id="epubInput" accept=".epub" />
        <span>import .epub</span>
      </label>
    </header>
    <p class="meta" id="meta">no book loaded</p>
    <div class="controls">
      <button id="prevBtn" type="button" aria-label="Previous section">&larr;</button>
      <div class="status" id="status">idle</div>
      <button id="nextBtn" type="button" aria-label="Next section">&rarr;</button>
    </div>
    <div class="toc" id="toc" aria-label="Table of contents"></div>
    <section id="viewer" class="viewer" aria-live="polite"></section>
  </main>
`

const fileInput = root.querySelector<HTMLInputElement>('#epubInput')!
const statusEl = root.querySelector<HTMLDivElement>('#status')!
const metaEl = root.querySelector<HTMLParagraphElement>('#meta')!
const tocEl = root.querySelector<HTMLDivElement>('#toc')!
const viewerEl = root.querySelector<HTMLDivElement>('#viewer')!
const dropHint = root.querySelector<HTMLDivElement>('#dropHint')!
const prevBtn = root.querySelector<HTMLButtonElement>('#prevBtn')!
const nextBtn = root.querySelector<HTMLButtonElement>('#nextBtn')!

let book: Book | null = null
let rendition: Rendition | null = null
let navLabels = new Map<string, string>()
let currentLabel = 'idle'

const setStatus = (text: string) => {
  statusEl.textContent = text
}

const setMeta = (title: string, author?: string) => {
  metaEl.textContent = author && author.trim().length > 0 ? `${title} / ${author}` : title
}

const cleanHref = (href: string) => href.split('#')[0]

const cleanText = (value: string) =>
  value
    .split('/')
    .pop()
    ?.replace(/[-_]/g, ' ')
    .replace(/\.[^.]+$/, '')
    ?.trim() ?? value

const resetBook = () => {
  navLabels = new Map()
  currentLabel = 'idle'
  tocEl.innerHTML = ''
  viewerEl.innerHTML = ''

  if (rendition) {
    rendition.destroy()
    rendition = null
  }

  if (book) {
    book.destroy()
    book = null
  }
}

const renderToc = (items: NavItem[]) => {
  tocEl.innerHTML = ''

  if (!items.length) {
    const note = document.createElement('p')
    note.className = 'toc-empty'
    note.textContent = 'continuous scroll / no markers yet'
    tocEl.appendChild(note)
    return
  }

  const fragment = document.createDocumentFragment()

  const paint = (list: NavItem[], depth = 0) => {
    list.forEach((item) => {
      const normalized = cleanHref(item.href)
      navLabels.set(normalized, item.label.trim())

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'toc-link'
      button.style.setProperty('--indent', `${depth}`)
      button.textContent = item.label
      button.addEventListener('click', () => {
        rendition?.display(item.href)
      })

      fragment.appendChild(button)

      if (item.subitems?.length) {
        paint(item.subitems, depth + 1)
      }
    })
  }

  paint(items)
  tocEl.appendChild(fragment)
}

const updateProgress = (location: Location) => {
  if (!book?.locations || typeof book.locations.length !== 'function' || !book.locations.length()) {
    return
  }

  const pct = Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100)
  const label = currentLabel || 'reading'
  setStatus(`${label} / ${pct}%`)
}

const applyTheme = () => {
  if (!rendition) {
    return
  }

  rendition.themes.default({
    body: {
      background: '#050505',
      color: '#f7f7f3',
      'font-family': '"IBM Plex Mono", "SFMono-Regular", monospace',
      'font-size': '1rem',
      'line-height': '1.7',
      'letter-spacing': '0.01em'
    },
    p: { 'margin-bottom': '1.2rem' },
    a: { color: '#a6c8ff' },
    img: { 'max-width': '100%' }
  })
}

const openBook = async (file: File) => {
  resetBook()
  setMeta(file.name)
  setStatus('loading epub...')

  try {
    const buffer = await file.arrayBuffer()
    book = ePub(buffer)
    await book.ready

    rendition = book.renderTo(viewerEl, {
      width: '100%',
      height: '100%',
      allowScriptedContent: false,
      flow: 'scrolled-doc',
      manager: 'continuous'
    })

    applyTheme()

    rendition.on('rendered', (section: { href: string }) => {
      const normalized = cleanHref(section.href)
      currentLabel = navLabels.get(normalized) ?? cleanText(normalized)
      setStatus(currentLabel)
    })

    rendition.on('relocated', (location: Location) => {
      updateProgress(location)
    })

    const navigation = await book.loaded.navigation
    renderToc(navigation.toc ?? [])

    await rendition.display()

    const metadata = await book.loaded.metadata
    const title = metadata.title?.trim() || cleanText(file.name)
    setMeta(title, metadata.creator?.trim())

    try {
      await book.locations.generate(1400)
    } catch (error) {
      console.warn('locations unavailable', error)
    }

    setStatus('use arrows, nav, or scroll freely')
  } catch (error) {
    console.error(error)
    setStatus('unable to load epub')
  } finally {
    fileInput.value = ''
  }
}

const pickAndOpen = (files: FileList | null) => {
  if (!files?.length) {
    return
  }

  const match = Array.from(files).find((candidate) => candidate.name.toLowerCase().endsWith('.epub')) ?? files[0]
  void openBook(match)
}

fileInput.addEventListener('change', () => {
  pickAndOpen(fileInput.files)
})

prevBtn.addEventListener('click', () => {
  void rendition?.prev()
})

nextBtn.addEventListener('click', () => {
  void rendition?.next()
})

window.addEventListener('keydown', (event) => {
  if (!rendition) {
    return
  }

  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
    event.preventDefault()
    void rendition.prev()
  }

  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault()
    void rendition.next()
  }
})

const preventDefault = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

const showDropState = () => {
  document.body.classList.add('dragging')
  dropHint.dataset.visible = 'true'
}

const hideDropState = () => {
  document.body.classList.remove('dragging')
  dropHint.dataset.visible = 'false'
}

;['dragenter', 'dragover'].forEach((name) => {
  document.addEventListener(name, (event) => {
    preventDefault(event)
    showDropState()
  })
})

;['dragleave', 'dragend'].forEach((name) => {
  document.addEventListener(name, (event) => {
    preventDefault(event)
    hideDropState()
  })
})

document.addEventListener('drop', (event) => {
  preventDefault(event)
  hideDropState()
  const items = event instanceof DragEvent ? event.dataTransfer?.files ?? null : null
  pickAndOpen(items)
})
