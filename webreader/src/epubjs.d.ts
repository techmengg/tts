declare module 'epubjs' {
  export interface Location {
    start: {
      cfi: string
      href?: string
    }
    end: {
      cfi: string
      href?: string
    }
  }

  export interface NavItem {
    id: string
    href: string
    label: string
    subitems?: NavItem[]
  }

  export interface Themes {
    default(theme: Record<string, Record<string, string>>): void
  }

  export interface Rendition {
    display(target?: string | number): Promise<void>
    prev(): Promise<void>
    next(): Promise<void>
    destroy(): void
    flow(value: string): void
    on(eventName: string, callback: (...args: any[]) => void): void
    themes: Themes
  }

  export interface Book {
    ready: Promise<void>
    renderTo(element: string | HTMLElement, options?: Record<string, unknown>): Rendition
    loaded: {
      metadata: Promise<{ title?: string; creator?: string }>
      navigation: Promise<{ toc: NavItem[] }>
    }
    locations: {
      generate(sections?: number): Promise<void>
      percentageFromCfi(cfi: string): number
      length(): number
    }
    destroy(): void
  }

  export default function ePub(
    input?: ArrayBuffer | string | Blob | File,
    options?: Record<string, unknown>
  ): Book

  export { Book, Rendition, NavItem }
}
