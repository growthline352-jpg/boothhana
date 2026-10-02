import { useEffect, useState, type TextareaHTMLAttributes } from 'react'
import { parseTextList, syncTextListDraft } from './textListEditing'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'defaultValue'> & {
  value: string[]
  change: (value: string[]) => void
}

export function TextListField({value, change, ...props}: Props) {
  const [draft, setDraft] = useState(() => value.join('\n'))
  const serialized = JSON.stringify(value)
  useEffect(() => {
    setDraft(current => syncTextListDraft(current, JSON.parse(serialized) as string[]))
  }, [serialized])
  return <textarea {...props} value={draft} onChange={event => {
    const next = event.target.value
    setDraft(next)
    change(parseTextList(next))
  }}/>
}
