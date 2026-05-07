'use client'

import { Children, ReactNode, useState } from 'react'

function Tab({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function Tabs({
  items,
  children,
}: {
  items: string[]
  children: ReactNode
}) {
  const [active, setActive] = useState(0)
  const tabs = Children.toArray(children)

  return (
    <div className="my-6">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border border-b-0"
            style={
              active === i
                ? { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderBottomColor: 'var(--surface)' }
                : { borderColor: 'transparent', color: 'var(--fg-subtle)' }
            }
          >
            {item}
          </button>
        ))}
      </div>
      {/* Active tab content */}
      <div>{tabs[active]}</div>
    </div>
  )
}

Tabs.Tab = Tab

export { Tabs }
